/**
 * The shape of the help document.
 *
 * The panel's own strings live in `i18n/en.ts`, a flat table of short labels
 * whose header says what it is: "every string the panel says". This is not
 * that. It is a document of some hundred paragraphs, and pouring it into that
 * table would drown the dictionary it exists to be readable as.
 *
 * What the two share is the guarantee. `uk.ts` declares itself as
 * `HelpContent`, so a section added in English and forgotten in Ukrainian does
 * not build — the same rule `Messages` enforces for labels, applied by the same
 * mechanism to a document. Order and numbering are *not* per language: they are
 * the constants below and in `diagrams/`, so the two files cannot drift on
 * anything but words.
 *
 * Prose is plain strings rather than JSX. A translator should be handed
 * sentences, not markup, and a string is what a test can compare. Where a
 * sentence has to name a control it is written in backticks — `` `Under
 * cursor` `` — and `Prose` turns those into `<code>`. Backticks are also the
 * marker that a phrase is quoting the interface and therefore **stays English**
 * in both files (§3.14).
 *
 * The rest of the marks `Prose` knows: `**bold**`, `{{eye}}` for one of the
 * panel's own glyphs, and `[words](#section)` or `[words](https://…)` for a
 * link. An address is not prose — it is the same in every language — so a
 * translation moves the words and leaves what is in the brackets alone.
 */

/**
 * The sections, in the order they are read.
 *
 * A tuple rather than a per-language list: which sections exist and what order
 * they come in is the document's structure, not its wording. `HelpContent`
 * below is keyed by these, so a language missing one is a type error.
 */
export const SECTION_IDS = [
  'quickStart',
  'worthKnowing',
  'connecting',
  'scene',
  'properties',
  'text',
  'spine',
  'assets',
  'stats',
  'custom',
  'settings',
  'cost',
  'privacy',
  'reference',
  'licences',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export interface OutlineEntry {
  id: SectionId;
  /** Sections that belong under this one in the table of contents. */
  children: readonly SectionId[];
}

/**
 * The same sections again, but shaped the way the contents list draws them.
 *
 * Kept apart from `SECTION_IDS` rather than replacing it: the document is a
 * flat run of sections — that is what is scrolled and what `Ctrl+F` walks — and
 * only the contents list has an opinion about which of them hang off which.
 * `Properties`, `Text` and `Spine` are the property pane's three tabs, so they
 * read as parts of Scene rather than as peers of it.
 *
 * A test flattens this and checks it against `SECTION_IDS`, so the two cannot
 * fall out of step or lose a section between them.
 */
export const OUTLINE: readonly OutlineEntry[] = [
  { id: 'quickStart', children: [] },
  { id: 'worthKnowing', children: [] },
  { id: 'connecting', children: [] },
  { id: 'scene', children: ['properties', 'text', 'spine'] },
  { id: 'assets', children: [] },
  { id: 'stats', children: [] },
  { id: 'custom', children: [] },
  { id: 'settings', children: [] },
  { id: 'cost', children: [] },
  { id: 'privacy', children: [] },
  { id: 'reference', children: [] },
  { id: 'licences', children: [] },
];

/**
 * Which schematic a `diagram` block draws — see `diagrams/`.
 *
 * Each of these names a section too, which is what lets `titleOf` read the
 * caption for its `<figure>` straight off the document rather than carrying a
 * second copy of the same three words.
 */
export type DiagramId = 'scene' | 'assets' | 'stats' | 'custom';

/**
 * Which schematic an `image` block draws.
 *
 * These have no section of their own — a row of the tree, one drawer on its
 * own — so an `image` carries its `title` beside it rather than borrowing one
 * `titleOf` cannot look up.
 */
export type ImageId = 'treeRow' | 'underCursor' | 'bookmarks' | 'counts';

/**
 * One numbered marker on a schematic.
 *
 * The number is drawn by the diagram and named here, which is why the two are
 * checked against each other by a test rather than trusted: a callout naming a
 * badge the picture does not draw is a legend pointing at nothing.
 */
export interface Callout {
  n: number;
  name: string;
  text: string;
}

/** A term and what it means — a toolbar button, a metadata row, a chart. */
export interface Row {
  /** Usually a control's own label, and then it stays English. */
  term: string;
  text: string;
  /** A key combination, where the term has one. Never translated. */
  key?: string;
}

/** One of the "worth knowing" cards at the top of the document. */
export interface Card {
  title: string;
  text: string;
  /** Where in the panel to find it. */
  where: string;
  /** The section it is explained in properly. */
  goes: SectionId;
}

export type Block =
  /** A paragraph. */
  | { kind: 'p'; text: string }
  /** A paragraph set apart — a caveat, a cost, a thing easily missed. */
  | { kind: 'note'; text: string }
  /**
   * A heading inside a section, for the long ones.
   *
   * `id` is the anchor it can be linked to — from the panel, from another
   * section, from a bug report — so it is written once here and **not**
   * translated. A slug made out of the heading's own words would be a different
   * address in every language, which is the one thing an address cannot be.
   */
  | { kind: 'h'; id: string; text: string }
  /** A definition list: control on the left, what it does on the right. */
  | { kind: 'rows'; rows: Row[] }
  /** An ordered list of steps. */
  | { kind: 'steps'; items: string[] }
  /** A schematic and the legend that names its badges. */
  | { kind: 'diagram'; diagram: DiagramId; callouts: Callout[] }
  /**
   * A schematic with no legend — a picture the prose around it already
   * explains, rather than one that needs its own numbered parts. `title` is
   * read out in its place, so it names what the picture shows.
   */
  | { kind: 'image'; diagram: ImageId; title: string }
  /** The card grid. */
  | { kind: 'cards'; cards: Card[] }
  /**
   * Every chart the Stats tab has, taken from `stats/metrics.ts` and explained
   * with the very `stats.about.*` prose the tab shows on the chart itself.
   *
   * Carried as an empty marker rather than copied into both languages: a chart
   * added to the panel would otherwise need remembering here too, and the help
   * would quietly describe a tab that had moved on. There is nothing to
   * translate — the titles are the panel's, and the prose is already in the
   * dictionary in both languages.
   */
  | { kind: 'metrics' }
  /**
   * The six overlay switches and the keys **currently** bound to them.
   *
   * Read live from `settings/hotkeys.ts`, so someone who has rebound a key
   * reads their own binding here rather than the default they replaced.
   */
  | { kind: 'hotkeys' };

export interface Section {
  /** The heading, and what the table of contents calls it. */
  title: string;
  blocks: Block[];
}

export interface HelpContent {
  /** The page's own title, and the document heading. */
  title: string;
  /** One sentence under the title. */
  tagline: string;
  /** The heading over the table of contents, and the label on the way back to it. */
  contents: string;
  /** Labels the page itself needs, outside any section. */
  versionLabel: string;
  /** The line in the page's footer. */
  disclaimer: string;
  /** Said under the key list when the hotkeys are switched off in `Settings`. */
  hotkeysOff: string;
  /** Every section, keyed so that a missing one does not compile. */
  sections: Record<SectionId, Section>;
}
