/**
 * The red, green and blue of a colour the swatch has already normalised.
 *
 * Kept apart from the component because this is where the arithmetic is, and
 * arithmetic is what tests can hold on to. Everything here takes a hex string
 * in the shape `normalizeHex` produces — `#rrggbb` or `#rrggbbaa` — and never
 * reaches for the DOM.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const NORMALISED = /^#(?:[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

/**
 * The three channels, or `null` when the value is not a colour we can read.
 *
 * `normalizeHex` lets a CSS keyword through untouched — PixiJS defaults a text
 * shadow to `'black'` and reports it back that way — and there is no honest
 * number to put in a field for one. `null` says exactly that, so the fields can
 * go quiet instead of claiming a zero the user would then edit into a colour
 * they never asked for.
 */
export function toRgb(hex: string): Rgb | null {
  if (!NORMALISED.test(hex)) return null;

  const n = Number.parseInt(hex.slice(1, 7), 16);
  return { r: (n >>> 16) & 255, g: (n >>> 8) & 255, b: n & 255 };
}

/** A channel is a byte, whatever was typed or stepped into it. */
export function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * The same colour with one channel replaced.
 *
 * The alpha rides along untouched: a v8 gradient stop arrives as `#rrggbbaa`,
 * and nudging its red is no reason to make it opaque.
 */
export function withChannel(hex: string, channel: keyof Rgb, value: number): string | null {
  const rgb = toRgb(hex);
  if (rgb === null) return null;

  const next = { ...rgb, [channel]: clampChannel(value) };
  const digits = ((next.r << 16) | (next.g << 8) | next.b).toString(16).padStart(6, '0');

  return `#${digits}${hex.slice(7)}`;
}

/**
 * What a field's text says, if it says a channel at all.
 *
 * Three digits at most, and nothing else — a half-typed field is not a number,
 * and the empty one left behind by Backspace is not a zero.
 */
export function parseChannel(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;

  return clampChannel(Number.parseInt(trimmed, 10));
}
