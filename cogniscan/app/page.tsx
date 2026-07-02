"use client";

import React, { useState, useRef, useEffect } from 'react';
import { analyzeByUrl, analyzeScreenshot } from '../lib/api';
import styles from './page.module.css';

type Issue = {
  sev: 'high' | 'med' | 'low';
  icon: string;
  title: string;
  desc: string;
};

type Result = {
  score: number;
  label: string;
  cls: 'high' | 'med' | 'low';
  elements: string;
  contrast: string;
  readability: string;
  issues: Issue[];
  recs: string[];
};

type ApiResponse = {
  score: number;
  label: string;
  cls: 'high' | 'med' | 'low';
  elements: string | number;
  contrast: string | number;
  readability: string;
  issues?: Issue[];
  recs?: string[];
  source?: string;
};

const STEPS: string[] = [
  'Capturing interface data',
  'Extracting design features',
  'Sending to Groq Llama-4-Scout Vision',
  'Calculating cognitive load score',
  'Generating recommendations',
];

const FEATURES = [
  {
    title: 'Groq Llama-4-Scout AI',
    desc: 'Ultra-fast vision model that analyzes any interface with precision and speed.'
  },
  {
    title: 'Scored 1-10',
    desc: 'Clear cognitive load scores that instantly show how overwhelming a UI is.'
  },
  {
    title: 'Fix Instructions',
    desc: 'Specific, actionable fixes ready to hand straight to your design team.'
  },
  {
    title: 'Instant Analysis',
    desc: 'Results in under 3 seconds — fast enough for every design iteration.'
  },
  {
    title: 'WCAG 2.2 Standards',
    desc: 'Grounded in internationally recognized accessibility and usability guidelines.'
  },
  {
    title: 'Research-Backed',
    desc: 'Built on Cognitive Load Theory and decades of modern UX research.'
  }
];

const FEATURE_ICONS = [
  // 0: Groq Llama-4-Scout AI (Purple)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5c54f2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
      <rect x="9" y="9" width="6" height="6"/>
      <line x1="9" y1="1" x2="9" y2="4"/>
      <line x1="15" y1="1" x2="15" y2="4"/>
      <line x1="9" y1="20" x2="9" y2="23"/>
      <line x1="15" y1="20" x2="15" y2="23"/>
      <line x1="20" y1="9" x2="23" y2="9"/>
      <line x1="20" y1="15" x2="23" y2="15"/>
      <line x1="1" y1="9" x2="4" y2="9"/>
      <line x1="1" y1="15" x2="4" y2="15"/>
    </svg>
  ),
  // 1: Scored 1-10 (Blue)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  // 2: Fix Instructions (Green)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  // 3: Instant Analysis (Yellow)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  // 4: WCAG 2.2 Standards (Magenta)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#db2777" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <path d="m9 11 2 2 4-4"/>
    </svg>
  ),
  // 5: Research-Backed (Red/Pink)
  () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e11d48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/>
    </svg>
  ),
];

const FEATURE_COLORS = [
  styles.iconPurple,
  styles.iconBlue,
  styles.iconGreen,
  styles.iconYellow,
  styles.iconMagenta,
  styles.iconRed,
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const [url, setUrl] = useState<string>('');
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [activeStep, setActiveStep] = useState<number>(-1);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [source, setSource] = useState<string>('');
  const [urlError, setUrlError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // Dynamic loading steps effect
  useEffect(() => {
    if (!loading) return;
    
    const interval = setInterval(() => {
      setActiveStep((prev) => {
        if (prev < STEPS.length - 1) {
          const nextStep = prev + 1;
          setDoneSteps((done) => {
            if (!done.includes(prev)) {
              return [...done, prev];
            }
            return done;
          });
          return nextStep;
        }
        return prev;
      });
    }, 2200);
    
    return () => clearInterval(interval);
  }, [loading]);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Only image files are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setFile(file);
  }

  async function startScan(type: 'url' | 'upload') {
    let finalUrl = url.trim();

    if (type === 'url') {
      if (!finalUrl) {
        setUrlError("Invalid URL. Please enter a valid website address starting with http:// or https:// or www.");
        document.getElementById('urlInput')?.focus();
        return;
      }

      // Normalise URL starting with www. by prepending https://
      let normalizedUrl = finalUrl;
      if (/^www\./i.test(finalUrl)) {
        normalizedUrl = 'https://' + finalUrl;
      }

      // Check if starts with http:// or https:// after possible normalization
      if (!/^https?:\/\//i.test(normalizedUrl)) {
        setUrlError("Invalid URL. Please enter a valid website address starting with http:// or https:// or www.");
        document.getElementById('urlInput')?.focus();
        return;
      }

      // Validate URL format using standard URL parsing and domain/IP rules
      let isValid = false;
      try {
        const parsed = new URL(normalizedUrl);
        const hostname = parsed.hostname;
        
        if (hostname.toLowerCase() === 'localhost') {
          isValid = true;
        } else {
          // Check if host is valid IPv4
          const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
          const ipMatch = hostname.match(ipv4Regex);
          if (ipMatch) {
            isValid = ipMatch.slice(1).every(part => {
              const num = parseInt(part, 10);
              return num >= 0 && num <= 255;
            });
          } else {
            // Check if valid domain format (at least one dot, TLD at least 2 letters)
            const domainRegex = /^([a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})$/;
            isValid = domainRegex.test(hostname);
          }
        }
      } catch (e) {
        isValid = false;
      }

      if (!isValid) {
        setUrlError("Invalid URL. Please enter a valid website address starting with http:// or https:// or www.");
        document.getElementById('urlInput')?.focus();
        return;
      }

      // Clear any prior validation errors
      setUrlError(null);

      // Normalise URL for frontend processing and passing to backend
      finalUrl = normalizedUrl;
    }

    if (type === 'upload' && !file) {
      alert('Please select or drop an image first.');
      return;
    }

    const src = type === 'url' ? finalUrl : file?.name || 'Uploaded Screenshot';
    setSource(src);
    setLoading(true);
    setActiveStep(0);
    setDoneSteps([]);
    setResult(null);

    try {
      let data: ApiResponse | null = null;
      if (type === 'url') {
        data = await analyzeByUrl(finalUrl);
      } else {
        data = await analyzeScreenshot(file as File);
      }

      if (data) {
        // Mark all steps as complete for visual satisfaction
        setDoneSteps(STEPS.map((_, idx) => idx));
        setActiveStep(STEPS.length);
        
        // Wait a brief moment so the user sees the completed steps before showing the dashboard
        await new Promise(resolve => setTimeout(resolve, 600));

        setResult({
          score: data.score,
          label: data.label,
          cls: data.cls,
          elements: String(data.elements),
          contrast: String(data.contrast),
          readability: data.readability,
          issues: data.issues || [],
          recs: data.recs || [],
        });
        setSource(data.source || src);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'Analysis failed.';
      alert(errMsg);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setLoading(false);
    setUrl('');
    setPreview(null);
    setFile(null);
    setActiveStep(-1);
    setDoneSteps([]);
    setActiveTab('url');
    setUrlError(null);
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.orb} ${styles.orb1}`} />
      <div className={`${styles.orb} ${styles.orb2}`} />

      {/* NAV */}
      <nav className={styles.nav}>
        <div className={styles.logo}>
          <svg className={styles.logoSvg} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="40" height="40" rx="8" fill="#5c54f2"/>
            <circle cx="20" cy="20" r="10" stroke="white" strokeWidth="2.5"/>
            <rect x="15" y="15" width="10" height="10" transform="rotate(45 20 20)" stroke="white" strokeWidth="2"/>
            <circle cx="20" cy="20" r="2.5" fill="white"/>
          </svg>
          CogniScan
        </div>
        <span className={styles.navBadge}>
          <span className={styles.navBadgeDot} /> AI-Powered — Groq Llama-4-Scout
        </span>
      </nav>

      {/* HERO */}
      <section className={styles.hero}>
        <div className={styles.heroTag}>
          <svg className={styles.heroTagIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '2px' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" fill="none"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <line x1="9" y1="9" x2="21" y2="9"/>
          </svg>
          Cognitive Load Evaluation Tool
        </div>
        <h1 className={styles.heroTitle}>
          Detect <span className={styles.gradient}>Information Overload in Any Website</span>
        </h1>
        <p className={styles.heroDesc}>
          Paste a URL or upload a screenshot. Our AI analyzes the interface for cognitive overload in seconds.
        </p>
      </section>

      {/* INPUT */}
      {!result && (
        <section className={styles.inputSection}>
          <div className={styles.inputCard}>
            {!loading && (
              <>
                <div className={styles.tabRow}>
                  <button
                    className={`${styles.tabBtn} ${activeTab === 'url' ? styles.tabActive : ''}`}
                    onClick={() => {
                      setActiveTab('url');
                      setUrlError(null);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    Enter URL
                  </button>
                  <button
                    className={`${styles.tabBtn} ${activeTab === 'upload' ? styles.tabActive : ''}`}
                    onClick={() => {
                      setActiveTab('upload');
                      setUrlError(null);
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    Upload Screenshot
                  </button>
                </div>

                {activeTab === 'url' && (
                  <div className={styles.urlContainer}>
                    <div className={styles.urlWrap}>
                      <input
                        id="urlInput"
                        className={`${styles.urlInput} ${urlError ? styles.urlInputError : ''}`}
                        type="url"
                        placeholder="https://example.com"
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          if (urlError) setUrlError(null);
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && startScan('url')}
                        autoComplete="off"
                        spellCheck={false}
                        autoCorrect="off"
                      />
                      <button className={styles.scanBtn} onClick={() => startScan('url')}>
                        <svg className={styles.scanBtnIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                          <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                          <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                          <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                          <circle cx="12" cy="12" r="2" />
                        </svg>
                        Scan Now
                      </button>
                    </div>
                    {urlError && (
                      <p className={styles.urlErrorText}>{urlError}</p>
                    )}
                  </div>
                )}

                {activeTab === 'upload' && (
                  <>
                    <div
                      className={styles.uploadZone}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileRef.current?.click()}
                    >
                      <input
                        type="file"
                        accept="image/*"
                        ref={fileRef}
                        onChange={handleFile}
                        style={{ display: 'none' }}
                      />
                      <div className={styles.uploadIcon}>📁</div>
                      <p>
                        <strong>Drop a screenshot here</strong>
                        <br />
                        or click to browse
                      </p>
                      {preview && (
                        <div className={styles.previewWrap}>
                          <img src={preview} alt="Preview" className={styles.previewImg} />
                        </div>
                      )}
                    </div>
                    {preview && (
                      <button className={styles.uploadScanBtn} onClick={() => startScan('upload')}>
                        Analyze Screenshot →
                      </button>
                    )}
                  </>
                )}
              </>
            )}

            {loading && (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <p className={styles.loadingText}>Analyzing interface...</p>
                <div className={styles.loadingSteps}>
                  {STEPS.map((step, i) => (
                    <div
                      key={i}
                      className={`${styles.loadingStep} ${doneSteps.includes(i) ? styles.stepDone : ''} ${
                        activeStep === i ? styles.stepActive : ''
                      }`}
                    >
                      <div className={styles.stepDot} />
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* RESULTS */}
      {result && (
        <section className={styles.resultsSection}>
          <div className={styles.resultCard}>
            <div className={styles.resultHeader}>
              <div>
                <div className={styles.resultTitle}>Analysis Complete</div>
                <div className={styles.resultUrl}>
                  {source.length > 55 ? source.substring(0, 55) + '...' : source}
                </div>
              </div>

              <div className={`${styles.scoreBadge} ${styles[result.cls]}`}>
                <div className={styles.scoreNumber}>{result.score}</div>
                <div className={styles.scoreLabel}>{result.label}</div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className={styles.metricsGrid}>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{result.elements}</span>
                <span className={styles.metricLabel}>Visual Elements</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{result.contrast}</span>
                <span className={styles.metricLabel}>Contrast Failures</span>
              </div>
              <div className={styles.metricCard}>
                <span className={styles.metricValue}>{result.readability}</span>
                <span className={styles.metricLabel}>Readability</span>
              </div>
            </div>

            <div className={styles.resultBody}>
              <div className={styles.divider} />

              {/* Key Issues Identified */}
              {result.issues && result.issues.length > 0 && (
                <div className={styles.issuesSection}>
                  <h3 className={styles.sectionTitle}>🔴 Key Design Issues</h3>
                  <div className={styles.issuesList}>
                    {result.issues.map((issue, idx) => (
                      <div key={idx} className={styles.issueItem}>
                        <span className={styles.issueIcon}>{issue.icon || '⚠️'}</span>
                        <div className={styles.issueContent}>
                          <div className={styles.issueHeader}>
                            <span className={styles.issueTitle}>{issue.title}</span>
                            <span className={`${styles.issueSevPill} ${styles[issue.sev]}`}>
                              {issue.sev}
                            </span>
                          </div>
                          <p className={styles.issueDesc}>{issue.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.divider} />
                </div>
              )}

              {/* Actionable Recommendations */}
              {result.recs && result.recs.length > 0 && (
                <div className={styles.recsSection}>
                  <h3 className={styles.sectionTitle}>💡 Actionable Fixes</h3>
                  <div className={styles.recsList}>
                    {result.recs.map((rec, idx) => (
                      <div key={idx} className={styles.recItem}>
                        <span className={styles.recCheck}>✓</span>
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.divider} />
                </div>
              )}
            </div>

            <button className={styles.retryBtn} onClick={reset}>
              ← Analyze Another Website
            </button>
          </div>
        </section>
      )}

      {/* STATS BANNER & FEATURES (Landing Page Only) */}
      {!result && !loading && (
        <>
          <section className={styles.statsBanner}>
            <div className={styles.statsContainer}>
              <div className={styles.statItem}>
                <div className={styles.statVal}>10K+</div>
                <div className={styles.statLabel}>SITES ANALYZED</div>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <div className={styles.statVal}>1-10</div>
                <div className={styles.statLabel}>SCORE RANGE</div>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <div className={styles.statVal}>{"< 3s"}</div>
                <div className={styles.statLabel}>ANALYSIS TIME</div>
              </div>
              <div className={styles.statDivider} />
              <div className={styles.statItem}>
                <div className={styles.statVal}>WCAG 2.2</div>
                <div className={styles.statLabel}>STANDARDS-BACKED</div>
              </div>
            </div>
          </section>

          <section className={styles.features}>
            {FEATURES.map((f, i) => (
              <div key={i} className={styles.featureCard}>
                <div className={`${styles.featureIcon} ${FEATURE_COLORS[i]}`}>
                  {FEATURE_ICONS[i]()}
                </div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </section>
        </>
      )}

      {/* FOOTER */}
      <footer className={styles.footer}>CogniScan — Cognitive Load Evaluation Tool</footer>
    </div>
  );
}