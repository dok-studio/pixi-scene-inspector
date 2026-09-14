/**
 * A colour for a heading, so the eye can find one again.
 *
 * A column of fifteen cells under five identical grey strips is read by counting
 * strips. A faint hue per heading turns that into recognition — "the stroke is
 * the brown one" — which is worth having and is worth almost nothing if it
 * shouts. So the tint is a **small amount of hue mixed into the band the theme
 * already gives**, not a colour of its own: `--muted` is near-white in the light
 * theme and near-black in the dark one, and mixing keeps the band the same
 * brightness as before in both. Nothing else about the heading changes.
 *
 * **Which hue comes from the name**, and from nothing else. Two alternatives
 * were considered and both are worse:
 *
 *  - a list of group names here would put the schema's wording into the shared
 *    grid, which is exactly what `propertyGrid.tsx` avoids elsewhere by finding a
 *    fill through its editor rather than through the word `Fill`;
 *  - the group's position in the section is stable within one section and not
 *    between two, because a tag draws only the groups it overrides. `Stroke`
 *    would be the third colour on a node and the first on a tag, which is worse
 *    than no colour at all.
 *
 * A name, hashed, is the same colour everywhere it appears — on the Text tab, on
 * every tag, and on a group the schema has not been written yet.
 */

/**
 * FNV-1a over the name's code units.
 *
 * A hash rather than an order, so the same group is the same colour wherever it
 * is drawn.
 */
function hash(name: string): number {
  let value = 0x811c9dc5;

  for (let index = 0; index < name.length; index += 1) {
    value ^= name.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }

  return value >>> 0;
}

/**
 * Anywhere on the wheel, rather than a hue picked from a short list.
 *
 * A list was tried first, on the reasoning that a dozen chosen hues would be
 * further apart than chance allows. It does the opposite: twelve slots put
 * `Stroke` and `Shadow` — the two headings most often read one above the other —
 * on the same colour. The whole wheel gives the five groups of a text style
 * nineteen degrees apart at their closest and the rest much more, and no list has
 * to be kept in step with a schema.
 *
 * No hue is excluded. At this strength a red is a faint pink over a near-white
 * band and a shade of charcoal over a near-black one, and neither reads as the
 * warning a saturated red would be.
 */
/**
 * Names that were given a hue rather than dealt one.
 *
 * This is **not** the list of names the doc above argues against, and the
 * difference is that this one may be empty. That list had to be complete: a
 * group missing from it had no colour at all, and renaming a group in the schema
 * broke it silently. This one is consulted and fallen through — a name that is
 * not here is hashed like any other, and a group renamed in the schema quietly
 * goes back to being dealt a hue.
 *
 * These three are here because the hues chance dealt them were **rearranged by
 * eye**: the blue that landed on `Stroke` suits a fill better, the green that
 * landed on `Fill` suits a layout, and what was left went to the stroke. A hash
 * has no opinion about which colour suits which idea; someone looking at the
 * panel does. `Font` and `Shadow` were left as dealt.
 *
 * The three still sit clear of each other and of the two that were not chosen —
 * see the test, which is what keeps a later change to any of them honest.
 */
const CHOSEN: Record<string, number> = {
  Fill: 237,
  Stroke: 20,
  Layout: 168,
};

export function hueOf(name: string): number {
  return CHOSEN[name] ?? hash(name) % 360;
}

/**
 * How much of the hue reaches the band.
 *
 * Enough to tell two headings apart when they are one above the other, and not
 * enough to read as a state — a coloured strip in a panel usually means
 * something is wrong or selected, and a group heading means neither.
 */
const MIX = 22;

/**
 * How colourful the hue being mixed in is, and — because it is stated in `oklch`
 * — how colourful **every** hue is, to the eye rather than to the arithmetic.
 *
 * This is the whole reason the tint is not written in `hsl`. At one saturation
 * HSL gives wildly different amounts of colour per hue: a blue at `50%` lightness
 * is far more of a colour than a yellow-green at the same numbers, so a
 * hue-per-group scheme comes out with two bands shouting and three whispering.
 * A fixed chroma in `oklch` makes every group's band as faint as every other's,
 * which is what lets the amount be tuned once for all of them.
 */
const TINT = 'oklch(62% 0.13 %h)';

/**
 * @returns a CSS colour for the band, or undefined for the cells a section draws
 * before its first heading — they have no band to paint.
 *
 * Mixed in `oklab` so the band keeps the lightness the theme gave it: mixed the
 * naive way, a hue lifts a near-black strip in the dark theme into a visible
 * block of colour, which is the one thing this must not do.
 */
export function tintOf(name: string | undefined): string | undefined {
  if (name === undefined) return undefined;

  const hue = TINT.replace('%h', String(hueOf(name)));
  return `color-mix(in oklab, hsl(var(--muted)) ${String(100 - MIX)}%, ${hue} ${String(MIX)}%)`;
}
