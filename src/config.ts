import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Optional project config so teams don't repeat flags on every run.
 *
 * Looked up (in order) from the current directory:
 *   1. roast.config.json
 *   2. a "roast" key in package.json
 *
 * Precedence is always: CLI flag  >  config file  >  built-in default.
 * Unknown keys are ignored; a malformed file is skipped (best-effort).
 */
export interface RoastConfig {
  url?: string;
  severity?: number;
  fast?: boolean;
  report?: boolean;
  card?: boolean;
  ai?: boolean;
  routes?: string | string[];
  headers?: string[];
  auth?: string;
  fix?: string | boolean;
  /** Sets ROAST_MODEL if the env var isn't already present. */
  model?: string;
  /** Sets ROAST_BASE_URL if the env var isn't already present. */
  baseUrl?: string;
}

export function loadConfig(cwd: string = process.cwd()): RoastConfig {
  const fromFile = readJson(join(cwd, 'roast.config.json'));
  if (fromFile && typeof fromFile === 'object') return sanitize(fromFile as Record<string, unknown>);

  const pkg = readJson(join(cwd, 'package.json')) as { roast?: unknown } | null;
  if (pkg && pkg.roast && typeof pkg.roast === 'object') {
    return sanitize(pkg.roast as Record<string, unknown>);
  }
  return {};
}

/** Push config-provided model/baseUrl into env so roast.ts picks them up (env still wins). */
export function applyConfigEnv(config: RoastConfig): void {
  if (config.model && !process.env.ROAST_MODEL) process.env.ROAST_MODEL = config.model;
  if (config.baseUrl && !process.env.ROAST_BASE_URL) process.env.ROAST_BASE_URL = config.baseUrl;
}

/** Keep only known keys with the right primitive shapes. */
function sanitize(raw: Record<string, unknown>): RoastConfig {
  const out: RoastConfig = {};
  if (typeof raw.url === 'string') out.url = raw.url;
  if (typeof raw.severity === 'number') out.severity = raw.severity;
  if (typeof raw.fast === 'boolean') out.fast = raw.fast;
  if (typeof raw.report === 'boolean') out.report = raw.report;
  if (typeof raw.card === 'boolean') out.card = raw.card;
  if (typeof raw.ai === 'boolean') out.ai = raw.ai;
  if (typeof raw.routes === 'string' || Array.isArray(raw.routes)) out.routes = raw.routes as string | string[];
  if (Array.isArray(raw.headers)) out.headers = raw.headers.filter((h): h is string => typeof h === 'string');
  if (typeof raw.auth === 'string') out.auth = raw.auth;
  if (typeof raw.fix === 'string' || typeof raw.fix === 'boolean') out.fix = raw.fix;
  if (typeof raw.model === 'string') out.model = raw.model;
  if (typeof raw.baseUrl === 'string') out.baseUrl = raw.baseUrl;
  return out;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
