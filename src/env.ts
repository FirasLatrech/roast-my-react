import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Minimal, zero-dependency `.env` loader. Reads `.env` from the current working
 * directory (and the user's home dir as a fallback) and populates
 * `process.env` for any keys not already set. Real environment variables always
 * win, so `GROQ_API_KEY=… roast-my-react` still overrides a `.env`.
 *
 * Supports `KEY=value`, `export KEY=value`, `#` comments, and quoted values.
 */
export function loadEnv(): void {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(homeDir(), '.roast-my-react.env'),
  ];
  for (const path of candidates) parseInto(path);
}

function parseInto(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return; // file absent — fine
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const withoutExport = trimmed.replace(/^export\s+/, '');
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key || key in process.env) continue;

    let value = withoutExport.slice(eq + 1).trim();
    // Strip surrounding quotes if present.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || '';
}
