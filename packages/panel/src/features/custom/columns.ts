/**
 * Which panels the Custom tab is holding, and what a click on a chip does.
 *
 * The names are the **identity**, not the labels: they are what goes into
 * storage, what a column is keyed on, and what the floor table is looked up by.
 * They stay English, and the word drawn on the chip is translated where it is
 * drawn (§3.14).
 */

/** The order the columns stand in, left to right, and the identity of each. */
export const COLUMNS = ['Scene', 'Assets', 'Stats'] as const;

export type Column = (typeof COLUMNS)[number];

/**
 * The column that is always there, at the left.
 *
 * Scene is what the other two are read *against* — a texture is interesting
 * because something draws it, a frame time is interesting because of what is on
 * the stage — so a composed view without it is a view with no subject. Making
 * it fixed also buys the rule below its second half: there is always a column
 * that cannot be the one you just switched off by accident.
 */
export const ANCHOR: Column = 'Scene';

export function isColumn(value: unknown): value is Column {
  return COLUMNS.includes(value as Column);
}

/** In the order of `COLUMNS`, whatever order they were given in. */
function ordered(chosen: Iterable<Column>): Column[] {
  const set = new Set(chosen);
  return COLUMNS.filter((column) => set.has(column));
}

/**
 * What was stored, made into a set the tab can actually draw.
 *
 * Storage is a place where a name from an older version, a hand-edited value,
 * or nothing at all can turn up, and none of those are a reason to fail to
 * render. Two things are guaranteed: the anchor is present, and **so is at
 * least one companion** — a Custom tab holding Scene alone is the Scene tab
 * with an extra row of chrome above it.
 */
export function normalize(stored: unknown): Column[] {
  const named = Array.isArray(stored) ? stored.filter(isColumn) : [];
  const chosen = new Set<Column>(named);

  chosen.add(ANCHOR);
  if (chosen.size === 1) chosen.add(COLUMNS.find((column) => column !== ANCHOR) as Column);

  return ordered(chosen);
}

/**
 * A chip was clicked.
 *
 * Three outcomes, and the middle one is the whole reason this takes a `fits`
 * rather than being plain set arithmetic.
 *
 * **Adding** is the ordinary case: the column joins the others, in the order of
 * the strip. **Swapping** is what happens when there is no room to join them —
 * the column takes the place of what is already there, rightmost first, until
 * it fits. Without that, a panel wide enough for exactly two columns is a dead
 * end: the companion on screen cannot be switched off, because it is the last
 * one, and no other can be switched on, because there is nowhere to put it. So
 * at that width the row quietly behaves as a choice of one, which is what it
 * has become, and at a wider one it goes back to being a set.
 *
 * **Refusing** is the rest: the anchor never leaves, the last companion is not
 * removed but replaced, and a column that does not fit even alone beside the
 * anchor cannot be had at all. Every refusal returns the set **unchanged by
 * identity**, so a click that can do nothing does not re-render the tab either.
 *
 * The width arrives as a predicate rather than as pixels, which keeps this
 * module about sets and `columnFloor.ts` about room, and lets the swapping be
 * tested without measuring anything.
 */
export function chooseColumn(
  chosen: readonly Column[],
  column: Column,
  fits: (columns: readonly Column[]) => boolean,
): readonly Column[] {
  if (column === ANCHOR) return chosen;

  if (chosen.includes(column)) {
    const companions = chosen.filter((held) => held !== ANCHOR);
    if (companions.length <= 1) return chosen;

    return chosen.filter((held) => held !== column);
  }

  let wanted = ordered([...chosen, column]);

  // Give up what is already there to make room, rightmost first — the same end
  // a narrowing window takes columns from, and for the same reason: a companion
  // added later sits further right than one that was there before it.
  while (!fits(wanted) && wanted.length > 2) {
    const given = [...wanted].reverse().find((held) => held !== ANCHOR && held !== column);
    if (given === undefined) break;

    wanted = wanted.filter((held) => held !== given);
  }

  return fits(wanted) ? wanted : chosen;
}
