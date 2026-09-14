import { useEffect, useState } from 'react';

import { Input } from '../../../../../components/ui/input.js';
import { useT } from '../../../../../i18n/index.js';
import { Hint } from '../../../../../components/ui/tooltip.js';

/**
 * Which track this row is, as something you can change.
 *
 * Spine addresses tracks by index and the index is what decides the order they
 * are applied in — a higher one draws over a lower one, which is how a game
 * layers a gesture over a walk. So the number is a control, not a label: the
 * panel used to hand out the lowest free one and leave you with it.
 *
 * Held as a draft while it is being typed into, like every other number in this
 * section: the live state arrives 25 times a second, and a field fed straight
 * from it cannot hold a half-typed value.
 */
/**
 * A track index, whole and nothing else.
 *
 * `Number.parseInt` is no guard here: it reads as far as it understands and
 * hands back what it got, so `2.9` commits as 2, `3abc` as 3, and `1e3` — typed
 * by someone meaning track 1000 — as 1. `Number.isInteger` cannot catch any of
 * them, since `parseInt` only ever returns an integer or `NaN`. Matching the
 * whole string first is what turns those into a refusal instead of a move
 * nobody asked for.
 */
const WHOLE_NUMBER = /^\d+$/;

export function TrackIndex({
  index,
  disabled = false,
  onCommit,
}: {
  index: number;
  disabled?: boolean;
  /** Refused — the number is taken, or not a track number at all — is `false`. */
  onCommit: (next: number) => boolean;
}) {
  const t = useT();
  const shown = String(index);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const commit = (): void => {
    setEditing(false);

    const text = draft.trim();
    // Back to what it was on anything the row cannot become: a field left
    // showing a number the row is not would be a lie about where it writes.
    if (!WHOLE_NUMBER.test(text) || !onCommit(Number.parseInt(text, 10))) setDraft(shown);
  };

  return (
    <Hint text={t('spine.trackIndex')}>
      <label className="text-muted-foreground flex shrink-0 items-center">
        <span>#</span>
        <Input
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(event) => {
            setEditing(true);
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commit();
            else if (event.key === 'Escape') {
              setDraft(shown);
              setEditing(false);
            }
          }}
          onBlur={commit}
          className="border-border hover:border-secondary h-6 w-8 rounded px-1 text-center text-xs outline-none"
        />
      </label>
    </Hint>
  );
}
