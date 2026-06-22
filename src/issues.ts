import type { Findings, Issue } from './types.js';

const KB = 1024;
const MB = 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} KB`;
  return `${bytes} B`;
}

/**
 * Flattens raw audit `Findings` into a normalized, weighted list of `Issue`s.
 * Each issue carries the real numbers in its `title`/`metric` so the AI roast
 * can reference them verbatim (and so the report is useful even with --no-ai).
 *
 * Thresholds are intentionally opinionated — this is a roast tool, not a linter.
 */
export function deriveIssues(findings: Findings): Issue[] {
  const issues: Issue[] = [];

  // --- Lighthouse scores -----------------------------------------------------
  for (const cat of findings.lighthouse?.scores ?? []) {
    if (cat.score === null || cat.score >= 90) continue;
    const category =
      cat.id === 'accessibility'
        ? 'accessibility'
        : cat.id === 'best-practices'
          ? 'best-practices'
          : 'performance';
    issues.push({
      id: `score-${cat.id}`,
      category,
      title: `Lighthouse ${cat.title} score is ${cat.score}/100.`,
      metric: `${cat.score}/100`,
      weight: (90 - cat.score) + (cat.id === 'performance' ? 20 : 0),
    });
  }

  // --- Lighthouse opportunities ---------------------------------------------
  for (const op of findings.lighthouse?.opportunities ?? []) {
    const savings = op.savingsMs ? ` (~${op.savingsMs} ms to save)` : '';
    const detail = op.displayValue ? ` ${op.displayValue}.` : '.';
    issues.push({
      id: `op-${op.id}`,
      category: op.category,
      title: `${op.title}${detail}${savings}`,
      metric: op.savingsMs ? `${op.savingsMs} ms` : op.displayValue,
      weight: 10 + Math.min(40, (op.savingsMs ?? 0) / 50),
    });
  }

  // --- Bundle size -----------------------------------------------------------
  const bundle = findings.bundle;
  if (bundle) {
    const jsKb = bundle.totalJsBytes / KB;
    if (jsKb > 300) {
      issues.push({
        id: 'bundle-total-js',
        category: 'bundle',
        title: `Shipping ${formatBytes(bundle.totalJsBytes)} of JavaScript across ${bundle.requestCount} requests.`,
        metric: formatBytes(bundle.totalJsBytes),
        weight: 15 + Math.min(45, jsKb / 30),
      });
    }
    const biggest = bundle.largestChunks[0];
    if (biggest && biggest.bytes > 200 * KB) {
      issues.push({
        id: 'bundle-largest-chunk',
        category: 'bundle',
        title: `Largest JS chunk "${biggest.url}" is ${formatBytes(biggest.bytes)} on its own.`,
        metric: formatBytes(biggest.bytes),
        weight: 12 + Math.min(30, biggest.bytes / KB / 40),
      });
    }
  }

  // --- Re-renders ------------------------------------------------------------
  for (const comp of findings.rerenders?.hotComponents ?? []) {
    if (comp.renders < 5) continue;
    issues.push({
      id: `rerender-${comp.name}`,
      category: 'rerenders',
      title: `<${comp.name}> re-rendered ${comp.renders} times during a tiny interaction pass.`,
      metric: `${comp.renders} renders`,
      weight: 8 + Math.min(35, comp.renders),
    });
  }

  // --- Accessibility violations ---------------------------------------------
  const impactWeight: Record<string, number> = {
    critical: 45,
    serious: 30,
    moderate: 15,
    minor: 6,
  };
  for (const v of findings.a11y?.violations ?? []) {
    issues.push({
      id: `a11y-${v.id}`,
      category: 'accessibility',
      title: `${v.help} — ${v.nodes} element${v.nodes === 1 ? '' : 's'} affected (${v.impact ?? 'unknown'} impact).`,
      metric: `${v.nodes} nodes, ${v.impact ?? 'unknown'}`,
      weight: impactWeight[v.impact ?? 'minor'] ?? 6,
    });
  }

  return issues.sort((a, b) => b.weight - a.weight);
}
