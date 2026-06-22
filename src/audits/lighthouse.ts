import lighthouse from 'lighthouse';
import type { LighthouseResult } from '../types.js';

/**
 * Lighthouse relies on PROCESS-GLOBAL state (performance marks, the trace
 * processor), so two runs in the same Node process clobber each other. When we
 * audit routes in parallel we still must run Lighthouse one-at-a-time — this
 * promise chain is the mutex that guarantees it. The parallel routes' page
 * loads / axe / re-render passes still overlap; only the Lighthouse step queues.
 */
let lighthouseLock: Promise<unknown> = Promise.resolve();

export async function runLighthouse(url: string, port: number): Promise<LighthouseResult> {
  // One retry: Lighthouse occasionally flakes on the first navigation of a
  // cold/slow dev server. The retry makes results reliably show up.
  const run = lighthouseLock.then(async () => {
    try {
      return await runLighthouseExclusive(url, port);
    } catch {
      return runLighthouseExclusive(url, port);
    }
  });
  // Keep the chain alive even if this run rejects.
  lighthouseLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function runLighthouseExclusive(url: string, port: number): Promise<LighthouseResult> {
  const runnerResult = await lighthouse(
    url,
    {
      port,
      output: 'json',
      logLevel: 'silent',
      onlyCategories: ['performance', 'accessibility', 'best-practices'],
    },
    undefined
  );

  if (!runnerResult || !runnerResult.lhr) {
    throw new Error('Lighthouse returned no result');
  }

  const lhr = runnerResult.lhr;

  const scores = Object.values(lhr.categories).map((cat) => ({
    id: cat.id,
    title: cat.title,
    score: cat.score === null ? null : Math.round(cat.score * 100),
  }));

  // Map each audit id to the category it belongs to, so opportunities are
  // tagged correctly (an a11y audit shouldn't show up under "performance").
  const auditCategory: Record<string, 'performance' | 'accessibility' | 'best-practices'> = {};
  for (const cat of Object.values(lhr.categories)) {
    const id =
      cat.id === 'accessibility'
        ? 'accessibility'
        : cat.id === 'best-practices'
          ? 'best-practices'
          : 'performance';
    for (const ref of cat.auditRefs ?? []) auditCategory[ref.id] = id;
  }

  const opportunities = Object.values(lhr.audits)
    .filter((audit) => {
      if (audit.score === null || audit.score === undefined) return false;
      if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'informative') {
        return false;
      }
      return audit.score < 0.9;
    })
    .map((audit) => {
      const savingsMs =
        (audit.details as { overallSavingsMs?: number } | undefined)?.overallSavingsMs;
      return {
        id: audit.id,
        title: audit.title,
        displayValue: audit.displayValue,
        category: auditCategory[audit.id] ?? 'performance',
        savingsMs: typeof savingsMs === 'number' ? Math.round(savingsMs) : undefined,
        score: audit.score ?? 1,
      };
    })
    // axe-core owns accessibility — don't double-report it from Lighthouse.
    .filter((audit) => audit.category !== 'accessibility')
    .sort((a, b) => {
      // Biggest time savings first, then lowest score.
      const sa = a.savingsMs ?? 0;
      const sb = b.savingsMs ?? 0;
      if (sb !== sa) return sb - sa;
      return a.score - b.score;
    })
    .slice(0, 8)
    .map(({ score, ...rest }) => {
      void score;
      return rest;
    });

  // Core Web Vitals & key lab metrics, in display order.
  const VITALS: Array<{ id: string; label: string }> = [
    { id: 'largest-contentful-paint', label: 'LCP' },
    { id: 'cumulative-layout-shift', label: 'CLS' },
    { id: 'total-blocking-time', label: 'TBT' },
    { id: 'first-contentful-paint', label: 'FCP' },
    { id: 'speed-index', label: 'SI' },
    { id: 'interactive', label: 'TTI' },
  ];
  const vitals = VITALS.map(({ id, label }) => {
    const audit = lhr.audits[id];
    if (!audit) return null;
    return {
      id: label,
      title: audit.title,
      displayValue: audit.displayValue ?? '—',
      score: audit.score ?? null,
    };
  }).filter((v): v is NonNullable<typeof v> => v !== null);

  return { scores, opportunities, vitals };
}
