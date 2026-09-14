import type { EvalFn } from '@scene-inspector/panel';

/**
 * What `chrome.devtools.inspectedWindow.eval` reports back about a call that
 * did not produce a value. Two unrelated failures share the field:
 * `isError` — DevTools could not run the expression (a frame that is gone, a
 * tab mid-navigation); `isException` — it ran and the page threw.
 */
export interface ExceptionInfo {
  isError?: boolean;
  code?: string;
  description?: string;
  details?: unknown[];
  isException?: boolean;
  value?: string;
}

export type EvalCallback = (result: unknown, exceptionInfo?: ExceptionInfo) => void;

/** The shape of `chrome.devtools.inspectedWindow.eval` this module needs. */
export type InspectedWindowEval = (expression: string, callback: EvalCallback) => void;

/**
 * `description` carries `%s` placeholders that `details` fills in, which is how
 * Chrome keeps the message pattern separate from the values. Nobody reassembles
 * it for us, so the panel would otherwise show "No frame with given id %s found".
 */
function describeError(info: ExceptionInfo): string {
  const pattern = info.description ?? info.code ?? 'The expression could not be evaluated';
  const details = info.details ?? [];
  let index = 0;

  return pattern.replace(/%[sdo]/g, (match) => (index < details.length ? String(details[index++]) : match));
}

/**
 * Turns the DevTools eval API into the `EvalFn` the bridge expects.
 *
 * The API predates promises and reports failures through a second callback
 * argument rather than by throwing, so this is the adapter for both. It is the
 * only `chrome.*` call in the panel's data path — the playground substitutes
 * `new Function` here and everything above stays identical.
 *
 * The evaluator is a parameter rather than a direct call to `chrome` so this
 * runs under vitest, where no such object exists.
 */
export function createInspectedEval(evaluate: InspectedWindowEval): EvalFn {
  return (expression: string) =>
    new Promise<unknown>((resolve, reject) => {
      evaluate(expression, (result, info) => {
        if (info?.isError) {
          reject(new Error(describeError(info)));
          return;
        }

        if (info?.isException) {
          reject(new Error(info.value ?? 'The page threw while answering the inspector'));
          return;
        }

        resolve(result);
      });
    });
}
