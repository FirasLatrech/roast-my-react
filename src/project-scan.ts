import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

/**
 * Discovers which dev-server port(s) a project actually declares — so we target
 * the *real* app instead of whatever happens to answer on a common port.
 *
 * This is what makes monorepos work. We recursively walk the repo (bounded,
 * skipping node_modules/build output) and read every signal that pins a port:
 *   • package.json scripts        → --port / -p / PORT= flags  (+ framework default)
 *   • Nx project.json             → targets.*.options.port (serve/dev/start)
 *   • angular.json / workspace.json → projects.*.architect.serve.options.port
 *   • vite.config.* / next.config.* / webpack configs → server.port / port
 * Each port is associated with the project's name so a multi-app workspace can
 * be disambiguated by the user.
 *
 * Everything is best-effort and bounded — unreadable/huge files are skipped.
 */

export interface ConfiguredApp {
  port: number;
  /** Project/app name (from config) or the folder name. */
  name: string;
  /** Where we found it, relative to cwd (for transparency). */
  source: string;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.nx', '.next', '.turbo', '.cache', '.angular',
  'dist', 'build', 'out', 'coverage', 'tmp', '.output', '.svelte-kit', '.vercel',
]);
const MAX_DEPTH = 5;
const MAX_DIRS = 4000; // safety cap for giant repos

/** Framework dev-server defaults, used only when a project declares no explicit port. */
const FRAMEWORK_DEFAULTS: Array<{ test: RegExp; port: number }> = [
  { test: /\bnext\b/, port: 3000 },
  { test: /\b(ng|@angular|angular)\b/, port: 4200 },
  { test: /\bvite\b/, port: 5173 },
  { test: /\b(react-scripts|craco)\b/, port: 3000 },
  { test: /\b(vue-cli-service|webpack(-dev)?-server)\b/, port: 8080 },
  { test: /\bastro\b/, port: 4321 },
  { test: /\bparcel\b/, port: 1234 },
];

export function discoverConfiguredApps(cwd: string = process.cwd()): ConfiguredApp[] {
  const apps: ConfiguredApp[] = [];
  const seenPorts = new Set<number>();
  const add = (port: unknown, name: string, source: string): void => {
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return;
    if (seenPorts.has(port)) return;
    seenPorts.add(port);
    apps.push({ port, name, source });
  };

  let budget = MAX_DIRS;
  const walk = (dir: string, depth: number): void => {
    if (depth > MAX_DEPTH || budget-- <= 0) return;
    scanDir(dir, cwd, add);
    for (const entry of safeReaddir(dir)) {
      if (entry.startsWith('.') && entry !== '.') continue;
      if (SKIP_DIRS.has(entry)) continue;
      const child = join(dir, entry);
      if (isDir(child)) walk(child, depth + 1);
    }
  };
  walk(cwd, 0);

  return apps;
}

/** Back-compat: just the ports, in discovery order. */
export function discoverConfiguredPorts(cwd: string = process.cwd()): number[] {
  return discoverConfiguredApps(cwd).map((a) => a.port);
}

/** Scan a single directory's config files. */
function scanDir(dir: string, root: string, add: (port: unknown, name: string, source: string) => void): void {
  const rel = (p: string): string => relative(root, p) || basename(p);

  // package.json — explicit port flags, else framework default.
  const pkgPath = join(dir, 'package.json');
  const pkg = readJson(pkgPath) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null;
  if (pkg && typeof pkg === 'object') {
    const name = pkg.name || basename(dir);
    const scripts = pkg.scripts ?? {};
    let foundExplicit = false;
    const re = /(?:--port[ =]|-p[ =]|PORT=)(\d{2,5})/g;
    for (const cmd of Object.values(scripts)) {
      if (typeof cmd !== 'string') continue;
      let m: RegExpExecArray | null;
      while ((m = re.exec(cmd)) !== null) {
        add(Number(m[1]), name, `${rel(pkgPath)} (scripts)`);
        foundExplicit = true;
      }
    }
    // No explicit port? Infer the framework's default from deps/scripts.
    if (!foundExplicit) {
      const haystack = [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.devDependencies ?? {}),
        ...Object.values(scripts),
      ].join(' ');
      for (const { test, port } of FRAMEWORK_DEFAULTS) {
        if (test.test(haystack)) {
          add(port, name, `${rel(pkgPath)} (${test.source} default)`);
          break;
        }
      }
    }
  }

  // Nx project.json + Angular workspace configs — serve target ports.
  for (const f of ['project.json', 'angular.json', 'workspace.json', 'nx.json']) {
    const p = join(dir, f);
    const json = readJson(p);
    if (json) collectPortsFromConfig(json, basename(dir), rel(p), add);
  }

  // Bundler configs — server.port / port.
  for (const f of [
    'vite.config.ts', 'vite.config.js', 'vite.config.mjs',
    'next.config.js', 'next.config.mjs', 'next.config.ts',
    'webpack.config.js', 'webpack.config.ts',
  ]) {
    const p = join(dir, f);
    const text = readText(p);
    if (!text) continue;
    const re = /port\s*[:=]\s*(\d{2,5})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) add(Number(m[1]), basename(dir), rel(p));
  }
}

/**
 * Pull serve-target ports out of an Nx/Angular config object, attributing each
 * to its project name when the structure exposes one.
 */
function collectPortsFromConfig(
  json: unknown,
  fallbackName: string,
  source: string,
  add: (port: unknown, name: string, src: string) => void
): void {
  if (!json || typeof json !== 'object') return;
  const root = json as Record<string, unknown>;

  // angular.json / workspace.json: { projects: { name: { architect|targets: { serve: { options: { port }}}}}}
  const projects = root.projects as Record<string, unknown> | undefined;
  if (projects && typeof projects === 'object') {
    for (const [projName, proj] of Object.entries(projects)) {
      forEachPort(proj, (port) => add(port, projName, source));
    }
  }

  // project.json (single Nx project): { name, targets: { serve: { options: { port }}}}
  const name = (root.name as string) || fallbackName;
  if (root.targets || root.architect) {
    forEachPort(root, (port) => add(port, name, source));
  }
}

/** Recursively yield every numeric `port` value under a node (depth-bounded). */
function forEachPort(node: unknown, cb: (port: number) => void, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'port' && typeof value === 'number') cb(value);
    else if (typeof value === 'object') forEachPort(value, cb, depth + 1);
  }
}

// --- tiny fs helpers (all best-effort) -------------------------------------

function readJson(path: string): unknown {
  const text = readText(path);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readText(path: string): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > 512 * 1024) return null; // skip huge files
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}
