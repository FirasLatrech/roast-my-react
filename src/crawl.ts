import net from 'node:net';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import type { Findings, RoastOptions } from './types.js';
import { RERENDER_HOOK_SOURCE } from './audits/rerender-hook.js';
import { collectRerenders } from './audits/rerender.js';
import { collectA11y } from './audits/a11y.js';
import { summarizeBundle, type RecordedResponse } from './audits/bundle.js';
import { runLighthouse } from './audits/lighthouse.js';

export interface CrawlHooks {
  /** Called with a short status string as each phase begins. */
  onPhase?: (label: string) => void;
}

/** True when Playwright's Chromium is already downloaded on this machine. */
export function isChromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/**
 * Downloads Chromium via the bundled Playwright CLI (the same as
 * `npx playwright install chromium`). Streams progress to the terminal.
 * This is what makes a cold `npx roast-my-react` just work.
 */
export function installChromium(): void {
  const require = createRequire(import.meta.url);
  // `playwright/cli.js` isn't an exported subpath, but `./package.json` is —
  // resolve that and locate the CLI alongside it.
  const pkgJson = require.resolve('playwright/package.json');
  const cli = join(dirname(pkgJson), 'cli.js');
  execFileSync(process.execPath, [cli, 'install', 'chromium'], { stdio: 'inherit' });
}

/**
 * Drives the whole data-collection pass for a single URL and returns the raw
 * `Findings`. Individual audits fail soft: a broken audit becomes a `warning`,
 * not a crashed run.
 */
export async function crawl(opts: RoastOptions, hooks: CrawlHooks = {}): Promise<Findings> {
  const phase = hooks.onPhase ?? (() => {});
  const warnings: string[] = [];

  const port = await findFreePort();
  let browser: Browser | null = null;

  const findings: Findings = {
    url: opts.url,
    title: opts.url,
    lighthouse: null,
    bundle: null,
    rerenders: null,
    a11y: null,
    warnings,
  };

  try {
    phase('Launching headless Chromium');
    browser = await chromium.launch({
      headless: true,
      args: [`--remote-debugging-port=${port}`],
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      deviceScaleFactor: 2, // crisp, retina-quality screenshots
      ...(opts.authFile ? { storageState: opts.authFile } : {}),
      ...(opts.headers ? { extraHTTPHeaders: opts.headers } : {}),
    });
    await context.addInitScript(RERENDER_HOOK_SOURCE);

    const page = await context.newPage();

    // Record transferred bytes per finished request.
    const responses: RecordedResponse[] = [];
    const pending: Array<Promise<void>> = [];
    page.on('requestfinished', (request) => {
      const p = (async () => {
        try {
          const sizes = await request.sizes();
          responses.push({
            url: request.url(),
            resourceType: request.resourceType(),
            bytes: Math.max(0, sizes.responseBodySize),
          });
        } catch {
          /* request torn down before sizes were available */
        }
      })();
      pending.push(p);
    });

    phase(`Loading ${opts.url}`);
    try {
      // Short networkidle window — many SPAs/dashboards never truly idle
      // (websockets, polling), so we don't want to burn 30s waiting.
      await page.goto(opts.url, { waitUntil: 'networkidle', timeout: 8_000 });
    } catch {
      // Fall back to a plain load so we still get useful data — quietly, since
      // this is the common (and fine) case for live apps.
      await page.goto(opts.url, { waitUntil: 'load', timeout: 20_000 });
    }

    findings.title = (await page.title().catch(() => '')) || opts.url;

    // Accessibility (axe-core).
    phase('Running axe-core accessibility scan');
    try {
      findings.a11y = await collectA11y(page);
    } catch (err) {
      warnings.push(`Accessibility scan failed: ${errMsg(err)}`);
    }

    // Re-render instrumentation + interaction pass.
    phase('Measuring React re-renders');
    try {
      findings.rerenders = await collectRerenders(page);
      if (findings.rerenders && !findings.rerenders.reactDetected) {
        warnings.push('No React commits detected — re-render data may be unavailable for this app.');
      }
    } catch (err) {
      warnings.push(`Re-render measurement failed: ${errMsg(err)}`);
    }

    // Bundle summary from recorded network traffic.
    await Promise.allSettled(pending);
    findings.bundle = summarizeBundle(responses);

    // Lighthouse — reuses this browser's debugging port, runs its own load.
    // Skipped in --fast mode (it's by far the slowest audit).
    if (opts.fast) {
      warnings.push('Fast mode: skipped the Lighthouse audit.');
    } else {
      phase('Running Lighthouse audit');
      try {
        findings.lighthouse = await runLighthouse(opts.url, port);
      } catch (err) {
        warnings.push(`Lighthouse audit failed: ${errMsg(err)}`);
      }
    }

    await context.close();
  } finally {
    await browser?.close().catch(() => {});
  }

  return findings;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Ask the OS for a free TCP port by binding to 0 and reading it back. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not determine a free port')));
      }
    });
  });
}
