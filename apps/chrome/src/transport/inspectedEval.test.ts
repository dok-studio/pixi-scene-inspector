import { describe, expect, it } from 'vitest';

import type { EvalCallback, ExceptionInfo } from './inspectedEval.js';
import { createInspectedEval } from './inspectedEval.js';

/** A stand-in for `chrome.devtools.inspectedWindow.eval` that replies at once. */
const replying =
  (result: unknown, exceptionInfo?: ExceptionInfo) =>
  (expression: string, callback: EvalCallback): void => {
    void expression;
    callback(result, exceptionInfo);
  };

describe('createInspectedEval', () => {
  it('hands the expression over unchanged', async () => {
    const seen: string[] = [];
    const evaluate = createInspectedEval((expression, callback) => {
      seen.push(expression);
      callback('"pong"', undefined);
    });

    await evaluate('window.__SI__.call("ping")');

    expect(seen).toEqual(['window.__SI__.call("ping")']);
  });

  it('resolves with the value the page returned', async () => {
    const evaluate = createInspectedEval(replying('{"ok":true}'));

    await expect(evaluate('x')).resolves.toBe('{"ok":true}');
  });

  /**
   * A page with no host answers `null` — that is the normal reply the client
   * turns into `no-host`, not a failure of the bridge.
   */
  it('resolves with null rather than failing when there is no host', async () => {
    const evaluate = createInspectedEval(replying(null));

    await expect(evaluate('x')).resolves.toBeNull();
  });

  it('rejects when the expression could not be evaluated at all', async () => {
    const evaluate = createInspectedEval(
      replying(undefined, {
        isError: true,
        code: 'E_NOTFOUND',
        description: 'No frame with given id %s found',
        details: ['12'],
      }),
    );

    await expect(evaluate('x')).rejects.toThrow('No frame with given id 12 found');
  });

  it('rejects with what the page threw', async () => {
    const evaluate = createInspectedEval(
      replying(undefined, { isException: true, value: 'TypeError: t is not a function' }),
    );

    await expect(evaluate('x')).rejects.toThrow('TypeError: t is not a function');
  });

  /**
   * `exceptionInfo` is always present in the callback; only its flags say
   * whether anything went wrong. Treating the object itself as the signal would
   * turn every successful call into an error.
   */
  it('treats an exceptionInfo with no flags set as success', async () => {
    const evaluate = createInspectedEval(replying('"fine"', { isError: false, isException: false }));

    await expect(evaluate('x')).resolves.toBe('"fine"');
  });
});
