import type { Json } from '@scene-inspector/protocol';

/**
 * What a group held before it was switched off.
 *
 * The switch exists to see the text with and without a shadow, or with and
 * without a stroke, and seeing needs both sides to survive the trip. Without a
 * memory only one of them does — and which one is lost depends on the library,
 * which is worse than a rule:
 *
 *  - on v8 a shadow that goes off is **destroyed**. The style keeps `null` there,
 *    and switching back on builds a fresh set of defaults, so the colour, the
 *    blur, the angle and the distance all have to be typed again;
 *  - a stroke goes off by its width on either line, so what is lost is the width
 *    — the one number that decides whether the stroke can be seen at all;
 *  - on v6/v7 a shadow keeps its settings in fields of their own and loses
 *    nothing. Remembering costs nothing there and changes nothing, which is why
 *    this is one mechanism rather than a rule per line.
 *
 * The snapshot is taken at the moment of the switch rather than kept up to date,
 * which is what makes edits between crossings count on their own: a blur adjusted
 * after coming back to it is the blur that goes into the memory next time round.
 * The same paragraph as `fillMemory.ts`, and the same reason.
 *
 * How long it lasts is not decided here — it is the lifetime of the component
 * holding it, and that is a node's selection. See `GroupSwitch`.
 */

/** The group's other keys and what they held, spelled as the schema spells them. */
export type SwitchSettings = Record<string, Json>;

export const NO_SWITCH_MEMORY: SwitchSettings | null = null;

/** A cell of the group, as much of it as remembering needs. */
export interface SwitchRow {
  key: string;
  value: Json | undefined;
  /** Shown, but belonging to something else — see `PropertyCell.inherited`. */
  inherited?: boolean;
}

/**
 * Crossing the switch.
 *
 * Going off takes the snapshot; going on writes it back. **The write is one
 * value**, not a switch followed by a series of settings: every command crosses
 * the bridge on its own, so a sequence has neither an order nor an
 * all-or-nothing — and on v8 a blur written before its shadow exists lands
 * nowhere. The page reads a record as "on, with these", which makes the whole
 * restoration a single pass (`properties/groupSwitch.ts`).
 *
 * The memory is **kept rather than consumed**, so a switch flipped off and on
 * twice restores twice. It is a snapshot of a side, not a message in transit.
 *
 * A row with no value is not remembered: `null` is the page saying the node does
 * not carry that key, and `undefined` is nothing having been read for it yet.
 * Writing either back would be inventing a value rather than restoring one.
 *
 * Neither is an inherited one, and for the same reason one step further out. In
 * a tag's grid every field of the group is drawn, with the default tag's value
 * standing in wherever the tag overrides nothing — so a snapshot that took them
 * all turned a tag that overrode one property into a tag overriding four, the
 * moment its switch was crossed and crossed back.
 *
 * @param on whether the switch is on **now**, before this crossing.
 * @returns what to write, and what to remember once it is written.
 */
export function flipSwitch(
  memory: SwitchSettings | null,
  on: boolean,
  rows: readonly SwitchRow[],
): { write: Json; memory: SwitchSettings | null } {
  if (!on) return { write: memory ?? true, memory };

  const snapshot: SwitchSettings = {};
  for (const row of rows) {
    if (row.value === undefined || row.value === null) continue;
    if (row.inherited === true) continue;
    snapshot[row.key] = row.value;
  }

  // Nothing worth remembering is remembered as nothing, so that a group which
  // had no readable settings does not come back carrying an empty record — and
  // so a later crossing that does have them is not held back by this one.
  return { write: false, memory: Object.keys(snapshot).length === 0 ? memory : snapshot };
}
