import { HOST_GLOBAL } from '@scene-inspector/protocol';

/**
 * Evaluates an expression in the inspected page and returns its value.
 *
 * In the extension this is `chrome.devtools.inspectedWindow.eval`; in the
 * local playground it is `new Function`. Both receive the same string, so the
 * code path is identical.
 */
export type EvalFn = (expression: string) => Promise<unknown>;

export interface Bridge {
  /** @returns the serialized response envelope, or `null` if there is no host. */
  send(raw: string): Promise<string | null>;
}

/**
 * **The single place in the project that builds a string to be evaluated in
 * the page.**
 *
 * Arguments are not interpolated one by one — the whole envelope is already
 * serialized into `raw`, and `JSON.stringify(raw)` turns it into a correct
 * string literal with exactly one round of escaping. Nothing above this layer
 * has to think about quotes, newlines or apostrophes in user data.
 */
export function buildCallExpression(raw: string): string {
  return `(window.${HOST_GLOBAL} ? window.${HOST_GLOBAL}.call(${JSON.stringify(raw)}) : null)`;
}

export function createBridge(evaluate: EvalFn): Bridge {
  return {
    async send(raw: string): Promise<string | null> {
      const value = await evaluate(buildCallExpression(raw));
      return typeof value === 'string' ? value : null;
    },
  };
}
