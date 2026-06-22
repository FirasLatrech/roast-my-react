import chalk, { type ChalkInstance } from 'chalk';
import type { CategoryScore, Findings, IssueCategory, RoastedIssue } from './types.js';
import { formatBytes } from './issues.js';

/**
 * Terminal presentation — a clean "diagnosis report" layout inspired by
 * react-doctor / clig.dev: a boxed summary panel, issues grouped by category
 * with counts, calm color that respects NO_COLOR, and a closing prescription.
 */

const CATEGORY: Record<IssueCategory, { label: string; color: ChalkInstance; dot: string }> = {
  performance: { label: 'Performance', color: chalk.hex('#fca5a5'), dot: '●' },
  accessibility: { label: 'Accessibility', color: chalk.hex('#93c5fd'), dot: '●' },
  'best-practices': { label: 'Best Practices', color: chalk.hex('#a7f3d0'), dot: '●' },
  bundle: { label: 'Bundle', color: chalk.hex('#fcd34d'), dot: '●' },
  rerenders: { label: 'Re-renders', color: chalk.hex('#d8b4fe'), dot: '●' },
};
const CATEGORY_ORDER: IssueCategory[] = ['performance', 'accessibility', 'best-practices', 'bundle', 'rerenders'];

const PAD = '  ';
const WIDTH = 64; // inner width of panels / rules

export function renderHeader(url: string): void {
  console.log('');
  console.log(`${PAD}${chalk.hex('#fb923c').bold('🔥 roast-my-react')}  ${chalk.dim('· react performance diagnosis')}`);
  console.log(`${PAD}${chalk.dim('Diagnosing')} ${chalk.cyan(url)}`);
}

/** The boxed "Diagnosis" summary panel: grade, scores, vitals, bundle. */
export function renderScores(findings: Findings, issueCount: number): void {
  const scores = findings.lighthouse?.scores ?? [];
  const { grade, color, avg } = gradeOf(scores);

  const lines: string[] = [];

  // Grade + verdict line.
  const gradeBadge = avg === null ? chalk.hex('#fb923c').bold('🔥 quick scan') : color.bold(`${grade}  grade`);
  const verdict =
    issueCount === 0 ? chalk.green('flawless — nothing to roast') : chalk.dim(`${issueCount} issue${issueCount === 1 ? '' : 's'} found`);
  lines.push(`${gradeBadge}    ${verdict}`);

  // Lighthouse scores.
  if (scores.length) {
    lines.push(
      scores
        .map((s) => `${scoreColor(s.score).bold(String(s.score ?? '–'))} ${chalk.dim(shortCat(s.id))}`)
        .join(chalk.dim('  ·  '))
    );
  }

  // Core Web Vitals — show the 4 headline metrics so the panel stays aligned.
  const vitals = (findings.lighthouse?.vitals ?? []).slice(0, 4);
  if (vitals.length) {
    lines.push(
      vitals
        .map((v) => {
          const c = v.score === null ? chalk.gray : v.score >= 0.9 ? chalk.green : v.score >= 0.5 ? chalk.yellow : chalk.red;
          return `${chalk.dim(v.id)} ${c(v.displayValue)}`;
        })
        .join(chalk.dim('  ·  '))
    );
  }

  // Bundle.
  const b = findings.bundle;
  if (b) {
    lines.push(
      `${chalk.hex('#fcd34d').bold(formatBytes(b.totalJsBytes))} ${chalk.dim('JS')}  ·  ${chalk.dim(`${b.requestCount} requests`)}  ·  ${chalk.dim(formatBytes(b.totalBytes) + ' transferred')}`
    );
  }

  console.log('');
  panel('Diagnosis', lines, color);
}

/** Compact per-route table when auditing multiple routes. */
export function renderRouteSummary(rows: Array<{ url: string; findings: Findings; issueCount: number }>): void {
  const lines = rows.map((r) => {
    const { grade, color } = gradeOf(r.findings.lighthouse?.scores ?? []);
    const scores = r.findings.lighthouse?.scores ?? [];
    const perf = scores.find((s) => s.id === 'performance')?.score;
    const a11y = scores.find((s) => s.id === 'accessibility')?.score;
    const js = r.findings.bundle ? formatBytes(r.findings.bundle.totalJsBytes) : '—';
    return `${color.bold(grade)}  ${chalk.white(safePath(r.url).padEnd(22))} ${chalk.dim(`perf ${perf ?? '–'} · a11y ${a11y ?? '–'} · ${js} · ${r.issueCount} issue${r.issueCount === 1 ? '' : 's'}`)}`;
  });
  console.log('');
  panel(`${rows.length} routes`, lines, chalk.cyan);
}

/** A colored A–F grade derived from the Lighthouse score average. */
export function gradeOf(scores: CategoryScore[]): { grade: string; color: ChalkInstance; avg: number | null } {
  const nums = scores.map((s) => s.score).filter((n): n is number => n !== null);
  const avg = nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
  let grade = '?';
  let color = chalk.gray;
  if (avg !== null) {
    if (avg >= 90) { grade = 'A'; color = chalk.green; }
    else if (avg >= 80) { grade = 'B'; color = chalk.greenBright; }
    else if (avg >= 65) { grade = 'C'; color = chalk.yellow; }
    else if (avg >= 50) { grade = 'D'; color = chalk.hex('#fb923c'); }
    else { grade = 'F'; color = chalk.red; }
  }
  return { grade, color, avg };
}

/** The diagnosis: issues grouped by category, each with its roast + fix. */
export function renderRoasts(roasts: RoastedIssue[]): void {
  if (roasts.length === 0) {
    console.log('');
    console.log(`${PAD}${chalk.green.bold('✓ Clean bill of health — nothing to roast.')}`);
    console.log('');
    return;
  }
  renderGroups(roasts, true);
}

/** Findings grouped by category, no AI text (used for --no-ai / no key). */
export function renderRawFindings(issues: Array<{ title: string; category: IssueCategory }>): void {
  renderGroups(issues.map((i) => ({ ...i, roast: '', fix: '' })) as RoastedIssue[], false);
}

function renderGroups(items: RoastedIssue[], withRoast: boolean): void {
  const byCat = new Map<IssueCategory, RoastedIssue[]>();
  for (const it of items) {
    const list = byCat.get(it.category) ?? [];
    list.push(it);
    byCat.set(it.category, list);
  }

  for (const cat of CATEGORY_ORDER) {
    const list = byCat.get(cat);
    if (!list || list.length === 0) continue;
    const style = CATEGORY[cat];
    console.log('');
    console.log(sectionHeader(style.label.toUpperCase(), list.length, style.color));
    for (const it of list) {
      const head = withRoast && it.roast ? it.roast : it.title;
      console.log(`${PAD}${style.color(style.dot)} ${chalk.bold.white(head)}`);
      if (withRoast && it.fix) {
        console.log(`${PAD}  ${chalk.green('fix')} ${chalk.white(it.fix)}`);
      }
      if (withRoast && it.roast) {
        console.log(`${PAD}  ${chalk.dim(it.title)}`);
      }
    }
  }
  console.log('');
}

export function renderWarnings(warnings: string[]): void {
  if (!warnings.length) return;
  console.log('');
  for (const w of warnings) console.log(`${PAD}${chalk.yellow('▲')} ${chalk.dim(w)}`);
}

export function renderFooter(opts: { reportPath?: string; cardPath?: string; fixHint?: boolean }): void {
  console.log(chalk.dim(PAD + '─'.repeat(WIDTH)));
  if (opts.cardPath) console.log(`${PAD}${chalk.magenta('🪧 card')}    ${chalk.dim(opts.cardPath)}`);
  if (opts.reportPath) console.log(`${PAD}${chalk.cyan('📄 report')}  ${chalk.dim(opts.reportPath)}`);
  if (opts.fixHint) {
    console.log(`${PAD}${chalk.dim('Prescription:')} ${chalk.hex('#fb923c')('npx roast-my-react --fix')} ${chalk.dim('→ let an AI agent apply the fixes')}`);
  }
  console.log('');
}

export function renderMissingKeyNotice(): void {
  console.log('');
  console.log(`${PAD}${chalk.yellow.bold('🔑 No AI key — showing the raw diagnosis (no roast).')}`);
  console.log(`${PAD}${chalk.dim('   Free Groq key → savage commentary:')}`);
  console.log(`${PAD}${chalk.dim('     1. https://console.groq.com/keys  (no card)')}`);
  console.log(`${PAD}${chalk.dim('     2. export GROQ_API_KEY=gsk_...')}`);
}

// --- layout primitives ------------------------------------------------------

function sectionHeader(label: string, count: number, color: ChalkInstance): string {
  const left = `${color.bold(label)} ${chalk.dim(`(${count})`)}`;
  const dashes = Math.max(0, WIDTH - visibleLen(left) - 1);
  return `${PAD}${left} ${chalk.dim('─'.repeat(dashes))}`;
}

/** Draw a rounded box with a title; pads each line to the inner width. */
function panel(title: string, lines: string[], color: ChalkInstance): void {
  const inner = WIDTH;
  const titleStr = ` ${title} `;
  const top = `${color('╭─')}${chalk.dim(titleStr)}${color('─'.repeat(Math.max(0, inner - visibleLen(titleStr) - 1)) + '╮')}`;
  const bottom = `${color('╰' + '─'.repeat(inner) + '╯')}`;
  console.log(PAD + top);
  for (const line of lines) {
    const padded = line + ' '.repeat(Math.max(0, inner - 1 - visibleLen(line)));
    console.log(`${PAD}${color('│')} ${padded}${color('│')}`);
  }
  console.log(PAD + bottom);
}

function scoreColor(score: number | null): ChalkInstance {
  if (score === null) return chalk.gray;
  if (score >= 90) return chalk.green;
  if (score >= 50) return chalk.yellow;
  return chalk.red;
}

function shortCat(id: string): string {
  if (id === 'performance') return 'perf';
  if (id === 'accessibility') return 'a11y';
  if (id === 'best-practices') return 'best';
  return id;
}

function safePath(url: string): string {
  try {
    const u = new URL(url);
    return (u.pathname || '/') + (u.search || '');
  } catch {
    return url;
  }
}

/** Visible length, ignoring ANSI color codes (for padding math). */
function visibleLen(s: string): number {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '').length;
}
