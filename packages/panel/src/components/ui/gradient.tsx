import type { GradientFill, GradientStop } from '@scene-inspector/protocol';
import { useMemo } from 'react';
import { FaPlus, FaXmark } from 'react-icons/fa6';

import { useAdvancedNumberInput } from '../../lib/useAdvancedNumberInput.js';
import { Button } from './button.js';
import { ColorInput, normalizeHex } from './color.js';
import { Input } from './input.js';
import { Segmented } from './segmented.js';
import { Hint } from './tooltip.js';
import type { MessageKey } from '../../i18n/index.js';
import { useT } from '../../i18n/index.js';

/**
 * A gradient: the ramp as it will look, and a row per colour in it.
 *
 * The strip is the whole reason this exists. A gradient written out as
 * `#ffec6c, #ffe641, #c07e00` is a fill nobody can picture, and the panel already
 * shows a single colour as a swatch — a list of them deserves the same courtesy.
 * It is painted with CSS from the very numbers being edited, so it is not an
 * illustration of a gradient but the same ramp the renderer will build.
 *
 * The direction sits here rather than in a row of its own because it belongs to
 * the gradient: it travels in the same value, and a row beside the fill would need
 * a condition to appear and a second key to write.
 */

/** How the ramp is drawn, in the direction it says. Offsets are percentages. */
function toCss(value: GradientFill): string {
  const stops = value.stops
    .map((stop) => `${normalizeHex(stop.color)} ${(stop.offset * 100).toFixed(1)}%`)
    .join(', ');

  if (value.direction === 'radial') return `radial-gradient(circle at 50% 50%, ${stops})`;

  return `linear-gradient(${value.direction === 'horizontal' ? 'to right' : 'to bottom'}, ${stops})`;
}

const DIRECTIONS: readonly { value: string; label: string; titleKey: MessageKey }[] = [
  { value: 'vertical', label: '↕', titleKey: 'ui.gradient.vertical' },
  { value: 'horizontal', label: '↔', titleKey: 'ui.gradient.horizontal' },
];

/**
 * Radial is offered only when the gradient already is one. v6/v7 have no such
 * thing, so the option would be a promise the older line cannot keep — but a v8
 * gradient that *is* radial must be able to say so, and to survive being edited.
 */
const RADIAL: { value: string; label: string; titleKey: MessageKey } = {
  value: 'radial',
  label: '◎',
  titleKey: 'ui.gradient.radial',
};

/**
 * One colour of the ramp: where it sits, and a way to take it out.
 *
 * Its own component because the offset field wants the panel's number input, hooks
 * and all, and there is one of these per stop.
 */
function StopRow({
  stop,
  onChange,
  onRemove,
}: {
  stop: GradientStop;
  onChange: (next: GradientStop) => void;
  onRemove: (() => void) | null;
}) {
  const t = useT();
  const { inputProps } = useAdvancedNumberInput({
    value: stop.offset,
    onCommit: (offset) => {
      onChange({ ...stop, offset });
    },
    step: 0.05,
    min: 0,
    max: 1,
    precision: 3,
  });

  /** The cross at the end of the row, named by what it can do just now. */
  const removeLabel = onRemove === null ? t('ui.gradient.needsTwo') : t('ui.gradient.removeStop');

  return (
    <div className="flex min-w-0 items-center gap-1">
      <ColorInput
        compact
        value={typeof stop.color === 'number' || typeof stop.color === 'string' ? stop.color : null}
        onChange={(color) => {
          onChange({ ...stop, color });
        }}
      />

      {/* Where along the ramp, 0 to 1. As narrow as the values allow — `0.75` is
          the longest of them — because what it takes comes off the hex beside it,
          and a colour written `#c07e0` is worse than a cramped number. */}
      <Hint text={t('ui.gradient.offset')}>
        <Input
          {...inputProps}
          type="text"
          inputMode="decimal"
          className="border-border hover:border-secondary focus:border-secondary h-5 w-[4ch] flex-none rounded px-0.5 text-center text-[11px] outline-none"
        />
      </Hint>

      {/* Two colours are the least a gradient can be made of, so the last two
          cannot be taken out — the way back to a single colour is the toggle
          above, which says what it does. The hint sits on a span, not on the
          button: the button it explains is the disabled one, and a disabled
          control never sees the pointer. */}
      <Hint text={removeLabel}>
        <span className="flex flex-none">
          <Button
            variant="ghost"
            size="xs"
            aria-label={removeLabel}
            className="flex-none px-1"
            disabled={onRemove === null}
            onClick={onRemove ?? undefined}
          >
            <FaXmark />
          </Button>
        </span>
      </Hint>
    </div>
  );
}

export interface GradientInputProps {
  value: GradientFill;
  onChange: (value: GradientFill) => void;
}

export function GradientInput({ value, onChange }: GradientInputProps) {
  const t = useT();
  const directions = useMemo(
    () =>
      (value.direction === 'radial' ? [...DIRECTIONS, RADIAL] : DIRECTIONS).map((option) => ({
        ...option,
        title: t(option.titleKey),
      })),
    [t, value.direction],
  );

  const replace = (index: number, stop: GradientStop): void => {
    onChange({ ...value, stops: value.stops.map((old, at) => (at === index ? stop : old)) });
  };

  const remove = (index: number): void => {
    onChange({ ...value, stops: value.stops.filter((_, at) => at !== index) });
  };

  /**
   * A new colour goes into the **widest gap** in the ramp, in the colour that
   * already covers it.
   *
   * Two decisions, both to keep the addition from needing a repair. Appending after
   * the last stop is what one would write first, and it lands on top of that stop
   * whenever the ramp already reaches 1 — which it usually does. And taking the
   * colour from the neighbour means the addition changes nothing visible, so it can
   * be aimed afterwards; a black stop out of nowhere has to be fixed before
   * anything else can be judged.
   */
  const add = (): void => {
    const stops = value.stops;
    const last = stops[stops.length - 1];
    if (last === undefined) {
      onChange({ ...value, stops: [{ color: '#ffffff', offset: 0 }] });
      return;
    }

    // The gap after the last stop counts too, and is the one that is usually
    // meant — unless the ramp is already full, in which case the room is inside.
    let at = stops.length;
    let widest = 1 - last.offset;

    for (let index = 0; index + 1 < stops.length; index += 1) {
      const gap = (stops[index + 1]?.offset ?? 0) - (stops[index]?.offset ?? 0);
      if (gap > widest) {
        widest = gap;
        at = index + 1;
      }
    }

    const before = stops[at - 1] ?? last;
    const after = stops[at];
    const offset = (before.offset + (after?.offset ?? 1)) / 2;

    onChange({
      ...value,
      stops: [...stops.slice(0, at), { color: before.color, offset }, ...stops.slice(at)],
    });
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <Hint text={t('ui.gradient.preview')}>
          <div
            className="border-border h-5 min-w-0 flex-1 rounded border"
            style={{ backgroundImage: toCss(value) }}
          />
        </Hint>

        <Segmented
          className="flex-none"
          value={value.direction}
          options={directions}
          onChange={(direction) => {
            onChange({ ...value, direction: direction as GradientFill['direction'] });
          }}
        />
      </div>

      {value.stops.map((stop, index) => (
        // Keyed by position: a stop has no identity of its own, and keying by
        // colour would remount the row that is being typed into.
        <StopRow
          key={index}
          stop={stop}
          onChange={(next) => {
            replace(index, next);
          }}
          onRemove={
            value.stops.length > 2
              ? () => {
                  remove(index);
                }
              : null
          }
        />
      ))}

      <Button variant="outline" size="xs" className="w-fit gap-1 px-1" onClick={add}>
        <FaPlus /> Stop
      </Button>
    </div>
  );
}
