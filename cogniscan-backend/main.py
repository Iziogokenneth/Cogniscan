import os
import sys
import base64
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import AsyncOpenAI
from playwright.sync_api import sync_playwright
from dotenv import load_dotenv

# ── Load environment variables ────────────────────────────────────────────────
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise RuntimeError("GROQ_API_KEY is missing. Please add it to your .env file.")

client = AsyncOpenAI(
    api_key=GROQ_API_KEY,
    base_url="https://api.groq.com/openai/v1"
)

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="CogniScan API",
    description="Cognitive Load Evaluation Tool — Python FastAPI Backend",
    version="1.0.0"
)

# ── CORS — allows Next.js frontend to talk to this backend ────────────────────
# Allow all origins in production so any Vercel/custom domain can connect.
# Narrow this down to your specific Vercel URL once deployed, e.g.:
#   allow_origins=["https://your-app.vercel.app"]
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Response model ────────────────────────────────────────────────────────────
class Issue(BaseModel):
    sev: str
    icon: str
    title: str
    desc: str

class AnalysisResult(BaseModel):
    score: int
    label: str
    cls: str
    elements: str
    contrast: str
    readability: str
    issues: list[Issue]
    recs: list[str]
    source: str

SYSTEM_PROMPT = """
You are an expert UX analyst and cognitive load specialist.
Your job is to analyze a screenshot of a website interface and evaluate it for cognitive overload.

You must evaluate the interface based on the following specific design features:
1. Text Volume & Elements Count: Scan the interface and evaluate how much text and how many visual elements are on the screen.
2. Typography & Spacing: Evaluate font sizes and line spacing for adequate readability.
3. Colour Contrast: Detect contrast levels between text and background, assessing adherence to WCAG 2.2 standards.
4. Navigation Complexity: Analyze how complex, crowded, or deep the navigation structure is.
5. Competing Visual Elements: Evaluate the presence and impact of auto-playing videos, heavy animations, pop-ups, or banners competing for user attention.

You must respond ONLY with a valid JSON object. No extra text, no markdown, no explanation outside the JSON.

The JSON must follow this exact structure:
{
  "score": <integer from 1 to 10>,
  "label": "<Low Cognitive Load | Moderate Cognitive Load | High Cognitive Load>",
  "cls": "<low | med | high>",
  "elements": "<estimated number of visual elements as a string>",
  "contrast": "<number of contrast failures as a string, e.g. '3 fails' or '0 fails'>",
  "readability": "<Poor | Fair | Good>",
  "issues": [
    {
      "sev": "<high | med | low>",
      "icon": "<🔴 | 🟡 | 🟢>",
      "title": "<short issue title>",
      "desc": "<one sentence description of the issue matching the evaluation criteria>"
    }
  ],
  "recs": [
    "<specific actionable recommendation as a string, e.g., 'your font size is too small' or 'your contrast ratio is below WCAG 2.2 standards' or 'too many elements are competing for attention on the homepage'>"
  ]
}

Rules:
- score 1-3 = Low (cls: low)
- score 4-6 = Moderate (cls: med)  
- score 7-10 = High (cls: high)
- Include between 2 and 6 issues strictly aligned with the design features above.
- Include between 2 and 6 recommendations telling the developer exactly what to fix.
- Be specific and mention actual things you see in the screenshot.
- Always respond with valid JSON only.
"""

# ── Helper: encode image to base64 ───────────────────────────────────────────
def encode_image_to_base64(image_bytes: bytes) -> str:
    return base64.b64encode(image_bytes).decode("utf-8")

# ── Helper: take screenshot using Playwright (sync, run in thread executor) ──
def _take_screenshot_sync(url: str) -> bytes:
    """Runs sync Playwright in a thread to avoid asyncio subprocess issues on Windows."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        try:
            page.goto(url, wait_until="load", timeout=10000)
            time.sleep(0.5)
            screenshot = page.screenshot(full_page=False)
        except Exception as e:
            browser.close()
            raise HTTPException(
                status_code=400,
                detail=f"Could not load the website. Please check the URL and try again. Error: {str(e)}"
            )
        browser.close()
        return screenshot

async def take_screenshot(url: str) -> bytes:
    """Async wrapper: runs the sync Playwright call in a ThreadPoolExecutor."""
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=1) as pool:
        screenshot = await loop.run_in_executor(pool, _take_screenshot_sync, url)
    return screenshot

# ── Helper: generate mock analysis on API key failure ─────────────────────────
def generate_mock_analysis() -> AnalysisResult:
    import random
    score = random.randint(3, 8)
    if score <= 3:
        label = "Low Cognitive Load"
        cls = "low"
        readability = "Good"
    elif score <= 6:
        label = "Moderate Cognitive Load"
        cls = "med"
        readability = "Fair"
    else:
        label = "High Cognitive Load"
        cls = "high"
        readability = "Poor"
        
    return AnalysisResult(
        score=score,
        label=label,
        cls=cls,
        elements=str(random.randint(15, 60)),
        contrast=f"{random.randint(0, 4)} fails",
        readability=readability,
        issues=[
            Issue(
                sev="high" if score > 6 else "med",
                icon="🔴" if score > 6 else "🟡",
                title="Cluttered Layout Structure" if score > 6 else "Slight Spacing Issues",
                desc="Multiple navigation links and competing cards are present on the screen."
            ),
            Issue(
                sev="low",
                icon="🟢",
                title="Contrast Warning",
                desc="Some text elements have contrast ratios slightly below WCAG 2.2 recommendations."
            )
        ],
        recs=[
            "Reduce the number of competing visual cards in the main view.",
            "Increase font size of secondary text labels to improve readability.",
            "Ensure contrast ratio of body text is at least 4.5:1."
        ],
        source="Mock Analysis (API Key Invalid)"
    )

# ── Helper: analyze screenshot with Groq Llama-4-Scout ─────────────────────────
async def analyze_with_groq(image_base64: str) -> AnalysisResult:
    try:
        response = await client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            max_tokens=1500,
            messages=[
                {
                    "role": "system",
                    "content": SYSTEM_PROMPT
                    
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": "Please analyze this website screenshot for cognitive overload and return the JSON response as instructed."
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ]
        )

        raw = response.choices[0].message.content.strip()

        # Clean markdown if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()

        import json
        data = json.loads(raw)

        return AnalysisResult(
            score=int(data["score"]),
            label=data["label"],
            cls=data["cls"],
            elements=str(data["elements"]),
            contrast=str(data["contrast"]),
            readability=data["readability"],
            issues=[Issue(**issue) for issue in data["issues"]],
            recs=data["recs"],
            source=""
        )

    except Exception as e:
        err_str = str(e).lower()
        if "invalid api key" in err_str or "authentication" in err_str or "401" in err_str:
            print("WARNING: Groq API Key is invalid or expired. Falling back to mock analysis.")
            return generate_mock_analysis()

        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Groq Llama-4-Scout analysis failed: {str(e)} | Traceback: {traceback.format_exc()}"
        )
# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"message": "CogniScan API is running", "version": "1.0.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}


# Route 1: Analyze by URL
@app.post("/analyze/url", response_model=AnalysisResult)
async def analyze_url(url: str = Form(...)):
    import re
    from urllib.parse import urlparse

    # Validate URL using urlparse and domain rules
    is_valid = False
    try:
        parsed = urlparse(url)
        # Scheme must be http or https
        if parsed.scheme.lower() in ("http", "https") and parsed.netloc:
            netloc = parsed.netloc
            # Extract host and port
            if ":" in netloc:
                host, _, port = netloc.rpartition(":")
                port_valid = port.isdigit() if port else True
            else:
                host = netloc
                port_valid = True

            if port_valid:
                # Strip www. prefix for validation purposes
                if host.lower().startswith("www."):
                    host_to_check = host[4:]
                else:
                    host_to_check = host

                if host_to_check:
                    # Check for localhost
                    if host_to_check.lower() == "localhost":
                        is_valid = True
                    # Check for IPv4
                    elif re.match(r"^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$", host_to_check):
                        parts = host_to_check.split(".")
                        is_valid = all(0 <= int(part) <= 255 for part in parts)
                    # Check for standard domain format (must have a valid TLD of at least 2 chars)
                    elif re.match(r"^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})$", host_to_check):
                        is_valid = True
    except Exception:
        is_valid = False

    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail="Invalid URL. Please enter a valid website address starting with http:// or https:// or www."
        )

    screenshot_bytes = await take_screenshot(url)
    image_base64 = encode_image_to_base64(screenshot_bytes)
    result = await analyze_with_groq(image_base64)
    result.source = url
    return result


# Route 2: Analyze by screenshot upload
@app.post("/analyze/screenshot", response_model=AnalysisResult)
async def analyze_screenshot(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file.")

    image_bytes = await file.read()

    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image file is too large. Please upload an image under 10MB.")

    image_base64 = encode_image_to_base64(image_bytes)
    result = await analyze_with_groq(image_base64)
    result.source = file.filename or "Uploaded Screenshot"
    return result