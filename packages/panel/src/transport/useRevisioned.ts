import type { Revisioned } from '@scene-inspector/protocol';
import { useRef } from 'react';

import type { ResourceOptions, ResourceState } from './useResource.js';
import { useResource } from './useResource.js';

/**
 * Polling for a command that answers with a revision.
 *
 * The panel sends back the revision it holds; when the page replies
 * `unchanged`, the data already on screen is kept — and kept as **the same
 * object**, which is what lets `useResource` skip the re-render entirely.
 *
 * This is what replaces the deep comparison the previous project ran on every
 * poll (`isDifferent`, a `JSON.stringify` of both sides). Here the page has
 * already answered the question during a walk it had to make anyway.
 *
 * The held revision lives in a ref rather than in state on purpose: it must not
 * trigger a render, and it must not restart the polling loop.
 */
export function useRevisioned<T>(
  load: (rev: number | undefined) => Promise<Revisioned<T>>,
  options: ResourceOptions,
): ResourceState<T> {
  const held = useRef<{ rev: number | undefined; data: T | null }>({ rev: undefined, data: null });

  /*
   * A revision answers one question, so it is dropped when the question
   * changes. `key` is what the request is *about* — a node id, a set of keys —
   * and carrying the previous subject's revision into the next one asks the
   * page whether something it was never asked about has changed. The answer is
   * almost always no, and `unchanged` would then hand back the previous node's
   * data as if it were this one's.
   *
   * Reset during the render that sees the new key rather than in an effect: the
   * poll `useResource` restarts is scheduled from its own effect, and an effect
   * here would be racing it for who runs first.
   */
  const subject = useRef(options.key);
  if (subject.current !== options.key) {
    subject.current = options.key;
    held.current = { rev: undefined, data: null };
  }

  const state = useResource<T | null>(async () => {
    const result = await load(held.current.rev);

    held.current = {
      rev: result.rev,
      data: 'unchanged' in result ? held.current.data : result.data,
    };

    return held.current.data;
  }, options);

  return { data: state.data, error: state.error, loading: state.loading };
}
