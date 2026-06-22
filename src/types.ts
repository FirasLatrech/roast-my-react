/**
 * Shared types for roast-my-react.
 *
 * The flow is: crawl + audits produce `Findings`, those are flattened into
 * `Issue[]`, the AI step decorates each issue with a `roast` + `fix`, and the
 * reporter renders the result.
 */

export type Severity = 1 | 2 | 3;

export interface RoastOptions {
  url: string;
  severity: Severity;
  report: boolean;
  json: boolean;
  /** When false, skip the AI step and show raw findings only. */
  ai: boolean;
  /** Skip Lighthouse (the slowest audit) for a much faster run. */
  fast: boolean;
  /** Playwright storageState JSON for auditing logged-in pages. */
  authFile?: string;
  /** Extra request headers (e.g. Authorization) applied to every request. */
  headers?: Record<string, string>;
  /** Coding agent to hand the findings to after the roast (claude/codex/opencode/auto). */
  fix?: string;
  /** Full URLs to audit (multi-route). Defaults to [url] when omitted. */
  routes?: string[];
  /** Compare this run against the saved baseline and show deltas. */
  baseline: boolean;
  /** Save this run as the new baseline. */
  saveBaseline: boolean;
  /** Generate a shareable PNG roast card. */
  card: boolean;
  /** Where the HTML report is written (when --report). */
  reportPath: string;
  /** Where the PNG card is written (when --card). */
  cardPath: string;
  /** Where the baseline snapshot is read/written. */
  baselinePath: string;
}

/** A single category score from Lighthouse (0–100, or null if unavailable). */
export interface CategoryScore {
  id: string;
  title: string;
  score: number | null;
}

export interface Vital {
  /** Short label, e.g. "LCP", "CLS", "TBT". */
  id: string;
  title: string;
  displayValue: string;
  /** 0–1 Lighthouse score for this metric, or null. */
  score: number | null;
}

export interface LighthouseResult {
  scores: CategoryScore[];
  /** Core Web Vitals & key lab metrics (LCP, CLS, TBT, FCP, SI, TTI). */
  vitals: Vital[];
  /** Notable failing/under-performing audits worth roasting. */
  opportunities: Array<{
    id: string;
    title: string;
    displayValue?: string;
    /** Which Lighthouse category this audit belongs to. */
    category: 'performance' | 'accessibility' | 'best-practices';
    /** Estimated savings in milliseconds, when Lighthouse provides it. */
    savingsMs?: number;
  }>;
}

export interface BundleResult {
  /** Total transferred JS in bytes. */
  totalJsBytes: number;
  /** Total transferred bytes across all resource types. */
  totalBytes: number;
  requestCount: number;
  largestChunks: Array<{ url: string; bytes: number }>;
}

export interface RerenderResult {
  /** Components that rendered more than once during the interaction pass. */
  hotComponents: Array<{ name: string; renders: number }>;
  totalCommits: number;
  /** True when the React DevTools hook never reported a commit. */
  reactDetected: boolean;
}

export interface A11yViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description: string;
  help: string;
  nodes: number;
}

export interface A11yResult {
  violations: A11yViolation[];
}

/** Everything the audits collected, before the AI gets involved. */
export interface Findings {
  url: string;
  title: string;
  lighthouse: LighthouseResult | null;
  bundle: BundleResult | null;
  rerenders: RerenderResult | null;
  a11y: A11yResult | null;
  /** Non-fatal problems encountered while auditing (shown as warnings). */
  warnings: string[];
}

export type IssueCategory =
  | 'performance'
  | 'accessibility'
  | 'best-practices'
  | 'bundle'
  | 'rerenders';

/** A normalized, roastable problem flattened out of `Findings`. */
export interface Issue {
  id: string;
  category: IssueCategory;
  /** Plain-language description of the problem, with the real numbers baked in. */
  title: string;
  /** Machine-readable facts the model can reference verbatim. */
  metric?: string;
  /** Higher = worse. Used for sorting in the report. */
  weight: number;
}

/** An issue after the AI step. */
export interface RoastedIssue extends Issue {
  roast: string;
  fix: string;
}
