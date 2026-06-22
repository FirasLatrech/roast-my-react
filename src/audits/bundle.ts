import type { BundleResult } from '../types.js';

/** A single network response recorded during the crawl. */
export interface RecordedResponse {
  url: string;
  resourceType: string;
  bytes: number;
}

/**
 * Summarizes JS shipped to the browser from the network responses captured
 * during the crawl. We measure transferred (encoded) bytes — what the user
 * actually downloads — and surface the largest individual chunks.
 */
export function summarizeBundle(responses: RecordedResponse[]): BundleResult {
  const jsResponses = responses.filter(
    (r) => r.resourceType === 'script' || /\.m?js(\?|$)/.test(r.url)
  );

  const totalJsBytes = jsResponses.reduce((sum, r) => sum + r.bytes, 0);
  const totalBytes = responses.reduce((sum, r) => sum + r.bytes, 0);

  const largestChunks = jsResponses
    .filter((r) => r.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 5)
    .map((r) => ({ url: shortenUrl(r.url), bytes: r.bytes }));

  return {
    totalJsBytes,
    totalBytes,
    requestCount: responses.length,
    largestChunks,
  };
}

/** Trim a URL to something readable in a terminal/report. */
function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    const file = u.pathname.split('/').pop() || u.pathname;
    return file.length > 48 ? file.slice(0, 45) + '…' : file;
  } catch {
    return url.length > 48 ? url.slice(0, 45) + '…' : url;
  }
}
