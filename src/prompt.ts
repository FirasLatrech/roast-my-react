import { emitKeypressEvents, type Key } from 'node:readline';
import chalk from 'chalk';

/**
 * A tiny zero-dependency arrow-key select prompt (the interactive list you get
 * in modern CLIs). ↑/↓ or j/k to move, number keys to jump, Enter to confirm,
 * Esc/Ctrl-C to cancel. Redraws in place and collapses to a single confirmation
 * line once chosen. Falls back to the initial choice on a non-TTY stdin.
 */

export interface SelectChoice<T> {
  label: string;
  /** Dim trailing text (e.g. a URL or hint). */
  hint?: string;
  /** Green accent shown after the label (e.g. "recommended"). */
  badge?: string;
  value: T;
}

export function select<T>(opts: {
  message: string;
  choices: Array<SelectChoice<T>>;
  initial?: number;
}): Promise<T> {
  const { choices, message } = opts;
  const stdin = process.stdin;
  const stdout = process.stdout;

  // Non-interactive: just take the initial choice.
  if (!stdin.isTTY) return Promise.resolve(choices[opts.initial ?? 0].value);

  return new Promise<T>((resolve) => {
    let index = Math.min(Math.max(opts.initial ?? 0, 0), choices.length - 1);

    emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdout.write('\x1b[?25l'); // hide cursor

    const lineCount = choices.length + 1; // message + choices

    const draw = (first: boolean): void => {
      if (!first) stdout.write(`\x1b[${lineCount}A`); // jump back to the top
      stdout.write(`  ${chalk.bold(message)}\x1b[K\n`);
      choices.forEach((c, i) => {
        const active = i === index;
        const pointer = active ? chalk.cyan('❯') : ' ';
        const label = active ? chalk.cyan.bold(c.label) : chalk.white(c.label);
        const badge = c.badge ? chalk.green(` ${c.badge}`) : '';
        const hint = c.hint ? chalk.dim(`  ${c.hint}`) : '';
        stdout.write(`  ${pointer} ${label}${badge}${hint}\x1b[K\n`);
      });
    };

    const cleanup = (): void => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write('\x1b[?25h'); // show cursor
    };

    const confirm = (): void => {
      // Collapse the list to a single confirmation line.
      stdout.write(`\x1b[${lineCount}A\x1b[J`);
      const chosen = choices[index];
      stdout.write(`  ${chalk.green('✔')} ${chalk.bold(message)} ${chalk.cyan(chosen.label)}\n\n`);
      cleanup();
      resolve(chosen.value);
    };

    const onKey = (str: string, key: Key): void => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        stdout.write('\n');
        process.exit(130);
      } else if (key.name === 'up' || key.name === 'k') {
        index = (index - 1 + choices.length) % choices.length;
        draw(false);
      } else if (key.name === 'down' || key.name === 'j') {
        index = (index + 1) % choices.length;
        draw(false);
      } else if (key.name === 'return' || key.name === 'enter') {
        confirm();
      } else if (str && /^[1-9]$/.test(str)) {
        const n = Number(str) - 1;
        if (n < choices.length) {
          index = n;
          confirm();
        }
      }
    };

    draw(true);
    stdin.on('keypress', onKey);
  });
}
