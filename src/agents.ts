import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import chalk from 'chalk';
import type { Findings, RoastedIssue } from './types.js';

/**
 * Hand the roast off to an AI coding agent so it can actually *fix* the issues
 * in the current project. We write a focused fix-prompt to disk, then launch
 * the chosen agent (Claude Code / Codex / opencode) in the cwd with that prompt.
 */

interface AgentSpec {
  name: string;
  bin: string;
  /** Build argv for launching the agent with an initial prompt. */
  args: (prompt: string) => string[];
}

const AGENTS: Record<string, AgentSpec> = {
  claude: { name: 'Claude Code', bin: 'claude', args: (p) => [p] },
  codex: { name: 'Codex', bin: 'codex', args: (p) => [p] },
  opencode: { name: 'opencode', bin: 'opencode', args: (p) => ['run', p] },
};

/** True if a binary is on PATH. */
function hasBin(bin: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Pick the agent: explicit choice, else first installed one. */
function resolveAgent(choice: string | undefined): AgentSpec | null {
  if (choice && choice !== 'auto') {
    const spec = AGENTS[choice.toLowerCase()];
    return spec ?? null;
  }
  for (const key of ['claude', 'codex', 'opencode']) {
    if (hasBin(AGENTS[key].bin)) return AGENTS[key];
  }
  return null;
}

/** Compose a precise, agent-ready prompt from the findings. */
export function buildFixPrompt(findings: Findings, roasts: RoastedIssue[]): string {
  const lines: string[] = [];
  lines.push(`# Fix the performance & accessibility issues in this app`);
  lines.push('');
  lines.push(
    `An audit of ${findings.url} (this project) found the issues below. ` +
      `Fix them in this codebase, highest-impact first. For each, find the relevant ` +
      `source files, make the change, and briefly explain what you did. Don't break behavior.`
  );
  lines.push('');
  const scores = findings.lighthouse?.scores ?? [];
  if (scores.length) {
    lines.push(
      `Lighthouse: ${scores.map((s) => `${s.title} ${s.score ?? 'n/a'}/100`).join(', ')}.`
    );
  }
  if (findings.bundle) {
    lines.push(
      `Bundle: ${(findings.bundle.totalJsBytes / 1024 / 1024).toFixed(1)} MB JS across ` +
        `${findings.bundle.requestCount} requests.`
    );
  }
  lines.push('');
  lines.push(`## Issues (${roasts.length})`);
  roasts.forEach((r, i) => {
    lines.push('');
    lines.push(`### ${i + 1}. [${r.category}] ${r.title}`);
    if (r.fix) lines.push(`Suggested fix: ${r.fix}`);
  });
  lines.push('');
  lines.push(
    `Start with the largest bundle/perf wins (code splitting, removing unused JS, ` +
      `lazy-loading) since those move the score most.`
  );
  return lines.join('\n');
}

export interface HandoffResult {
  promptPath: string;
  launched: boolean;
  agentName?: string;
}

/**
 * Writes the fix prompt to `roast-fixes.md` and launches the chosen agent.
 * If no agent is found/installed, returns the path so the CLI can guide the user.
 */
export function handOffToAgent(
  findings: Findings,
  roasts: RoastedIssue[],
  choice: string | undefined
): HandoffResult {
  const prompt = buildFixPrompt(findings, roasts);
  const promptPath = resolve(process.cwd(), 'roast-fixes.md');
  writeFileSync(promptPath, prompt, 'utf8');

  const agent = resolveAgent(choice);
  if (!agent || !hasBin(agent.bin)) {
    return { promptPath, launched: false, agentName: agent?.name };
  }

  console.log('');
  console.log(chalk.cyan(`  🤖  Handing the fixes to ${chalk.bold(agent.name)}…`));
  console.log(chalk.dim(`      (prompt saved to ${promptPath})`));
  console.log('');

  // Launch the agent interactively in the current project, seeded with the prompt.
  const result = spawnSync(agent.bin, agent.args(prompt), { stdio: 'inherit' });
  return { promptPath, launched: result.error == null, agentName: agent.name };
}
