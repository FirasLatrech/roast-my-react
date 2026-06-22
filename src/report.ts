import { writeFile } from 'node:fs/promises';
import type { Findings, RoastedIssue } from './types.js';
import { formatBytes } from './issues.js';

const CATEGORY_LABEL: Record<string, string> = {
  performance: 'Performance',
  accessibility: 'Accessibility',
  'best-practices': 'Best Practices',
  bundle: 'Bundle',
  rerenders: 'Re-renders',
};

/**
 * Writes a standalone, dependency-free HTML report. The hero mirrors the
 * shareable card aesthetic — a big letter grade, the three Lighthouse scores,
 * and a Core Web Vitals strip — followed by clean per-issue detail cards.
 * No external assets: the file is fully portable.
 */
export async function writeReport(
  path: string,
  findings: Findings,
  roasts: RoastedIssue[]
): Promise<string> {
  await writeFile(path, renderHtml(findings, roasts), 'utf8');
  return path;
}

function gradeOf(findings: Findings): { letter: string; color: string; weakest: string | null } {
  const scores = findings.lighthouse?.scores ?? [];
  const nums = scores.map((s) => s.score).filter((n): n is number => n !== null);
  let weakest: string | null = null;
  if (scores.length) {
    const lowest = [...scores].filter((s) => s.score !== null).sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
    if (lowest && (lowest.score ?? 100) < 90) weakest = `${lowest.title} (${lowest.score})`;
  }
  if (!nums.length) return { letter: '🔥', color: '#fb923c', weakest };
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  if (avg >= 90) return { letter: 'A', color: '#4ade80', weakest };
  if (avg >= 80) return { letter: 'B', color: '#86efac', weakest };
  if (avg >= 65) return { letter: 'C', color: '#facc15', weakest };
  if (avg >= 50) return { letter: 'D', color: '#fb923c', weakest };
  return { letter: 'F', color: '#f87171', weakest };
}

function scoreClass(score: number | null): string {
  if (score === null) return 'na';
  if (score >= 90) return 'good';
  if (score >= 50) return 'ok';
  return 'bad';
}

function renderHtml(findings: Findings, roasts: RoastedIssue[]): string {
  const g = gradeOf(findings);
  const scores = findings.lighthouse?.scores ?? [];
  const vitals = findings.lighthouse?.vitals ?? [];
  const bundle = findings.bundle;

  const scoreCards = scores
    .map(
      (s) => `
        <div class="score ${scoreClass(s.score)}">
          <div class="score-num">${s.score ?? '–'}</div>
          <div class="score-label">${esc(s.title)}</div>
        </div>`
    )
    .join('');

  const vitalsRow = vitals.length
    ? `<div class="vitals">${vitals
        .map((v) => {
          const cls = v.score === null ? 'na' : v.score >= 0.9 ? 'good' : v.score >= 0.5 ? 'ok' : 'bad';
          return `<div class="vital ${cls}"><span>${esc(v.id)}</span><b>${esc(v.displayValue)}</b></div>`;
        })
        .join('')}</div>`
    : '';

  const bundleStrip = bundle
    ? `<div class="bundle">
        <div><span>JS shipped</span><b>${formatBytes(bundle.totalJsBytes)}</b></div>
        <div><span>Transferred</span><b>${formatBytes(bundle.totalBytes)}</b></div>
        <div><span>Requests</span><b>${bundle.requestCount}</b></div>
      </div>`
    : '';

  const roastCards = roasts
    .map(
      (r, i) => `
      <article class="card">
        <header>
          <span class="tag tag-${r.category}">${esc(CATEGORY_LABEL[r.category] ?? r.category)}</span>
          <span class="num">#${String(i + 1).padStart(2, '0')}</span>
        </header>
        <p class="roast">${esc(r.roast)}</p>
        ${r.fix ? `<div class="fix"><span class="fix-label">Fix</span> ${esc(r.fix)}</div>` : ''}
        <p class="detail">${esc(r.title)}</p>
      </article>`
    )
    .join('');

  const warnings = findings.warnings.length
    ? `<div class="warnings">${findings.warnings.map((w) => `⚠️ ${esc(w)}`).join('<br>')}</div>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>🔥 Roast of ${esc(findings.title)}</title>
<style>
  :root { color-scheme: dark; --bd: #26262f; --panel: #14141b; --muted: #a1a1aa; }
  * { box-sizing: border-box; margin: 0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 80% -10%, #1a1320, #0b0b0f 60%); color: #f4f4f5; line-height: 1.55; }
  .wrap { max-width: 920px; margin: 0 auto; padding: 40px 24px 80px; }
  .brandbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .brand { font-weight: 800; font-size: 1.15rem; color: #fb923c; }
  .url { color: var(--muted); font-family: ui-monospace, monospace; font-size: 0.9rem; word-break: break-all; }

  /* Hero card — mirrors the shareable PNG card */
  .hero { background: linear-gradient(135deg, #14141b, #181320); border: 1px solid var(--bd);
    border-radius: 20px; padding: 28px 30px; display: grid; grid-template-columns: auto 1fr; gap: 30px; align-items: center; }
  .grade { font-size: 110px; font-weight: 900; line-height: 0.9; color: ${g.color}; min-width: 120px; text-align: center; }
  .grade small { display: block; font-size: 0.8rem; font-weight: 700; color: var(--muted); letter-spacing: 0.08em; margin-top: 6px; }
  .scores { display: flex; gap: 14px; flex-wrap: wrap; }
  .score { background: #1c1c24; border-radius: 12px; padding: 14px 18px; text-align: center; min-width: 92px; }
  .score-num { font-size: 2rem; font-weight: 800; }
  .score-label { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
  .score.good .score-num { color: #4ade80; } .score.ok .score-num { color: #facc15; }
  .score.bad .score-num { color: #f87171; } .score.na .score-num { color: #71717a; }
  .vitals { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .vital { background: #1c1c24; border-radius: 8px; padding: 7px 12px; text-align: center; }
  .vital span { display: block; font-size: 0.62rem; color: var(--muted); letter-spacing: 0.06em; }
  .vital b { font-size: 0.9rem; }
  .vital.good b { color: #4ade80; } .vital.ok b { color: #facc15; } .vital.bad b { color: #f87171; } .vital.na b { color: #71717a; }
  .bundle { display: flex; gap: 22px; margin-top: 16px; font-size: 0.88rem; }
  .bundle span { color: var(--muted); margin-right: 6px; }

  .weakest { margin: 18px 2px 0; color: var(--muted); font-size: 0.9rem; }
  .weakest b { color: #f87171; }
  .warnings { background: #2a2410; border: 1px solid #4a3f17; color: #fde68a; border-radius: 10px;
    padding: 12px 16px; margin: 22px 0 0; font-size: 0.85rem; }

  h2 { font-size: 1.25rem; margin: 38px 2px 16px; }
  .cards { display: grid; gap: 14px; }
  .card { background: var(--panel); border: 1px solid var(--bd); border-radius: 14px; padding: 18px 20px; }
  .card header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .num { color: #52525b; font-size: 0.8rem; font-family: ui-monospace, monospace; }
  .roast { font-size: 1.12rem; font-weight: 650; margin-bottom: 12px; }
  .fix { background: #0f1a12; border: 1px solid #1f3a26; border-radius: 10px; padding: 10px 14px; font-size: 0.92rem; }
  .fix-label { color: #4ade80; font-weight: 700; margin-right: 6px; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; }
  .detail { color: var(--muted); font-size: 0.82rem; margin-top: 10px; }
  .tag { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 3px 9px;
    border-radius: 999px; font-weight: 700; background: #26262f; color: #d4d4d8; }
  .tag-performance { background: #3b1d1d; color: #fca5a5; }
  .tag-accessibility { background: #1d2e3b; color: #93c5fd; }
  .tag-best-practices { background: #1d3b2a; color: #a7f3d0; }
  .tag-bundle { background: #3b321d; color: #fcd34d; }
  .tag-rerenders { background: #2e1d3b; color: #d8b4fe; }

  footer { text-align: center; color: #52525b; margin-top: 52px; font-size: 0.82rem; }
  footer a { color: var(--muted); }
  @media (max-width: 680px) { .hero { grid-template-columns: 1fr; text-align: center; } .scores { justify-content: center; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="brandbar">
      <span class="brand">🔥 roast-my-react</span>
      <span class="url">${esc(findings.url)}</span>
    </div>

    <section class="hero">
      <div class="grade">${g.letter}<small>GRADE</small></div>
      <div>
        <div class="scores">${scoreCards || '<div class="score na"><div class="score-num">–</div><div class="score-label">No Lighthouse</div></div>'}</div>
        ${vitalsRow}
        ${bundleStrip}
      </div>
    </section>

    ${g.weakest ? `<p class="weakest">Weakest area: <b>${esc(g.weakest)}</b></p>` : ''}
    ${warnings}

    <h2>${roasts.length} issue${roasts.length === 1 ? '' : 's'} worth roasting</h2>
    <div class="cards">${roastCards || '<p style="color:#4ade80">Nothing to roast. Suspicious. 🧐</p>'}</div>

    <footer>
      Generated by <a href="https://www.npmjs.com/package/roast-my-react">roast-my-react</a> ·
      run <code>npx roast-my-react</code> on your own app.
    </footer>
  </div>
</body>
</html>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
