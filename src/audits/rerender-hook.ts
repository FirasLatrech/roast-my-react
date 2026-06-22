/**
 * Source for the init script injected into the page *before* any app code runs.
 *
 * It installs a minimal stand-in for `__REACT_DEVTOOLS_GLOBAL_HOOK__` — the same
 * global React looks for when DevTools is present (the approach `bippy` and React
 * DevTools both use). On every commit we walk the fiber tree and tally how many
 * times each named component re-rendered (a fiber with an `alternate` is an
 * update, not an initial mount). The tallies are stashed on `window.__ROAST__`
 * for the driver to read back after the interaction pass.
 *
 * This is a heuristic, not a profiler: it counts committed updates per component
 * name, which is exactly the signal we want for "this thing renders way too much".
 */
export const RERENDER_HOOK_SOURCE = /* js */ `
(() => {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;

  const counts = Object.create(null);
  let commits = 0;

  const getName = (fiber) => {
    const t = fiber && fiber.type;
    if (!t) return null;
    if (typeof t === 'string') return null; // host components (div, span…)
    return t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || null;
  };

  const walk = (fiber, seen) => {
    if (!fiber || seen.has(fiber)) return;
    seen.add(fiber);
    // alternate present => this fiber committed an update (re-render), not a mount.
    if (fiber.alternate) {
      const name = getName(fiber);
      if (name) counts[name] = (counts[name] || 0) + 1;
    }
    if (fiber.child) walk(fiber.child, seen);
    if (fiber.sibling) walk(fiber.sibling, seen);
  };

  const hook = {
    renderers: new Map(),
    supportsFiber: true,
    inject(renderer) {
      const id = this.renderers.size + 1;
      this.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(_id, root) {
      commits++;
      try { walk(root.current, new Set()); } catch (_) { /* defensive */ }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    // DevTools also probes these — keep them as no-ops so React stays happy.
    checkDCE() {},
    on() {},
    sub() { return () => {}; },
    emit() {},
  };

  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    value: hook,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  window.__ROAST__ = {
    snapshot() {
      return { counts: { ...counts }, commits };
    },
  };
})();
`;
