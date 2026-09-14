import type { GradientFill, Json } from '@scene-inspector/protocol';

/**
 * What a fill was, in the kind it is not currently in.
 *
 * The switch between a colour and a gradient exists to compare two looks of the
 * same text, and comparing needs both of them to survive the trip. Without a
 * memory each crossing **builds** one kind out of the other — a ramp of one
 * repeated colour, or a colour taken off the first stop — so the first crossing
 * already destroys whichever side was not being looked at, and there is nothing
 * left to compare.
 *
 * The snapshot is taken at the moment of the switch rather than kept up to date,
 * which is what makes edits between crossings count on their own: a colour
 * adjusted after coming back to it is the colour that goes into the memory next
 * time round.
 *
 * How long it lasts is not decided here — it is the lifetime of the component
 * holding it, and that is a node's selection. See `FillKind`.
 */

export interface FillMemory {
  colour: number | string | null;
  gradient: GradientFill | null;
}

export const NO_FILL_MEMORY: FillMemory = { colour: null, gradient: null };

export function asGradient(value: Json | undefined): GradientFill | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  return value['kind'] === 'gradient' ? (value as GradientFill) : null;
}

export function asColour(value: Json | undefined): number | string | null {
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

/**
 * The ramp a colour becomes when there is nothing remembered to go back to: that
 * same colour at both ends.
 *
 * Two stops because one is not a gradient and would be refused; the same colour
 * twice because turning a fill into a gradient should change nothing until a
 * colour is actually aimed.
 */
export function seed(colour: number | string | null): GradientFill {
  const from = colour ?? '#ffffff';

  return {
    kind: 'gradient',
    direction: 'vertical',
    stops: [
      { color: from, offset: 0 },
      { color: from, offset: 1 },
    ],
  };
}

/**
 * Crossing to the other kind.
 *
 * Which kind that is comes from the value rather than from a parameter: the value
 * is already the answer, and a second way of saying it is a second thing to keep
 * in step.
 *
 * @returns what to write, and what to remember once it is written.
 */
export function swapKind(memory: FillMemory, value: Json | undefined): {
  write: Json;
  memory: FillMemory;
} {
  const gradient = asGradient(value);

  if (gradient === null) {
    const colour = asColour(value);

    return {
      write: memory.gradient ?? seed(colour),
      memory: { ...memory, colour },
    };
  }

  return {
    write: memory.colour ?? gradient.stops[0]?.color ?? '#ffffff',
    memory: { ...memory, gradient },
  };
}
