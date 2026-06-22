#!/usr/bin/env bash
set -euo pipefail
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# Records the roast-my-react demo GIF using VHS.
# Requires: vhs, npm, a Groq API key (or other ROAST_* config) for the roasts.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FIXTURE_DIR="$ROOT_DIR/examples/slow-roast-app"
PORT=5173

# Prefer the vendored vhs binary in .bin, fall back to PATH
if [[ -x "$ROOT_DIR/.bin/vhs" ]]; then
  VHS="$ROOT_DIR/.bin/vhs"
  export PATH="$ROOT_DIR/.bin:$PATH"
elif command -v vhs >/dev/null 2>&1; then
  VHS="vhs"
else
  echo "❌ vhs is not installed. Install it with:"
  echo "   brew install charmbracelet/tap/vhs"
  exit 1
fi

if [[ -z "${GROQ_API_KEY:-}${ROAST_API_KEY:-}${OPENAI_API_KEY:-}${OPENROUTER_API_KEY:-}" ]]; then
  echo "⚠️  No AI API key found. The demo will still run, but roasts will be skipped."
  echo "   Set GROQ_API_KEY for free roasts: https://console.groq.com/keys"
fi

echo "🔨 Building roast-my-react..."
cd "$ROOT_DIR"
npm run build

echo "🔨 Building fixture app..."
cd "$FIXTURE_DIR"
npm install
npm run build >/dev/null 2>&1 || true

echo "🚀 Starting fixture app on port $PORT"
npm run dev -- --port "$PORT" &
DEV_PID=$!

# Clean up the dev server on exit
cleanup() {
  echo "🛑 Stopping fixture app..."
  kill "$DEV_PID" 2>/dev/null || true
  pkill -f "vite --port $PORT" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for the dev server to be ready
for i in {1..30}; do
  if curl -s "http://localhost:$PORT" >/dev/null 2>&1; then
    echo "✅ Fixture app is ready."
    break
  fi
  sleep 1
done

echo "🎬 Recording GIF with VHS..."
cd "$ROOT_DIR"
$VHS assets/demo.tape

echo ""
echo "✅ Demo GIF saved to: $ROOT_DIR/assets/demo.gif"
echo "   Update README.md if needed."
