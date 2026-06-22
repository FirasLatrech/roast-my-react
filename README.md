<div align="center">

# 🔥 roast-my-react

### Your React app has problems. This CLI finds them, then makes fun of you for it.

`roast-my-react` runs a real Lighthouse + axe-core + bundle + re-render audit against your running
app, then turns the cold hard numbers into a brutally funny roast — with an actual fix under
every burn.

```bash
npx roast-my-react
```

![roast-my-react demo](./assets/demo.gif)

[![npm](https://img.shields.io/npm/v/roast-my-react.svg)](https://www.npmjs.com/package/roast-my-react)
[![node](https://img.shields.io/node/v/roast-my-react.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/roast-my-react.svg)](./LICENSE)

</div>

---

## Why

Most perf tools hand you a 4,000-line JSON dump and a vague sense of shame. `roast-my-react` gives you
the same real data — Lighthouse scores, JS payload size, accessibility violations, runaway
re-renders — but distilled into one-liners you'll actually remember, each paired with a concrete fix.
It's a linter with a personality, and it's screenshot-worthy enough to post.

## Install & run

No install required:

```bash
# Auto-detects your running dev server (Next.js, Vite, Astro, Angular, monorepo apps…)
npx roast-my-react

# Or point it at a specific URL
npx roast-my-react --url http://localhost:5173

# Generate a shareable HTML report
npx roast-my-react --report
```

> No `--url`? It scans the common dev-server ports (3000, 5173, 4321, 4200, 8080, …) and audits
> the first running app it finds. If several are up (hello, monorepos), it lists them so you can
> target a specific one with `--url`.

The jokes are powered by a free AI model. Set a key once and you're done — without one you still get
the full audit, just no comedy. See [AI provider](#ai-provider) for the one-line setup.

> Zero setup: the first run automatically downloads a headless Chromium (~120 MB, one-time). No
> global installs, no config files.

## Logging in (dashboards behind auth)

Auditing a page that needs a login? Log in once and the session is saved and reused automatically:

```bash
# Opens a real browser — log in by hand, then press Enter
npx roast-my-react login --url http://localhost:4300

# Future audits of that host just work (uses the saved session)
npx roast-my-react --url http://localhost:4300
```

Sessions are stored in `~/.roast-my-react/auth/`. For CI/tokens, skip the browser entirely:

```bash
npx roast-my-react --url https://app.example.com \
  --header "Authorization: Bearer $TOKEN"
# or reuse an existing Playwright storageState file:
npx roast-my-react --auth ./state.json
```

## Fix it automatically (hand off to a coding agent)

After the roast, send the findings straight to your AI coding agent to actually fix them:

```bash
npx roast-my-react --fix            # auto-detects claude / codex / opencode
npx roast-my-react --fix claude     # or pick one
```

It writes a precise fix prompt to `roast-fixes.md` and launches the agent in your project. No agent
installed? It just leaves the prompt for you to use.

## Audit multiple routes

```bash
npx roast-my-react --routes "/,/dashboard,/settings"
```

Audits each route, prints a per-route grade table, then roasts the combined issues.

## Track regressions (baseline / compare)

```bash
npx roast-my-react --save-baseline      # snapshot today's numbers
# …later, or in a PR…
npx roast-my-react --baseline           # ▲/▼ deltas vs the saved baseline
```

Shows what got better or worse (scores, JS size, issue count) — perfect for catching regressions.

## Share the damage (PNG card)

Every run writes a clean, Twitter-sized `./roast-card.png` (1200×630) with your grade, scores, and
best burns — made for posting. Pass `--no-card` to skip it.

## In CI (comment the roast on PRs)

Drop [`.github/workflows/roast.yml`](.github/workflows/roast.yml) into your repo, add a `GROQ_API_KEY`
secret, and every PR gets a roast comment with the scores and top issues. Adjust the "Start the app"
step to match how your app runs.

## Config file (don't repeat flags)

Drop a `roast.config.json` in your project root (or a `"roast"` key in `package.json`). CLI flags
always override it; it overrides the built-in defaults.

```json
{
  "url": "http://localhost:4300",
  "severity": 3,
  "routes": ["/", "/dashboard", "/settings"],
  "fast": false,
  "model": "llama-3.3-70b-versatile"
}
```

## Flags

| Flag                | Default      | Description                                                    |
| ------------------- | ------------ | -------------------------------------------------------------- |
| `--url <url>`       | auto-detect  | Target a running app. Omit to scan your project config + common ports. |
| `--routes <list>`   | —            | Audit multiple routes, e.g. `--routes "/,/dashboard,/login"`.  |
| `--fast`            | off          | Skip the Lighthouse audit for a much faster run (~4s).         |
| `--fix [agent]`     | off          | Hand the fixes to a coding agent (`claude`/`codex`/`opencode`).|
| `--no-card`         | —            | Skip the shareable PNG card (generated by default at `./roast-card.png`). |
| `--baseline`        | off          | Compare this run to the saved baseline and show deltas.        |
| `--save-baseline`   | off          | Save this run as the baseline for future comparisons.          |
| `--report`          | off          | Write a standalone card-style `./roast-report.html`.           |
| `--severity <n>`    | `2`          | Roast tone: `1` gentle · `2` normal · `3` savage.              |
| `--auth <file>`     | —            | Playwright `storageState` JSON for logged-in pages.            |
| `--header <h...>`   | —            | Extra request header(s), e.g. `--header "Authorization: …"`.   |
| `--json`            | off          | Print raw findings + issues as JSON, skip the roast.           |
| `--no-ai`           | off          | Skip the AI step entirely; show findings only.                 |

Commands: `roast-my-react [options]` (audit) · `roast-my-react login [--url]` (save a session).

## AI provider

The roasts need a (free) AI key — without one you still get the full audit, just no jokes.

```bash
export GROQ_API_KEY=gsk_...   # free, no credit card → https://console.groq.com/keys
```

Want a different model or provider? Any OpenAI-compatible endpoint works via
`ROAST_BASE_URL` + `ROAST_API_KEY` + `ROAST_MODEL` (defaults to a fast, free model). That's the whole
story — no lock-in, nothing else to configure.

## How it works

1. **Crawl** — launches headless Chromium (Playwright) and loads your app, recording every network
   response so it can measure exactly what ships to the browser.
2. **Audit** — runs four collectors in one pass:
   - **Lighthouse** for performance / accessibility / best-practices scores and the biggest
     opportunities.
   - **Bundle analysis** from real transferred bytes — total JS and your fattest chunks.
   - **Re-render instrumentation** — installs a lightweight `__REACT_DEVTOOLS_GLOBAL_HOOK__`
     (the same trick React DevTools and [bippy](https://github.com/aidenybai/bippy) use) and counts
     how many times each component re-renders during a short interaction pass.
   - **axe-core** for WCAG accessibility violations.
3. **Roast** — the structured findings go to a free AI model with a strict JSON contract: one punchy
   roast + one correct fix per issue, matched to your chosen severity. Responses are parsed defensively.
4. **Report** — a clean "diagnosis" in the terminal, plus an optional self-contained HTML report and
   a shareable PNG card with the grade, scores, Core Web Vitals, and every roast/fix.

Everything fails soft: a broken individual audit becomes a warning, not a crashed run. No telemetry,
no signup, zero config.

## Development

```bash
git clone https://github.com/FirasLatrech/roast-my-react
cd roast-my-react
npm install
npm run build
npm link            # makes `roast-my-react` available globally
roast-my-react --url http://localhost:3000
```

`npm run dev` runs the TypeScript compiler in watch mode.

## Contributing

PRs welcome — especially for new audit collectors (Core Web Vitals field data, hydration timing,
image weight) and better roast prompts. Please:

1. Keep the run fast (a full audit of a small app should finish in well under a minute).
2. Make new audits fail soft — append to `findings.warnings`, never throw out of the crawl.
3. Run `npm run build` before opening a PR.

## License

MIT
