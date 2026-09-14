import type { EvalFn } from '@scene-inspector/panel';
import { createBridge, createClient } from '@scene-inspector/panel';

/**
 * The stand's end of the bridge.
 *
 * `new Function` rather than a hand-made `Bridge`, and the difference is not
 * cosmetic. `buildCallExpression` is the one place in the project that builds a
 * string to be evaluated in the page, and everything that can go wrong with it
 * — a quote, a newline, a backslash in a node's text — goes wrong in the
 * escaping. A stand that called `__SI__.call` directly would never exercise
 * that string, and the first place the mistake would surface is DevTools.
 *
 * It also keeps the cost honest. `host.call` answers with a *string*, so the
 * full `JSON.stringify` → parse round trip is paid here exactly as it is in the
 * extension. The previous stand handed back a live reference instead, which
 * quietly hid what a payload costs — and at the panel's intervals (the tree
 * every 500 ms, a node's values every 250, Spine's tracks every 40) that is a
 * visible slice of the frame.
 *
 * The one difference worth stating: `inspectedWindow.eval` is asynchronous and
 * crosses a process boundary, and this does neither. Latency measured here is
 * optimistic.
 */
const evaluate: EvalFn = (expression) => {
  try {
    // The expression is an expression, not a statement: without `return` the
    // function answers `undefined`, the bridge reads that as "no host", and the
    // panel shows a page with no inspector on it.
    return Promise.resolve(new Function(`return ${expression};`)() as unknown);
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
};

export const client = createClient(createBridge(evaluate));
