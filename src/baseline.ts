import { readFileSync, writeFileSync } from 'node:fs';
import chalk from 'chalk';
import type { Findings } from './types.js';

/**
 * Baseline / compare mode. Save a compact snapshot of a run, then on a later run
 * show what got better or worse — ideal for catching regressions in a PR.
 */

export interface BaselineSnapshot {
  url: string;
  savedAt: string;
  scores: Record<string, number | null>;
  vitals: Record<string, string>;
  totalJsBytes: number;
  issueCount: number;
}

export function buildSnapshot(findings: Findings, issueCount: number, savedAt: string): BaselineSnapshot {
  const scores: Record<string, number | null> = {};
  for (const s of findings.lighthouse?.scores ?? []) scores[s.id] = s.score;
  const vitals: Record<string, string> = {};
  for (const v of findings.lighthouse?.vitals ?? []) vitals[v.id] = v.displayValue;
  return {
    url: findings.url,
    savedAt,
    scores,
    vitals,
    totalJsBytes: findings.bundle?.totalJsBytes ?? 0,
    issueCount,
  };
}

export function saveBaseline(path: string, snapshot: BaselineSnapshot): void {
  writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function loadBaseline(path: string): BaselineSnapshot | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as BaselineSnapshot;
  } catch {
    return null;
  }
}

/** Prints a "vs baseline" diff. Higher score = better; lower JS/issues = better. */
export function renderComparison(prev: BaselineSnapshot, curr: BaselineSnapshot): void {
  console.log('');
  console.log(`  ${chalk.bold('vs baseline')} ${chalk.dim(`(saved ${prev.savedAt})`)}`);

  // Lighthouse scores — up is good.
  for (const id of Object.keys(curr.scores)) {
    const before = prev.scores[id];
    const after = curr.scores[id];
    if (typeof before !== 'number' || typeof after !== 'number') continue;
    console.log(`  ${label(id)}  ${delta(before, after, after - before, '')}`);
  }

  // Bundle size — down is good (so invert the sign for coloring).
  const jsBefore = prev.totalJsBytes;
  const jsAfter = curr.totalJsBytes;
  if (jsBefore || jsAfter) {
    const dKb = Math.round((jsAfter - jsBefore) / 1024); // round first so byte noise reads as 0
    console.log(
      `  ${label('JS size')}  ${kb(jsBefore)} → ${kb(jsAfter)}  ${arrow(-dKb, `${dKb >= 0 ? '+' : ''}${dKb} KB`)}`
    );
  }

  // Issue count — down is good.
  const di = curr.issueCount - prev.issueCount;
  console.log(
    `  ${label('issues')}  ${prev.issueCount} → ${curr.issueCount}  ${arrow(-di, `${di >= 0 ? '+' : ''}${di}`)}`
  );
  console.log('');
}

function label(s: string): string {
  return chalk.dim(s.padEnd(14));
}

/** score delta where positive change = improvement. */
function delta(before: number, after: number, change: number, unit: string): string {
  return `${before}${unit} → ${after}${unit}  ${arrow(change, `${change >= 0 ? '+' : ''}${change}${unit}`)}`;
}

/** Render an arrow + amount, green if `goodness` > 0, red if < 0, dim if 0. */
function arrow(goodness: number, text: string): string {
  if (goodness > 0) return chalk.green(`▲ ${text}`);
  if (goodness < 0) return chalk.red(`▼ ${text}`);
  return chalk.dim(`• ${text}`);
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`;
}
