import { useEffect, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

import { cn } from '../../lib/utils.js';
import type { Rgb } from './colorChannels.js';
import { parseChannel, toRgb, withChannel } from './colorChannels.js';
import { Input } from './input.js';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from './popover.js';
import { Hint } from './tooltip.js';
import { useT } from '../../i18n/index.js';

/**
 * A colour swatch that opens the picker, and a hex field beside it — ported
 * from the previous project.
 *
 * PixiJS reports colours as numbers and accepts strings, so the value arrives
 * either way and always leaves as `#rrggbb`.
 *
 * The picker carries a hex field and one field per channel under the square.
 * Both are there on purpose: the square is how a colour is chosen, and the
 * fields are how one is *stated* — a value copied out of a design, or a single
 * channel nudged by one. Neither can be done by dragging, and the square alone
 * left the panel with no way to say a number at all.
 *
 * **The swatch is the handle.** There used to be a 🎨 button beside the field
 * for it, and a gradient stop dropped the button because its width was the
 * difference between the hex fitting the row and not. That made the stop the
 * odd one out for no reason anyone could see: the swatch already shows the
 * colour, so it is the thing a hand goes to, and the button was a second way to
 * say the same thing that cost every row a control's worth of width. Now every
 * row opens the way a stop does.
 */

export interface ColorProps {
  value: number | string | null;
  onChange: (color: string) => void;
  /**
   * The tighter row a gradient stop needs.
   *
   * A stop is one of several in a column, so it is the height of its swatch and
   * spends less on padding and gaps than a row that stands alone.
   */
  compact?: boolean;
}

/**
 * What a keystroke may leave in the field.
 *
 * Eight digits, not six: a v8 gradient stop arrives as `#rrggbbaa` and only a
 * fully opaque one is trimmed back to six. A six-digit filter over a nine-
 * character value rejected every key including Backspace, which leaves seven
 * digits behind — so a stop with an alpha could not be edited at all.
 */
const HEX_REGEX = /^#?[0-9A-Fa-f]{0,8}$/;

/**
 * `#abc` and `abc` alike, plus the six- and eight-digit forms.
 *
 * Eight because PixiJS 8 normalises a gradient's stops through `toHexa()` and
 * hands them back as `#rrggbbaa` — a colour written `#8ecaff` in the application
 * arrives here as `#8ecaffff`.
 */
const IS_HEX = /^#?(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/**
 * Exported for the gradient preview, which paints its ramp with CSS and therefore
 * needs the same reading of a colour the swatch beside it shows.
 */
export function normalizeHex(value: number | string | null | undefined): string {
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`;

  if (typeof value === 'string') {
    if (!IS_HEX.test(value)) {
      // A CSS keyword — PixiJS defaults a text shadow to `'black'`, and v8
      // reports it back that way. Padding it into hex produced `#0black`;
      // browsers understand the keyword as it stands, so it is left alone.
      return value;
    }

    const digits = value.replace('#', '');
    const expanded =
      digits.length === 3
        ? digits
            .split('')
            .map((c) => c + c)
            .join('')
        : digits;

    // An alpha of `ff` says nothing and costs two characters in a field that has
    // few to spare. Any other alpha is kept — browsers read `#rrggbbaa`, so the
    // swatch beside this stays truthful.
    const trimmed =
      expanded.length === 8 && expanded.slice(6).toLowerCase() === 'ff'
        ? expanded.slice(0, 6)
        : expanded;

    return `#${trimmed.padStart(6, '0')}`;
  }

  return '#ffffff';
}

/**
 * The field shared by the hex row and the three channel rows inside the picker.
 *
 * The fill comes from `Input` itself (`bg-field`), so these read as the same
 * kind of field as the ones in the rows below — which matters here more than
 * anywhere, because the picker floats over exactly those rows.
 */
const PICKER_FIELD =
  'border-border hover:border-secondary focus:border-secondary h-5 w-full min-w-0 rounded px-1 text-xs outline-none';

/**
 * One channel of the colour, as a number between 0 and 255.
 *
 * It keeps its own text while it is being typed, for the same reason the hex
 * field does: `12` on the way to `128` is not a request to make the channel
 * that dark, so nothing is sent until Enter or the field is left. `null` is a
 * colour the panel could not read — a CSS keyword — and there is no number to
 * show or change, so the field says so and stays out of the way.
 */
const ChannelField: React.FC<{
  label: string;
  value: number | null;
  onCommit: (next: number) => void;
}> = ({ label, value, onCommit }) => {
  const t = useT();
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setText(value === null ? '' : String(value));
  }, [value]);

  const commit = (): void => {
    const parsed = parseChannel(text);

    if (parsed === null) {
      setText(value === null ? '' : String(value));
      return;
    }

    setText(String(parsed));
    onCommit(parsed);
  };

  const field = (
    <Input
      type="text"
      inputMode="numeric"
      value={text}
      disabled={value === null}
      onChange={(event) => {
        setText(event.target.value);
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit();
          // The picker above closes on Enter; committing a channel is not a
          // reason to be done with it.
          event.stopPropagation();
        } else if (event.key === 'Escape') {
          setText(value === null ? '' : String(value));
        }
      }}
      className={PICKER_FIELD}
    />
  );

  return (
    <label className="flex min-w-0 flex-1 items-center gap-1">
      <span className="text-muted-foreground flex-none text-[10px] leading-none">{label}</span>
      {/* Only the field that cannot be used says why, and the hint hangs on a
          span around it rather than on the field itself: a disabled control
          takes no pointer events, so a hint on one would never be shown. */}
      {value === null ? (
        <Hint text={t('ui.color.keyword')}>
          <span className="flex min-w-0 flex-1">{field}</span>
        </Hint>
      ) : (
        field
      )}
    </label>
  );
};

export const ColorInput: React.FC<ColorProps> = ({ value, onChange, compact = false }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => normalizeHex(value));

  useEffect(() => {
    setText(normalizeHex(value));
  }, [value]);

  const preview = normalizeHex(text);
  const rgb = toRgb(preview);

  /**
   * What Enter does to the hex field, wherever it is.
   *
   * The field is in the row and again inside the picker, and both mean the same
   * thing by a hex — so they share the keystroke rather than each having their
   * own reading of it.
   */
  const commitText = (): void => {
    // An unfinished number is not a colour. The keystroke filter lets one stand
    // while it is being typed, so this is where it is stopped — otherwise Enter
    // on `#8ecaff8` would send those seven digits on.
    if (!IS_HEX.test(text)) return;

    const clean = text.replace('#', '');
    // `#abc` is the shorthand everyone types; expand it before sending.
    const formatted =
      clean.length === 3
        ? `#${clean
            .split('')
            .map((c) => c + c)
            .join('')}`
        : normalizeHex(clean);

    setText(formatted);
    onChange(formatted);
  };

  const hexKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'Enter') {
      commitText();
      event.stopPropagation();
    } else if (event.key === 'Escape') {
      setText(normalizeHex(value));
      setOpen(false);
    }
  };

  const setChannel =
    (channel: keyof Rgb) =>
    (next: number): void => {
      const changed = withChannel(preview, channel, next);
      if (changed === null) return;

      setText(changed);
      onChange(changed);
    };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Whatever was half-typed into a field goes back to the colour that is
        // actually set — closing the picker is not a way to commit it.
        if (!next) setText(normalizeHex(value));
      }}
    >
      {/* The picker is placed against the row, not against the swatch that opens
          it: the swatch sits at the far left of a control the picker is wider
          than, and anchoring to it would throw the picker off the panel. */}
      <PopoverAnchor asChild>
        <div className={cn('flex w-full min-w-0 items-center', compact ? 'gap-1' : 'gap-2')}>
          <Hint text={t('ui.color.pick')}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hover:border-secondary h-5 w-6 flex-none rounded border"
                style={{ backgroundColor: preview }}
              />
            </PopoverTrigger>
          </Hint>

          <Input
            type="text"
            value={text}
            onChange={(event) => {
              if (HEX_REGEX.test(event.target.value)) setText(event.target.value);
            }}
            onKeyDown={hexKeyDown}
            className={cn(
              'border-border hover:border-secondary focus:border-secondary w-full min-w-0 rounded text-xs outline-none',
              // A stop is one of several in a column, so it is the height of its
              // swatch and spends less on padding: at the panel's narrowest, those
              // four pixels are the seventh character of `#1a4a7a`.
              compact ? 'h-5 px-1' : 'h-6',
            )}
          />
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="si-color-picker w-[248px]"
        // The picker lines up with the right edge of the section, whichever row
        // opened it. A plain colour row reaches that edge on its own; a stop
        // stops short of it, because the offset field and the button that drops
        // the stop come after — and those are the stop's row, not the colour's,
        // so the anchor knows nothing about them. Fifty-two pixels is what they
        // measure (`gradient.tsx`: `gap-1`, a `4ch` field, `gap-1`, a `px-1`
        // button); a few either way with the font is not something an eye picks
        // out, and a panel too narrow for the result has Radix pull it back in.
        alignOffset={compact ? -52 : 0}
        onKeyDown={(event) => {
          // Only what reached the picker unhandled: the fields inside stop their
          // own Enter, because committing one is not the same as being finished
          // with the picker. Escape is Radix's own business.
          if (event.key === 'Enter') {
            commitText();
            setOpen(false);
          }
        }}
      >
        <HexColorPicker
          color={preview}
          onChange={(next) => {
            setText(next);
            onChange(next);
          }}
        />

        <label className="mt-2 flex items-center gap-1">
          <span className="text-muted-foreground flex-none text-[10px] leading-none">HEX</span>
          <Input
            type="text"
            value={text}
            onChange={(event) => {
              if (HEX_REGEX.test(event.target.value)) setText(event.target.value);
            }}
            onKeyDown={hexKeyDown}
            className={PICKER_FIELD}
          />
        </label>

        <div className="mt-1 flex items-center gap-1">
          <ChannelField label="R" value={rgb?.r ?? null} onCommit={setChannel('r')} />
          <ChannelField label="G" value={rgb?.g ?? null} onCommit={setChannel('g')} />
          <ChannelField label="B" value={rgb?.b ?? null} onCommit={setChannel('b')} />
        </div>
      </PopoverContent>
    </Popover>
  );
};
