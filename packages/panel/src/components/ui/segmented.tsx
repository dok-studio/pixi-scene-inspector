import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';

import { cn } from '../../lib/utils.js';
import { Hint } from './tooltip.js';

/**
 * One value out of a handful, as a row of joined buttons.
 *
 * A select hides its choices behind a click and spends a whole control on
 * showing which one is current. For a set of four that never grows — the way a
 * text is aligned, the way a span sits against its line — a segment shows all
 * of them and the answer at once, in less room than the select it replaces.
 *
 * The label is a node rather than a string because some of these sets have a
 * drawing everyone already knows (the four alignment marks) and some do not.
 * `title` is not optional for that reason: an icon has to be able to say what
 * it is.
 */

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  title: string;
}

export interface SegmentedProps {
  value: string;
  options: readonly SegmentedOption[];
  onChange: (value: string) => void;
  className?: string;
  /**
   * How loudly the chosen segment says so.
   *
   * `accent` is the default and the right answer where the segment *is* the
   * subject — the kind of fill a text carries, sitting alone in a group's
   * heading with a form under it that changes when it moves.
   *
   * `quiet` is for a segment that sits **on top of the thing being read**: in a
   * strip of counts, a saturated chip is the brightest object on an otherwise
   * unlit panel, and the eye goes to the control rather than to the numbers it
   * was opened for. It marks the choice with the panel's own ink instead — a
   * tint and a weight, no hue — which is legible without competing, and reads
   * the same in both themes because neither `--raised` nor `--accent` keeps a
   * usable distance from its neighbour in both.
   */
  variant?: 'accent' | 'quiet';
}

const CHOSEN: Record<'accent' | 'quiet', string> = {
  accent:
    'aria-checked:bg-primary aria-checked:text-primary-foreground aria-checked:border-primary',
  quiet:
    'text-muted-foreground aria-checked:bg-foreground/10 aria-checked:text-foreground ' +
    'aria-checked:border-foreground/25 aria-checked:font-bold',
};

/**
 * The same two marks again, for the set below.
 *
 * Radix says "on" with `aria-checked` where one value is chosen and with
 * `aria-pressed` where a set is, and Tailwind builds its classes by **reading**
 * this file rather than by running it — so neither spelling can be made out of
 * the other. They are written out twice, next to each other, so that a colour
 * changed in one is changed in plain sight of the other.
 */
const PRESSED: Record<'accent' | 'quiet', string> = {
  accent:
    'aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:border-primary',
  quiet:
    'text-muted-foreground aria-pressed:bg-foreground/10 aria-pressed:text-foreground ' +
    'aria-pressed:border-foreground/25 aria-pressed:font-bold',
};

/**
 * A word, half a pixel higher than the box says.
 *
 * Centring puts the **line box** in the middle, and a line box is not centred on
 * its letters: this family gives 11.9px above the baseline and 2.8px below it at
 * this size, so the word's own body ends up 0.5px low. On a button 20px tall
 * that is enough to read as a label that slipped, which is what it was reported
 * as.
 *
 * Only words. An icon is drawn on the box's own geometry and is already where it
 * should be, so nudging one would break what the words are being fixed for.
 */
function Label({ children }: { children: string }) {
  return <span className="relative -top-[0.5px]">{children}</span>;
}

export function Segmented({
  value,
  options,
  onChange,
  className,
  variant = 'accent',
}: SegmentedProps) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Clicking the pressed button asks to select nothing, and there is no such
      // style: the property holds one of these whatever happens here.
      onValueChange={(next) => {
        if (next !== '') onChange(next);
      }}
      className={cn('flex', className)}
    >
      {options.map((option) => (
        <Hint key={option.value} text={option.title}>
          <ToggleGroupPrimitive.Item
            value={option.value}
            /*
              A segment that is off is filled rather than left open. Its border
              alone did not carry it: these sit in a group's heading, whose band
              is a tinted `--muted`, and `--border` is a step away from that in
              either theme — near enough that the button read as a word on the
              strip instead of as something to press. `--field` is the panel's
              own "somewhere to act" colour, and it falls on the far side of the
              band in **both** themes: white paper in the light one, a well in
              the dark.
            */
            className={cn(
              'border-border bg-field hover:bg-accent focus-visible:ring-ring flex h-5 min-w-6 items-center justify-center border border-l-0 px-1.5 text-[11px] outline-none transition-colors first:rounded-l first:border-l last:rounded-r focus-visible:ring-1',
              CHOSEN[variant],
            )}
          >
            {typeof option.label === 'string' ? <Label>{option.label}</Label> : option.label}
          </ToggleGroupPrimitive.Item>
        </Hint>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/**
 * The same row of joined buttons, for a set rather than a choice.
 *
 * A separate component instead of a mode on `Segmented`, because the two
 * disagree about the one thing that matters: `Segmented` refuses to hold
 * nothing, and a set has no such rule to make — what a set may and may not be
 * belongs to whoever owns it. Everything below the semantics is shared, so the
 * two rows are the same row by construction rather than by resemblance.
 *
 * Controlled outright: the click is reported as the segment that was pressed,
 * and the owner decides whether anything comes of it. A press that is refused
 * simply renders the values it already had.
 */
export function SegmentedMulti({
  values,
  options,
  onToggle,
  className,
  variant = 'accent',
}: {
  values: readonly string[];
  options: readonly SegmentedOption[];
  onToggle: (value: string) => void;
  className?: string;
  variant?: 'accent' | 'quiet';
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={[...values]}
      onValueChange={(next) => {
        // Radix reports the whole set; the one that moved is the difference,
        // and there is exactly one of it per press.
        const pressed =
          next.find((value) => !values.includes(value)) ??
          values.find((value) => !next.includes(value));

        if (pressed !== undefined) onToggle(pressed);
      }}
      className={cn('flex', className)}
    >
      {options.map((option) => (
        <Hint key={option.value} text={option.title}>
          <ToggleGroupPrimitive.Item
            value={option.value}
            className={cn(
              'border-border bg-field hover:bg-accent focus-visible:ring-ring flex h-5 min-w-6 items-center justify-center border border-l-0 px-1.5 text-[11px] outline-none transition-colors first:rounded-l first:border-l last:rounded-r focus-visible:ring-1',
              PRESSED[variant],
            )}
          >
            {typeof option.label === 'string' ? <Label>{option.label}</Label> : option.label}
          </ToggleGroupPrimitive.Item>
        </Hint>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}
