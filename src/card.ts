import { chromium } from 'playwright';
import type { Findings, RoastedIssue } from './types.js';

/**
 * Renders a shareable 1200×630 PNG "roast card" (Twitter/OG size) by laying out
 * a tiny HTML card and screenshotting it with Playwright — no extra deps, no
 * canvas. Perfect for posting your app's grade + best burns.
 */
export async function renderCard(
  findings: Findings,
  roasts: RoastedIssue[],
  path: string
): Promise<string> {
  const html = cardHtml(findings, roasts);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  } finally {
    await browser.close().catch(() => {});
  }
  return path;
}

function grade(findings: Findings): { letter: string; color: string } {
  const nums = (findings.lighthouse?.scores ?? [])
    .map((s) => s.score)
    .filter((n): n is number => n !== null);
  if (!nums.length) return { letter: '🔥', color: '#fb923c' };
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (avg >= 90) return { letter: 'A', color: '#4ade80' };
  if (avg >= 80) return { letter: 'B', color: '#86efac' };
  if (avg >= 65) return { letter: 'C', color: '#facc15' };
  if (avg >= 50) return { letter: 'D', color: '#fb923c' };
  return { letter: 'F', color: '#f87171' };
}

function cardHtml(findings: Findings, roasts: RoastedIssue[]): string {
  const g = grade(findings);
  const scores = findings.lighthouse?.scores ?? [];
  const scoreHtml = scores
    .map((s) => {
      const c = s.score === null ? '#71717a' : s.score >= 90 ? '#4ade80' : s.score >= 50 ? '#facc15' : '#f87171';
      return `<div class="s"><div class="sn" style="color:${c}">${s.score ?? '–'}</div><div class="sl">${esc(s.title)}</div></div>`;
    })
    .join('');

  const topRoasts = roasts
    .slice(0, 3)
    .map((r) => `<li>${esc(r.roast)}</li>`)
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; background: linear-gradient(135deg,#0b0b0f,#1a1320);
      color: #f4f4f5; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      padding: 56px 64px; display: flex; flex-direction: column; justify-content: space-between; }
    .top { display: flex; align-items: center; justify-content: space-between; }
    .brand { font-size: 30px; font-weight: 800; color: #fb923c; }
    .url { color: #a1a1aa; font-size: 22px; font-family: ui-monospace, monospace; max-width: 620px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .grade { font-size: 132px; font-weight: 900; line-height: 1; color: ${g.color}; }
    .mid { display: flex; align-items: center; gap: 48px; }
    .scores { display: flex; gap: 28px; }
    .s { text-align: center; } .sn { font-size: 52px; font-weight: 800; } .sl { font-size: 17px; color: #a1a1aa; }
    ul { list-style: none; display: flex; flex-direction: column; gap: 12px; }
    li { font-size: 26px; font-weight: 600; line-height: 1.25; }
    li::before { content: "🔥 "; }
    .foot { color: #71717a; font-size: 20px; }
  </style></head><body>
    <div class="top"><div class="brand">🔥 roast-my-react</div><div class="url">${esc(findings.url)}</div></div>
    <div class="mid"><div class="grade">${g.letter}</div><div class="scores">${scoreHtml}</div></div>
    <ul>${topRoasts || '<li>flawless — nothing to roast 🧐</li>'}</ul>
    <div class="foot">npx roast-my-react · roast your own app</div>
  </body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
