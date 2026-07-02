export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

export async function analyzeByUrl(url: string) {
  const fd = new FormData();
  fd.append('url', url);

  const res = await fetch(`${API_BASE}/analyze/url`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function analyzeScreenshot(file: File) {
  const fd = new FormData();
  fd.append('file', file);

  const res = await fetch(`${API_BASE}/analyze/screenshot`, {
    method: 'POST',
    body: fd,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  return res.json();
}
