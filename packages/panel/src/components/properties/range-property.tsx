import { useEffect, useState } from 'react';

import { Input } from '../ui/input.js';
import { Slider } from '../ui/slider.js';
import type { PropertyPanelData } from './propertyTypes.js';
import { optionsOf } from './propertyTypes.js';

interface RangeOptions {
  min: number;
  max: number;
  step: number;
}

/**
 * A slider with a number beside it, ported from the previous project.
 *
 * The field holds text while it is being typed into and only commits on Enter,
 * which is what lets a polled value keep arriving without overwriting a
 * half-typed number. Escape puts the last committed value back.
 */
export const RangeProperty: React.FC<PropertyPanelData> = ({ value, entry }) => {
  const options = optionsOf<RangeOptions>({ value, entry, prop: '' });
  const min = options.min ?? 0;
  const max = options.max ?? 100;

  const toNumber = (raw: PropertyPanelData['value']): number =>
    typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;

  const [committed, setCommitted] = useState(() => toNumber(value));
  const [text, setText] = useState(() => String(toNumber(value)));

  /**
   * Whether the value on screen is the user's rather than the scene's.
   *
   * Without it the promise above is not kept: the effect below runs on every
   * poll, and `alpha` — this editor's main tenant — is exactly the kind of
   * property an application animates. A half-typed number was wiped a quarter
   * of a second after the first keystroke, and the thumb sprang back mid-drag.
   */
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (editing || dragging) return;

    const next = toNumber(value);
    setCommitted(next);
    setText(String(next));
  }, [value, editing, dragging]);

  const clamp = (next: number): number => Math.min(max, Math.max(min, next));

  const apply = (next: number): void => {
    const clamped = clamp(next);
    setCommitted(clamped);
    setText(String(clamped));
    setEditing(false);
    entry.onChange(clamped);
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-2">
      <Input
        type="text"
        value={text}
        onChange={(event) => {
          const raw = event.target.value;
          // A decimal comma is accepted, as is a number that is not finished yet.
          if (!/^-?\d*[.,]?\d*$/.test(raw)) return;
          setEditing(true);
          setText(raw);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            const parsed = Number.parseFloat(text.replace(',', '.'));
            if (!Number.isNaN(parsed)) apply(parsed);
          }

          if (event.key === 'Escape') {
            setText(String(committed));
            setEditing(false);
          }
        }}
        onBlur={() => {
          // Leaving the field without committing gives the scene its say back.
          setEditing(false);
          setText(String(committed));
        }}
        className="border-border hover:border-secondary focus:border-secondary h-6 w-12 flex-none rounded text-xs outline-none"
      />

      <Slider
        min={min}
        max={max}
        step={options.step ?? 1}
        value={[committed]}
        onValueChange={([next]) => {
          if (next === undefined) return;
          setDragging(true);
          setCommitted(next);
          setText(String(next));
          entry.onChange(next);
        }}
        onValueCommit={() => {
          setDragging(false);
        }}
        className="border-border hover:border-secondary focus:border-secondary h-6 flex-1 rounded outline-none"
      />
    </div>
  );
};
