import { discoverConfiguredApps } from './project-scan.js';

/**
 * Auto-detects a running local dev server when the user doesn't pass `--url`.
 *
 * Strategy: first read the *project's own config* (package.json scripts, Nx
 * project.json, angular.json, vite/next configs) to learn the real declared
 * port(s) — an Nx app on :4300 is invisible to a blind scan. Those ports are
 * probed first and always win. Only if none answer do we fall back to scanning
 * the common framework ports.
 */

/** Common dev-server ports, in the order we prefer them. */
export const COMMON_PORTS: Array<{ port: number; hint: string }> = [
  { port: 3000, hint: 'Next.js / Create React App' },
  { port: 3001, hint: 'Next.js (alt)' },
  { port: 5173, hint: 'Vite' },
  { port: 4321, hint: 'Astro' },
  { port: 4200, hint: 'Angular' },
  { port: 5174, hint: 'Vite (alt)' },
  { port: 4173, hint: 'Vite preview' },
  { port: 8080, hint: 'webpack-dev-server / Vue CLI' },
  { port: 8000, hint: 'generic' },
  { port: 5000, hint: 'generic' },
  { port: 3333, hint: 'Nx / generic' },
  { port: 1234, hint: 'Parcel' },
  { port: 9000, hint: 'generic' },
];

export interface DetectedServer {
  url: string;
  port: number;
  hint: string;
  /** True when this port came from the project's own config (not a blind guess). */
  configured: boolean;
  /** Project/app name, when the port came from a named config (monorepos). */
  project?: string;
}

/**
 * Probes the project's configured ports first, then the common ports, and
 * returns every server that responds — configured ones ranked first. Each probe
 * is bounded by `timeoutMs` so a full scan stays well under a second.
 */
export async function detectDevServers(
  timeoutMs = 700,
  cwd: string = process.cwd()
): Promise<DetectedServer[]> {
  // Build an ordered candidate list: configured ports first, then common ports.
  const seen = new Set<number>();
  const candidates: Array<{ port: number; hint: string; configured: boolean; project?: string }> = [];

  for (const app of discoverConfiguredApps(cwd)) {
    if (!seen.has(app.port)) {
      seen.add(app.port);
      candidates.push({ port: app.port, hint: app.source, configured: true, project: app.name });
    }
  }
  for (const { port, hint } of COMMON_PORTS) {
    if (!seen.has(port)) {
      seen.add(port);
      candidates.push({ port, hint, configured: false });
    }
  }

  const results = await Promise.all(
    candidates.map(async ({ port, hint, configured, project }): Promise<DetectedServer | null> => {
      const url = `http://localhost:${port}`;
      return (await isReachable(url, timeoutMs)) ? { url, port, hint, configured, project } : null;
    })
  );
  // Promise.all preserves order, so configured-and-reachable come first.
  return results.filter((r): r is DetectedServer => r !== null);
}

/** True if anything answers HTTP at `url` within the timeout. */
async function isReachable(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Any HTTP response (even a 404/500) means a server is listening.
    await fetch(url, { method: 'GET', signal: controller.signal, redirect: 'manual' });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
