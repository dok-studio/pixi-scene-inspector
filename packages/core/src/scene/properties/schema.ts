import type { SectionSchema } from '@scene-inspector/protocol';

import {
  ALPHA,
  ANCHOR,
  CLASSES_LIST,
  POSITION,
  ROTATION,
  SCALE,
  SCALE_XY,
  Z_INDEX,
} from './fields.js';
import { TEXT_SECTION, TEXT_TAB } from './textSchema.js';

/**
 * Spine has no descriptors at all.
 *
 * Its data is a live list of tracks with a clock running through them, not a
 * set of values, so it travels through commands of its own and the section
 * exists only to give the panel somewhere to draw them (§3.5).
 */
const SPINE_SECTION: SectionSchema = {
  id: 'spine',
  title: 'Spine',
  layout: 'custom:spine',
  tab: 'Spine',
  fields: [],
};

/**
 * What each node type offers, as static data.
 *
 * Declared rather than discovered, and that is the point (docs/architecture.md
 * §3.4): because the keys and labels exist without asking the page, the panel
 * can search and filter properties, lay out subgroups, and request only what is
 * on screen. Discovery by enumerating a node would give none of that.
 *
 * The contents, the sections and the order are ported from the previous
 * project's `sharedContainerProps` — as data. There they were an array per node
 * type per version, sorted by a `position` number and matched against values by
 * prefix; here the order is the order they are written in and a key is a key.
 *
 * **Fields with no value are not rendered.** That is what keeps this list
 * honest across versions and applications: `id` and `classesList` belong to the
 * application rather than to PixiJS, `label` exists only on v8, and none of
 * them shows up where it does not apply. It also removes the need for the
 * schema to know which version it is describing.
 */

const INFO: SectionSchema = {
  id: 'info',
  title: 'Info',
  layout: 'generic',
  fields: [
    // Synthetic: answered by the adapter's own type detection, not by reading a
    // field off the node. See `values.ts`.
    { key: 'type', label: 'Type', editor: 'text', readOnly: true },
    /*
     * The three below are read, not written, and `readOnly` is what says so on
     * both sides at once: the panel draws no editor, and `writeValue` refuses
     * the key even if a `scene.setProp` arrives for it anyway.
     *
     * They are read-only for the same reason: none of them is the panel's to
     * decide. A name is the scene's own, and the one way to change it is the
     * tree's rename — which goes through `scene.mutate` and is untouched by
     * this. `id` and `classesList` belong to the framework that put them there,
     * and it is the framework that reads them back; a caption whose classes were
     * edited here would be styled by rules nobody wrote.
     */
    // v8 keeps the user-facing name here. On v6/v7 it is absent, and the row
    // with it.
    { key: 'label', label: 'Label', editor: 'text', readOnly: true },
    // Application-owned, not PixiJS: present only where the framework sets them.
    { key: 'id', label: 'Id', editor: 'text', readOnly: true },
    /*
     * The last of the three, and the one that only appears when the other two
     * are silent. All three are the same thing under different owners — an
     * application's `id`, v8's `label`, PixiJS's own `name` before it — and a
     * node names itself in exactly one of them. Showing whichever answered is
     * one row either way; showing all three would be two empty rows on most
     * nodes and the same string twice on the rest. See `readSynthetic`.
     */
    { key: 'name', label: 'Name', editor: 'text', readOnly: true },
    CLASSES_LIST,
  ],
};

const GENERAL: SectionSchema = {
  id: 'general',
  title: 'General',
  layout: 'generic',
  fields: [
    POSITION,
    { key: 'width', label: 'Width', editor: 'number', options: { wheelStep: 10 } },
    { key: 'height', label: 'Height', editor: 'number', options: { wheelStep: 10 } },
    SCALE,
    SCALE_XY,
    ROTATION,
    // The same turn in degrees, and next to the radians it restates. The
    // previous project had it further down the list, which meant reading the
    // rotation of a node in the unit anyone thinks in took a scroll past six
    // unrelated rows.
    { key: 'angle', label: 'Angle', editor: 'number' },
    // Ahead of pivot: both move the node's origin, and the one a sprite is
    // actually adjusted by belongs nearer to hand. Only some types have an
    // anchor, and the ones that do not simply do not draw the row.
    ANCHOR,
    { key: 'pivot', label: 'Pivot', editor: 'vector2' },
    { key: 'skew', label: 'Skew', editor: 'vector2', options: { step: 0.1 } },
    ALPHA,
    // Beside alpha, not after the two switches: both of these say where a node
    // is in the stack of what is drawn — one through it, one over it — and the
    // question they answer together is why something is not on screen. The
    // switches below are a different question, and having them in between put
    // two halves of one answer either side of it.
    Z_INDEX,
    { key: 'visible', label: 'Visible', editor: 'boolean' },
    { key: 'renderable', label: 'Renderable', editor: 'boolean' },
  ],
};

const INTERACTION: SectionSchema = {
  id: 'interaction',
  title: 'Interaction',
  layout: 'generic',
  fields: [
    { key: 'interactive', label: 'Interactive', editor: 'boolean' },
    { key: 'interactiveChildren', label: 'Interactive Children', editor: 'boolean' },
  ],
};

/**
 * Sprite: `layout: 'custom:sprite'`.
 *
 * The field is declared like any other and travels through `scene.propValues` /
 * `scene.setProp` — only the markup is the panel's, because picking a texture
 * means offering the ones the page has loaded, which is a list the schema
 * cannot hold (§3.4).
 *
 * `textureId` belongs to the application rather than to PixiJS, the same way
 * `id` and `classesList` do: a game that names its textures answers, and one
 * that does not never draws the row.
 */
const SPRITE_SECTION: SectionSchema = {
  id: 'sprite',
  title: 'Sprite',
  layout: 'custom:sprite',
  fields: [{ key: 'textureId', label: 'Texture Id', editor: 'text' }],
};

/**
 * MultiStyleText's tags, and no descriptors either — for the same reason Spine
 * has none.
 *
 * A tag's name belongs to the application, so a schema keyed by type cannot
 * declare one: the set is per node and changes while the panel is open. What is
 * static is the list of properties a tag may carry, and that travels on its own
 * as `text.tagStyleFields` rather than as this section's `fields` — see the
 * command for why.
 *
 * It sits under the Text tab rather than one of its own: a tag is an override of
 * the style right above it, and reading the two apart would mean switching tabs
 * to answer "what is this span actually doing".
 *
 * Offered to a plain `Text` as well, and not only to the type named after the
 * class. On PixiJS 8 there is no such class — the game folds the feature into
 * its own `Text`, whose style may or may not carry sub-styles (`nodeType.ts`) —
 * so on that line having tags is a fact about the node rather than about its
 * type. `text.tagStyleFields` answers with nothing for a text that has none, and
 * the panel draws no section: the same division of labour the snippet below
 * uses, and Spine before it.
 */
const MULTI_STYLE_SECTION: SectionSchema = {
  id: 'multiStyleText',
  title: 'Tag styles',
  layout: 'custom:multiStyleText',
  tab: TEXT_TAB,
  fields: [],
};

/**
 * The style of a patched text as its own source, and no descriptors either —
 * for the third time, and the third reason.
 *
 * Spine has none because a skeleton's tracks are per node; MultiStyleText has
 * none because a tag's name is the application's. Here there is nothing to
 * declare because the section is not a set of properties at all: it is one
 * string, built in the page out of the very fields declared above, spelled the
 * way the running library writes them (see `text.styleSnippet`).
 *
 * It is declared for every Text-like type although only a **patched** text has
 * one, because a schema is keyed by type and being patched is a property of the
 * node. The command answers with an empty string for the rest and the panel
 * draws no section — the same division of labour Spine already uses.
 *
 * Last of the tab's sections on purpose: it repeats what the rows above say,
 * in a form for copying rather than for reading.
 */
const STYLE_SNIPPET_SECTION: SectionSchema = {
  id: 'textStyleSnippet',
  title: 'Style',
  layout: 'custom:textStyleSnippet',
  tab: TEXT_TAB,
  fields: [],
};

/**
 * The transform as source: `layout: 'custom:objectSnippet'`.
 *
 * What `STYLE_SNIPPET_SECTION` is to a caption's style, this is to any node's
 * placement — the same question ("what would I write to get this") asked of the
 * rows every node has. A placement found by dragging a node around the panel has
 * to be typed back into the game, and reading it off six separate rows is how a
 * number gets copied wrong.
 *
 * Unlike the style, the text is built in the **panel**: a style has to be spelled
 * the way the running library spells it and only the page knows that, while a
 * transform is numbers the panel is already being sent for the rows. So this
 * section declares no command of its own — only the fields it writes, which is
 * what puts them in `scene.propValues` when General happens to be folded.
 *
 * Last of the tab's sections on purpose, as the style snippet is of its own: it
 * repeats what the rows above say, in a form for copying rather than for reading.
 */
const OBJECT_SNIPPET_SECTION: SectionSchema = {
  id: 'objectSnippet',
  title: 'Object',
  layout: 'custom:objectSnippet',
  fields: [POSITION, SCALE, ROTATION, ANCHOR, ALPHA, Z_INDEX],
};

/**
 * Every node in a Pixi scene is a Container, so these apply to all of them.
 * Type-specific sections join this list as the milestones that need them land —
 * Text in M6, Spine in M7.
 */
const CONTAINER: SectionSchema[] = [INFO, GENERAL, INTERACTION];

/**
 * Sections a type adds on top of the Container ones.
 *
 * Keyed by the canonical name from `nodeType`. Text-like nodes share the style
 * model, which is why three of them point at the same section.
 */
const BY_TYPE: Record<string, SectionSchema[]> = {
  // The tags are offered here too, because on PixiJS 8 a multi-style text *is*
  // a Text — see MULTI_STYLE_SECTION.
  Text: [TEXT_SECTION, MULTI_STYLE_SECTION, STYLE_SNIPPET_SECTION],
  // A multi-style text is a Text with a set of named overrides on top, so it
  // keeps the whole Text section and adds one. Only the older line has a class
  // of its own to name; the newer one arrives here as `Text`.
  MultiStyleText: [TEXT_SECTION, MULTI_STYLE_SECTION, STYLE_SNIPPET_SECTION],
  BitmapText: [TEXT_SECTION],
  HTMLText: [TEXT_SECTION],
  // A sprite is a sprite whichever way it draws itself.
  Sprite: [SPRITE_SECTION],
  AnimatedSprite: [SPRITE_SECTION],
  TilingSprite: [SPRITE_SECTION],
  NineSliceSprite: [SPRITE_SECTION],
  Spine: [SPINE_SECTION],
};

/**
 * Keys the adapter cannot answer by walking a path, handled in `values.ts`.
 * Declared here so the schema and the reader cannot drift apart.
 */
export const SYNTHETIC_KEYS = {
  type: 'type',
  scaleXY: 'scaleXY',
  dropShadow: 'style.dropShadow',
  /**
   * Not a field of any style: PixiJS has no flag for a stroke, and whether there
   * is one is concluded from its width (`properties/stroke.ts`). Spelled as a
   * key of its own because `style.stroke` is taken — it is the colour on v6/v7 —
   * and because a synthetic name cannot collide with a path the walker follows.
   */
  strokeEnabled: 'style.strokeEnabled',
  id: 'id',
  /**
   * Read through the reader rather than off the node: whether it is shown at
   * all depends on the other two names, and on v6/v7 being the line that still
   * has a `name` to read. See `PixiAdapter.pixiName`.
   */
  name: 'name',
  /**
   * Not PixiJS's, and therefore not every text's: these two are what a game's own
   * patched `Text` adds. Read through the reader rather than off the style so
   * that a plain `Text` shows no row for them at all — and so that a patched one
   * shows both even before it has set either, which is the only way to switch
   * `flexFont` on from the panel.
   */
  flexFont: 'style.flexFont',
  wordWrapHeight: 'style.wordWrapHeight',
} as const;

/**
 * Read like any other field, written through the application's own setter.
 *
 * Assigning `textureId` changes a string while the sprite goes on drawing the
 * texture it had; `setTextureId` is what the application put there to do the
 * actual swap. Named here so the schema and `writeValue` cannot drift apart.
 */
export const TEXTURE_ID_KEY = 'textureId';

/**
 * Keys whose value is a fill — a colour **or** a gradient — and therefore read
 * and written whole rather than as a leaf (`properties/fill.ts`).
 *
 * A gradient is three fields of the style on one PixiJS line and an object on the
 * other, so neither `getProp` nor `setProp` can carry one: the first reduces
 * anything that is not a scalar or a point to `undefined`, which is why the row
 * used to disappear the moment a fill became a gradient.
 */
export const FILL_KEYS: ReadonlySet<string> = new Set(['style.fill']);

/**
 * @param type the canonical type from `nodeType`, e.g. 'Sprite'.
 * @returns the sections for that type. Never empty: an unrecognised type falls
 * back to the Container schema rather than showing an empty panel, since every
 * node has a transform whether or not the inspector can name its class.
 */
export function schemaFor(type: string): SectionSchema[] {
  // Guarded rather than indexed straight: the type arrives from another
  // process, and BY_TYPE['constructor'] is a function — not undefined, so it
  // would reach the spread below and throw there instead of falling back here.
  const extra = Object.hasOwn(BY_TYPE, type) ? BY_TYPE[type] : undefined;
  // The type-specific sections come last, and the order carries the tabs: the
  // panel names them in the order they first appear, so the properties every
  // node has are the first tab and Text or Spine follow. Within a tab it is the
  // drawing order — Transform above the text it places.
  //
  // The snippet comes after even those, and after rather than inside CONTAINER:
  // it restates the rows in a form for copying, so it belongs at the end of what
  // it restates — and a Sprite's own section names no tab of its own, so a
  // snippet left in CONTAINER would have had the texture drawn below it. Naming
  // no tab, it lands on the first one, which is already open by then.
  const sections = extra === undefined ? CONTAINER : [...CONTAINER, ...extra];

  return [...sections, OBJECT_SNIPPET_SECTION];
}
