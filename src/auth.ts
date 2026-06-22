import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import chalk from 'chalk';
import { chromium } from 'playwright';

/**
 * Login support for dashboards behind auth.
 *
 * `roast-my-react login --url <url>` opens a *real* (headed) browser, lets you
 * log in by hand, then saves the browser session (cookies + localStorage) to
 * disk via Playwright's storageState. Later audits of the same host reuse it
 * automatically, so the headless run sees a logged-in page.
 */

/** Directory where saved sessions live: ~/.roast-my-react/auth/ */
function authDir(): string {
  return join(homedir(), '.roast-my-react', 'auth');
}

/** A filesystem-safe filename for a given URL's host(:port). */
function authFileFor(url: string): string {
  let key: string;
  try {
    const u = new URL(url);
    key = u.host; // host:port
  } catch {
    key = url;
  }
  const safe = key.replace(/[^a-z0-9._-]/gi, '_');
  return join(authDir(), `${safe}.json`);
}

/** Returns the saved session path for a URL if one exists, else null. */
export function findSavedAuth(url: string): string | null {
  const path = authFileFor(url);
  return existsSync(path) ? path : null;
}

/**
 * Opens a headed browser at `url`, waits for the user to log in and press
 * Enter, then saves the session. Returns the path written.
 */
export async function runLogin(url: string): Promise<string> {
  mkdirSync(authDir(), { recursive: true });
  const outPath = authFileFor(url);

  console.log('');
  console.log(chalk.hex('#fb923c').bold('  🔐  Login mode'));
  console.log(chalk.dim(`      Opening a browser at ${url}`));
  console.log(chalk.dim('      1. Log in normally in the window that opens.'));
  console.log(chalk.dim('      2. Once you can see the dashboard, come back here.'));
  console.log('');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
  } catch {
    /* user can still navigate manually */
  }

  await waitForEnter(chalk.green('  ▶  Press Enter here once you are logged in… '));

  await context.storageState({ path: outPath });
  await browser.close();

  console.log('');
  console.log(chalk.green(`  ✔  Session saved.`));
  console.log(chalk.dim(`     ${outPath}`));
  console.log(chalk.dim('     Future audits of this host will reuse it automatically.'));
  console.log('');
  return outPath;
}

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => {
      rl.close();
      resolve();
    });
  });
}
