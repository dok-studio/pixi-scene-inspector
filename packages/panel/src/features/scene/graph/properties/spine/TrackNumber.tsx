import { useEffect, useState } from 'react';

import { Input } from '../../../../../components/ui/input.js';
import { Hint } from '../../../../../components/ui/tooltip.js';
import { formatNumber } from '../../../../../lib/formatNumber.js';

/**
 * One of a track's numbers, held as a draft while it is being typed into.
 *
 * The live state arrives 25 times a second, and a controlled field fed straight
 * from it cannot hold an unfinished number: a lone `0.` is not one, so the
 * browser sanitises it away and the next poll writes the old value back 40 ms
 * later. The field ended up accepting whole numbers only — while sending every
 * intermediate digit to the scene, so typing a speed of `0.5` stopped the
 * animation on the `0`. Same arrangement as `TextProperty`: the draft wins
 * while it is being edited, the scene wins the rest of the time.
 */
export function TrackNumber({
  label,
  value,
  title,
  onCommit,
}: {
  label: string;
  value: number;
  title?: string;
  onCommit: (next: number) => void;
}) {
  const shown = formatNumber(value, 3);
  const [draft, setDraft] = useState(shown);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(shown);
  }, [shown, editing]);

  const commit = (): void => {
    setEditing(false);

    const next = Number.parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(next)) onCommit(next);
    else setDraft(shown);
  };

  return (
    <Hint text={title ?? ''}>
      <label className="flex flex-1 items-center gap-1">
        <span className="text-muted-foreground">{label}</span>
        <Input
          type="text"
          value={draft}
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
          className="border-border hover:border-secondary h-6 w-full rounded text-xs outline-none"
        />
      </label>
    </Hint>
  );
}
