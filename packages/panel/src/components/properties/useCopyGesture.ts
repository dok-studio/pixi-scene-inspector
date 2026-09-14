import { useEffect, useState } from 'react';

import { cn } from '../../lib/utils.js';

/**
 * Copying a field by double-clicking the name that labels it.
 *
 * A gesture rather than a button, and that is the decision: a button beside
 * every row would cost the width of a button on every row, for something
 * reached now and then. The name is already there, already says which field
 * this is, and has nothing else to do with a double click.
 *
 * It lives in a hook because the two tabs draw their rows with different
 * components — `PropertyEntry` under Properties, the grid's `Cell` under Text —
 * and a gesture that behaved differently between them would be two gestures.
 */

/**
 * A blink rather than a state: long enough to be seen, short enough that the
 * row is not still saying something about the last copy while it is being read.
 */
const COPIED_MS = 350;

export interface CopyGesture {
  /** Added to the name's own classes; undefined where there is nothing to copy. */
  className: string | undefined;
  onDoubleClick: (() => void) | undefined;
}

export function useCopyGesture(copy: string | undefined): CopyGesture {
  const copyable = copy !== undefined && copy !== '';

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;

    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  if (!copyable) return { className: undefined, onDoubleClick: undefined };

  return {
    // The name lights up rather than changing to a tick: this is a label in a
    // column of labels, and a word that comes and goes moves the row it is in.
    //
    // `select-none` because a double click on text selects the word under it,
    // and a name left highlighted after every copy reads as something being
    // edited.
    //
    // The cursor is the whole hint. A tooltip was tried and taken out again: a
    // name is passed over on the way to every field beside it, so a bubble
    // explaining the gesture appeared constantly and was in the way of the
    // value being read — a price paid on every row for something learnt once.
    className: cn('cursor-copy select-none', copied && 'text-primary'),
    onDoubleClick: () => {
      // Fire-and-forget, as in `CopyButton`: a clipboard the browser refuses is
      // not something the panel can do anything about.
      void navigator.clipboard?.writeText(copy).catch(() => undefined);
      setCopied(true);
    },
  };
}
