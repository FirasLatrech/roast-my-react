import type { Page } from 'playwright';
import type { RerenderResult } from '../types.js';

/**
 * Reads back the re-render tallies collected by the injected hook
 * (see rerender-hook.ts) and drives a short interaction pass to provoke renders.
 *
 * We don't know the app, so the "interaction" is deliberately generic: scroll,
 * move the mouse across the viewport, and click a couple of safe-looking
 * interactive elements. The goal is to nudge state updates, not to test flows.
 */
export async function collectRerenders(page: Page): Promise<RerenderResult> {
  // Generic interaction pass to provoke state updates.
  try {
    const viewport = page.viewportSize() ?? { width: 1280, height: 800 };
    await page.mouse.move(viewport.width / 2, viewport.height / 2);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(150);
    await page.mouse.wheel(0, -600);
    await page.mouse.move(viewport.width / 3, viewport.height / 3);

    // Click up to 3 visible, low-risk interactive elements (buttons, tabs, toggles).
    const candidates = page.locator(
      'button:visible, [role="button"]:visible, [role="tab"]:visible, summary:visible'
    );
    const count = Math.min(await candidates.count(), 3);
    for (let i = 0; i < count; i++) {
      try {
        await candidates.nth(i).click({ timeout: 1000, trial: false });
        await page.waitForTimeout(120);
      } catch {
        /* element vanished or navigated — fine, keep going */
      }
    }
    await page.waitForTimeout(250);
  } catch {
    /* interaction is best-effort */
  }

  const snapshot = await page
    .evaluate(() => {
      const w = window as unknown as {
        __ROAST__?: { snapshot(): { counts: Record<string, number>; commits: number } };
      };
      return w.__ROAST__ ? w.__ROAST__.snapshot() : null;
    })
    .catch(() => null);

  if (!snapshot) {
    return { hotComponents: [], totalCommits: 0, reactDetected: false };
  }

  const hotComponents = Object.entries(snapshot.counts)
    .map(([name, renders]) => ({ name, renders }))
    .filter((c) => c.renders > 1)
    .sort((a, b) => b.renders - a.renders)
    .slice(0, 8);

  return {
    hotComponents,
    totalCommits: snapshot.commits,
    reactDetected: snapshot.commits > 0,
  };
}
