import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { A11yResult } from '../types.js';

/**
 * Runs axe-core against the live page and returns WCAG violations, worst first.
 */
export async function collectA11y(page: Page): Promise<A11yResult> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const order: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

  const violations = results.violations
    .map((v) => ({
      id: v.id,
      impact: (v.impact ?? null) as A11yResult['violations'][number]['impact'],
      description: v.description,
      help: v.help,
      nodes: v.nodes.length,
    }))
    .sort((a, b) => (order[a.impact ?? 'minor'] ?? 9) - (order[b.impact ?? 'minor'] ?? 9));

  return { violations };
}
