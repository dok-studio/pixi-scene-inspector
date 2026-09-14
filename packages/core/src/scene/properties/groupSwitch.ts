import type { Json } from '@scene-inspector/protocol';

/**
 * What a group switch is written with.
 *
 * A switch takes `false` to go off and, to come back on, either `true` or the
 * settings it is coming back to — a record of the group's other declared keys.
 *
 * The record exists because turning a group back on and restoring what it held
 * cannot be two commands. Every call crosses the bridge as its own
 * `inspectedWindow.eval`, with no queue behind them, so a sequence has neither
 * an order nor an all-or-nothing: on v8 a blur written before its shadow object
 * exists is a silent no-op, and half a restored shadow is worse than none. One
 * value, applied in one pass, has both properties for free.
 *
 * What the record may hold is not decided here — every key in it is put back
 * through the same schema allow-list any other write goes through, which is what
 * stops it being a way to reach a path nobody declared. This module only says
 * what a settings record **looks** like, and it is deliberately narrow: a
 * gradient is an object too, and a fill written as one must stay a value rather
 * than become a bag of instructions.
 */

/** The group's other keys and what to put in them, spelled as the schema does. */
export type GroupSettings = Record<string, Json>;

const GRADIENT_KIND = 'gradient';

/**
 * @returns the settings a switch was handed, or null when it was handed a plain
 * `true`/`false` — or anything that is not either.
 */
export function asSettings(value: Json): GroupSettings | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;

  // A gradient is the one object that travels as a value; see `GradientFill`.
  if (value['kind'] === GRADIENT_KIND) return null;

  return value as GroupSettings;
}

/**
 * @returns whether this write turns the switch on. Settings mean on — there is
 * nothing to restore into an off group — and so does a bare `true`.
 */
export function switchesOn(value: Json): boolean {
  return value === true || asSettings(value) !== null;
}
