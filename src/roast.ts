import type { Issue, RoastedIssue, Severity } from './types.js';

/**
 * The AI step uses any OpenAI-compatible Chat Completions endpoint, so you can
 * roast with a *free* model. Defaults to Groq (free, fast, no credit card).
 *
 * Configure via env:
 *   ROAST_API_KEY   API key (or GROQ_API_KEY / OPENROUTER_API_KEY / OPENAI_API_KEY)
 *   ROAST_BASE_URL  Base URL of the API (default: Groq)
 *   ROAST_MODEL     Model id (default: llama-3.1-8b-instant — tiny, fast, free)
 *
 * Works out of the box with:
 *   • Groq        https://api.groq.com/openai/v1   (default — get a free key at console.groq.com)
 *   • OpenRouter  https://openrouter.ai/api/v1     (use a ":free" model, e.g. meta-llama/llama-3.3-70b-instruct:free)
 *   • Ollama      http://localhost:11434/v1        (fully local, no key — set ROAST_BASE_URL + ROAST_MODEL)
 *   • OpenAI      https://api.openai.com/v1
 */

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
// Default model: fast, free on Groq, and reliably follows the JSON roast contract.
// Override with ROAST_MODEL (e.g. a local Ollama model or OpenAI endpoint).
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are a senior frontend engineer with a savage sense of humor. You are given JSON describing real problems found in a web app. For each issue, return a JSON array of objects: { id, roast, fix }. \`roast\` is ONE punchy, funny, specific line that references the actual numbers (max ~20 words). \`fix\` is 1-2 sentences of correct, actionable advice. Match the requested severity tone. Never invent issues not present in the data. Output ONLY valid JSON (a JSON array), no markdown, no prose.`;

const SEVERITY_TONE: Record<Severity, string> = {
  1: 'gentle — playful and encouraging, like a friendly mentor',
  2: 'normal — sharp and witty, a confident roast that still teaches',
  3: 'savage — brutal, merciless, no survivors (but still technically correct)',
};

export class MissingApiKeyError extends Error {
  constructor() {
    super('No AI API key configured');
    this.name = 'MissingApiKeyError';
  }
}

interface AiConfig {
  baseUrl: string;
  model: string;
  apiKey: string | undefined;
  isLocal: boolean;
}

/** Resolve the provider config from env, with Groq as the free default. */
export function resolveAiConfig(): AiConfig {
  const baseUrl = (process.env.ROAST_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = process.env.ROAST_MODEL || DEFAULT_MODEL;
  const apiKey =
    process.env.ROAST_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    undefined;
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(baseUrl);
  return { baseUrl, model, apiKey, isLocal };
}

/**
 * Sends the structured issues to the model and returns each issue decorated with
 * a `roast` + `fix`. Throws {@link MissingApiKeyError} when no key is configured
 * (and the endpoint isn't a local one like Ollama) so the CLI can fall back.
 *
 * Parsing is defensive: code fences are stripped, the first JSON array is
 * extracted, and any issue the model omits keeps a sensible fallback.
 */
export async function roastIssues(issues: Issue[], severity: Severity): Promise<RoastedIssue[]> {
  const cfg = resolveAiConfig();
  if (!cfg.apiKey && !cfg.isLocal) throw new MissingApiKeyError();
  if (issues.length === 0) return [];

  const userPayload = {
    severity: `${severity} (${SEVERITY_TONE[severity]})`,
    issues: issues.map((i) => ({ id: i.id, category: i.category, problem: i.title, metric: i.metric })),
  };

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers['authorization'] = `Bearer ${cfg.apiKey}`;
  // Optional OpenRouter attribution headers (ignored by other providers).
  headers['http-referer'] = 'https://www.npmjs.com/package/roast-my-react';
  headers['x-title'] = 'roast-my-react';

  const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.9,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AI API error ${response.status} (${cfg.model}): ${text.slice(0, 300)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = (data.choices?.[0]?.message?.content ?? '').trim();

  const parsed = parseRoastJson(raw);
  const byId = new Map(parsed.map((p) => [p.id, p]));

  return issues.map((issue) => {
    const match = byId.get(issue.id);
    return {
      ...issue,
      roast: match?.roast?.trim() || fallbackRoast(issue),
      fix: match?.fix?.trim() || 'See the issue title above for what to address.',
    };
  });
}

interface RawRoast {
  id: string;
  roast?: string;
  fix?: string;
}

/** Strip markdown fences and pull the first JSON array out of the model output. */
function parseRoastJson(raw: string): RawRoast[] {
  let text = raw.trim();

  // Remove ```json … ``` or ``` … ``` fences if present.
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();

  // Some models wrap the array in an object like { "issues": [...] }.
  // Fall back to the first [...] block regardless of surrounding prose.
  if (!text.startsWith('[')) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((p): p is RawRoast => p && typeof p.id === 'string');
    }
  } catch {
    /* fall through to empty — callers use fallbacks */
  }
  return [];
}

function fallbackRoast(issue: Issue): string {
  return `${issue.title} (the roast bot choked — but the numbers don't lie).`;
}
