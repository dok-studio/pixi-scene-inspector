/**
 * The type filters over what a click found.
 *
 * A click on a character in a built screen answers with a dozen nodes — the
 * meshes a skeleton is made of, the containers they sit in, the background
 * under all of it — and what someone is after is usually one **kind** of thing:
 * the sprite, the text, the skeleton. So the window's head carries a row of
 * kinds, and pressing one narrows the list to it.
 *
 * Five of them, and they are the five worth naming rather than the whole type
 * table: a filter nobody presses is a button in the way of the ones they do.
 * A kind with no button of its own — a `Mesh`, a `TilingSprite` — is found by
 * pressing nothing, which is how the list starts.
 *
 * **Each kind carries a colour**, and it is the same colour in both places it
 * appears: on the button and on the type in a row's brackets. That is what
 * makes the row of buttons a legend rather than five more controls — the eye
 * finds the green one in a list of twelve without reading any of them. A kind
 * with no button stays grey, which says as much: there is no button here to
 * look for.
 *
 * The shades are the 500s the Spine event log already picks its colours from,
 * so they hold in both themes without a `dark:` of their own. They are also
 * kept off the panel's own primary, which is what a **selected** row is washed
 * in — a type that read as "selected" would be the one thing this colouring
 * must not do.
 *
 * **`Text` covers both spellings.** A patched text and a plain one are the same
 * thing to the person looking for the score on a screen, and asking them to
 * know which one the game happened to build would be asking about the panel's
 * own type detection rather than about the scene.
 */

export interface TypeFilter {
  /** Held while the window is up, so it outlives a label being reworded. */
  key: string;
  label: string;
  /** As `adapters/nodeType.ts` spells them, which is what the tree carries. */
  types: readonly string[];
  /** The kind's colour, for the type in a row's brackets. */
  tone: string;
  /**
   * The same colour worn as a button: the hue in the ink while it is off, in
   * the fill while it is on. Written out per kind rather than composed, because
   * Tailwind reads these as text and a class it cannot see is a class that does
   * not exist.
   */
  chip: string;
}

/** Off: coloured ink and a matching edge. On: the colour itself, filled. */
const CHIP = {
  sky:
    'text-sky-500 border-sky-500/60 hover:bg-sky-500/15 hover:text-sky-500 ' +
    'aria-pressed:border-sky-500 aria-pressed:bg-sky-500 aria-pressed:text-white ' +
    'aria-pressed:hover:bg-sky-500/80 aria-pressed:hover:text-white',
  emerald:
    'text-emerald-500 border-emerald-500/60 hover:bg-emerald-500/15 hover:text-emerald-500 ' +
    'aria-pressed:border-emerald-500 aria-pressed:bg-emerald-500 aria-pressed:text-white ' +
    'aria-pressed:hover:bg-emerald-500/80 aria-pressed:hover:text-white',
  rose:
    'text-rose-400 border-rose-400/60 hover:bg-rose-400/15 hover:text-rose-400 ' +
    'aria-pressed:border-rose-400 aria-pressed:bg-rose-400 aria-pressed:text-white ' +
    'aria-pressed:hover:bg-rose-400/80 aria-pressed:hover:text-white',
  violet:
    'text-violet-500 border-violet-500/60 hover:bg-violet-500/15 hover:text-violet-500 ' +
    'aria-pressed:border-violet-500 aria-pressed:bg-violet-500 aria-pressed:text-white ' +
    'aria-pressed:hover:bg-violet-500/80 aria-pressed:hover:text-white',
  // Yellow is the one fill white cannot be read on, so its ink goes the other way.
  amber:
    'text-amber-500 border-amber-500/60 hover:bg-amber-500/15 hover:text-amber-500 ' +
    'aria-pressed:border-amber-500 aria-pressed:bg-amber-500 aria-pressed:text-black ' +
    'aria-pressed:hover:bg-amber-500/80 aria-pressed:hover:text-black',
};

export const TYPE_FILTERS: readonly TypeFilter[] = [
  { key: 'container', label: 'Container', types: ['Container'], tone: 'text-sky-500', chip: CHIP.sky },
  { key: 'sprite', label: 'Sprite', types: ['Sprite'], tone: 'text-emerald-500', chip: CHIP.emerald },
  { key: 'graphics', label: 'Graphics', types: ['Graphics'], tone: 'text-rose-400', chip: CHIP.rose },
  { key: 'spine', label: 'Spine', types: ['Spine'], tone: 'text-violet-500', chip: CHIP.violet },
  {
    key: 'text',
    label: 'Text',
    types: ['Text', 'MultiStyleText'],
    tone: 'text-amber-500',
    chip: CHIP.amber,
  },
];

/**
 * The colour a type is spelled in, or null for one no button names.
 *
 * Null rather than the grey itself: what a row does with "no colour of its own"
 * is the row's business, and it already has a muted class of its own to keep.
 */
export function toneOf(type: string): string | null {
  return TYPE_FILTERS.find((filter) => filter.types.includes(type))?.tone ?? null;
}

/**
 * Whether a node of this type belongs in the list as it is filtered now.
 *
 * Nothing pressed means everything, rather than nothing: the row of kinds is a
 * way of narrowing what a click found, and a list that answered an untouched
 * filter with an empty box would be a list nobody would press anything on.
 */
export function shownBy(active: readonly string[], type: string): boolean {
  if (active.length === 0) return true;

  return TYPE_FILTERS.some(
    (filter) => active.includes(filter.key) && filter.types.includes(type),
  );
}

/** The same key pressed again takes it off, which is what a filter row does. */
export function toggled(active: readonly string[], key: string): string[] {
  return active.includes(key) ? active.filter((one) => one !== key) : [...active, key];
}
