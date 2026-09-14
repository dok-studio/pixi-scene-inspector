import type { Json } from './json.js';

/** PixiJS major version supported by the inspector. */
export type PixiMajor = 6 | 7 | 8;

/**
 * An axis-aligned rectangle in canvas coordinates.
 *
 * Plain data rather than a Pixi `Rectangle` on purpose: v6/v7 `getBounds()`
 * hands back a shared, reused instance, so anything holding on to it would see
 * the values change underneath. It also has to survive JSON.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The global the application was found through. Not used for logic — it exists
 * for diagnostics: when someone reports "it doesn't detect my app", the first
 * question is what was looked for and where.
 */
export type DetectionSource =
  | '__PIXI_DEVTOOLS__'
  | '__PIXI_APP__'
  | '__PIXI_STAGE__'
  | '__PIXI_RENDERER__'
  /**
   * Not a global the application published, but PixiJS 8.2+ handing its own
   * application over through the init hooks. The only source that works for a
   * build which exposes nothing.
   */
  | '__PIXI_APP_INIT__';

/**
 * Reply to `session.status` — the only thing the panel asks until it knows
 * whether there is anything to work with.
 *
 * `version` is the full string reported by Pixi (`'8.14.0'`) when it can be
 * read. `major` is resolved separately and may be known even when `version`
 * is null: an application that does not expose `PIXI` is recognised by
 * duck-typing.
 */
export interface SessionStatus {
  connected: boolean;
  version: string | null;
  major: PixiMajor | null;
  source: DetectionSource | null;
  /** Found in an iframe rather than the top-level window. */
  inFrame: boolean;
  /**
   * Which load of the page this is. `0` when there is no host to ask.
   *
   * Everything else the panel holds is named in terms the page invents and
   * starts over: a `NodeId` is a counter that begins at 1 on every install,
   * and a `TextureId` is PixiJS's own `uid`. Navigate the tab and those names
   * are handed out again, to different things — so a preview cached under
   * texture 1, or a selection pointing at node 12, would silently come to
   * describe something else. The panel is not remounted across a navigation
   * (that is deliberate: the failing polls during a load are ridden out), so
   * this is what tells it that the names have been reissued.
   */
  generation: number;
}

/**
 * Identifies a node for the length of a session. Handed out by the registry in
 * the page, never derived from anything the application controls.
 *
 * `0` is reserved for "no node": the stage reports it as its parent.
 */
export type NodeId = number;

/**
 * The reply shape of every pull command.
 *
 * The panel sends back the revision it already holds; if nothing has changed
 * since, the page answers `unchanged` and sends no data at all. That is what
 * replaces deep comparison in the panel — and, more importantly, what keeps a
 * still scene from serializing its whole tree several times a second.
 */
export type Revisioned<T> = { rev: number; data: T } | { rev: number; unchanged: true };

/**
 * Bit flags on a scene node. A bitmask rather than named booleans because this
 * ships once per node on every poll of a tree that can hold thousands.
 */
export const NODE_VISIBLE = 1;

/**
 * Locked by the inspector — not a PixiJS concept.
 *
 * A locked node refuses to be renamed, moved or deleted, and the picker will
 * not select it. It is what makes a background layer stop getting in the way
 * while working on what is in front of it.
 */
export const NODE_LOCKED = 2;

/**
 * Carries at least one filter, or a mask.
 *
 * Both are the expensive things a node can quietly be. A filter costs a render
 * target to switch to and back from; a mask breaks the batch either side of it.
 * Neither shows in a count of node types — a filtered `Container` is a
 * `Container` — so a scene can be slow for a reason nothing on the Stats tab
 * would otherwise mention.
 *
 * Flags rather than a command of their own: the tree walk already reads every
 * node and its fingerprint already folds these bits in, so a filter appearing
 * moves the revision like anything else does (`scene/tree.ts`).
 */
export const NODE_FILTERED = 4;
export const NODE_MASKED = 8;

/**
 * One node in the flat tree.
 *
 * `name` is exactly what the application set, empty string included — turning
 * "no name" into something readable is the panel's business, not the protocol's.
 * `type` is the canonical Pixi type, and doubles as the key the property schema
 * is looked up by.
 */
export interface SceneNode {
  id: NodeId;
  /** `0` for the stage. Always appears earlier in `nodes` than its children. */
  parent: NodeId;
  name: string;
  type: string;
  flags: number;
}

/**
 * The graph as a **flat array in depth-first order**, not a nested structure.
 *
 * Flat costs less to build, less to serialize and less to virtualize, and the
 * ordering carries the shape: a node's parent is always earlier in the array,
 * so depth can be computed in one pass without a lookup structure.
 */
export interface SceneTreePayload {
  nodes: SceneNode[];
}

/** How a value is edited. The panel maps each of these to one editor component. */
export type PropertyEditor =
  | 'number'
  | 'boolean'
  | 'color'
  /**
   * A colour **or a gradient** — see `GradientFill`. Its own kind rather than
   * `color` with a special case, because which of the two a fill holds is a
   * property of the value, and the editor has to be able to draw either.
   */
  | 'fill'
  | 'select'
  | 'text'
  /** A multi-line field: the text of a Text node is worth more than one line. */
  | 'textMultiLine'
  /**
   * A whitespace-separated list held in one string, drawn one item per line.
   *
   * Its own kind rather than `text` with a wider box, because what is on screen
   * is not what the node holds: a game's `classesList` is `'button large'` and
   * reads as a column. The editor splits and joins; the string in the scene is
   * the one the application wrote, spaced as it always was.
   */
  | 'textList'
  | 'vector2'
  | 'range';

/**
 * One colour of a gradient, and where along the ramp it sits.
 *
 * `color` arrives as the application wrote it — a `'#rrggbb'` string or a number
 * — the same as any other colour, and the editor normalises it for display.
 * `offset` is always filled in, even where the style leaves it to PixiJS, so the
 * editor has a number to show; see `properties/fill.ts` for what the two lines
 * do when it is absent.
 */
export type GradientStop = {
  color: string | number;
  offset: number;
};

/**
 * A gradient fill, in the one shape both PixiJS lines can be read from and
 * written back to.
 *
 * The libraries disagree completely here. v6/v7 spread a gradient over three
 * style fields — `fill` as a list of colours, plus `fillGradientType` and
 * `fillGradientStops` beside it — while v8 keeps a single `FillGradient` object.
 * Sending either shape across would put that difference in the panel; sending
 * this one keeps it in `properties/fill.ts`, where both are translated.
 *
 * `kind` is what tells this from the other things a property value may be: a
 * colour is a scalar and a point is `{x, y}`, so a reader needs a mark it can
 * recognise rather than a guess about which keys are present.
 *
 * Both this and `GradientStop` are `type` rather than `interface` on purpose: a
 * property value is a `Json`, and TypeScript only infers the index signature that
 * requires for an object type alias, never for an interface.
 */
export type GradientFill = {
  kind: 'gradient';
  /**
   * How the ramp runs. v6/v7 have only the two linear directions; `radial` is
   * v8's and cannot be chosen where the line has no such thing — it is reported
   * so that a gradient which is one survives being edited.
   */
  direction: 'vertical' | 'horizontal' | 'radial';
  stops: GradientStop[];
  /**
   * The same gradient **as source**, in the spelling the running library uses:
   * `fill: [...]` with `fillGradientStops` beside it on v6/v7, one options
   * object on v8.
   *
   * Here rather than left to the panel for the reason `text.styleSnippet` gives:
   * the shape above is deliberately one shape for both lines and can be pasted
   * nowhere, and which of the two spellings a page wants is a question only the
   * adapter answers (`gradientSupport`). It travels with the value because that
   * is where it is wanted — the row that shows a fill is the row that copies it.
   *
   * Absent where the reader has no adapter to ask, which is a tag's own style
   * (§3.5.1): those rows offer no copy.
   */
  source?: string;
};

/**
 * One editable property.
 *
 * Note the name shadows the built-in `PropertyDescriptor` from lib.es5 — it is
 * the name the architecture gives this type, and it must be imported to be
 * used, so a missing import is a type error rather than a silent switch to the
 * global one.
 *
 * `key` is a path into the node (`'position'`, `'style.dropShadow.blur'`).
 * Descriptors are declared, not discovered: that is what lets the panel search
 * and filter by label without asking the page anything.
 */
export interface PropertyDescriptor {
  key: string;
  label: string;
  editor: PropertyEditor;
  /** Editor-specific: the choices for a select, min/max/step for a range. */
  options?: Json;
  /** A subgroup inside the section, e.g. 'Font', 'Shadow'. */
  group?: string;
  /**
   * This boolean **is** its group: it decides whether the rest of the group
   * applies at all, so it is drawn in the group's heading rather than as a row
   * under it.
   *
   * Said by the schema rather than worked out by the panel, for the reason the
   * whole property model is declared: a list of such keys kept beside the
   * editors would have to be held in step with two schema files by hand, and
   * that is the drift `text/tagStyleFields.ts` derives its allow-lists to avoid.
   *
   * It is read twice over, and the second reading is what makes it a flag rather
   * than a layout hint. To the panel it means "draw this one in the band". To
   * the page it means **this key also accepts the group's settings**: a record
   * of the other declared keys of that group, applied as one write. That is the
   * only way a switch can be turned back on carrying what it had before — every
   * command crosses the bridge on its own, so a sequence of them has neither an
   * order nor an all-or-nothing.
   */
  groupSwitch?: boolean;
  /**
   * **The group this field is in is one thing**, and is overridden as one thing.
   *
   * A fill, a stroke and a shadow are each a single decision described from
   * several angles — a colour and a width and a join are not three settings that
   * happen to sit together, and half a stroke is not a state anyone meant. A
   * font is the opposite: a family and a size are independent, and overriding one
   * of them says nothing about the other.
   *
   * Where a tag holds only what it overrides, that difference decides what can be
   * added and taken away: an atomic group arrives and leaves whole, and its rows
   * carry no reset of their own. Non-atomic groups stay per-property.
   *
   * Declared on **one** field of the group — the one that already owns its
   * heading — rather than on all of them, because it is a fact about the group
   * and a flag repeated on every member is a flag that can contradict itself.
   *
   * Only the tag lists carry it. Atomicity is about overriding, and a node's own
   * style overrides nothing: on the Text tab every field it has is simply drawn.
   */
  groupAtomic?: boolean;
  /** The first PixiJS line that has this property. Absent means all of them. */
  since?: PixiMajor;
  readOnly?: boolean;
}

/**
 * Properties arrive grouped into sections rather than as a flat list.
 *
 * `layout: 'custom:text'` replaces **only the markup**. The descriptors stay
 * declared and values still travel through `scene.propValues` / `scene.setProp`,
 * so get/set logic is never duplicated and a section with no registered
 * component still renders — which is what makes a new node type work with no
 * panel work at all (docs/architecture.md §3.4).
 */
export interface SectionSchema {
  id: string;
  title: string;
  layout: 'generic' | `custom:${string}`;
  /**
   * The tab this section is drawn under. Absent means the default one, which is
   * where everything a node has by virtue of being a Container lives.
   *
   * Declared rather than derived: which tab a section belongs to is a statement
   * about the section, and leaving the panel to guess it from `layout` would
   * mean a new tab could not exist without panel work.
   */
  tab?: string;
  fields: PropertyDescriptor[];
}

/**
 * A change to the shape of the scene, as opposed to a value on one node.
 *
 * These are one command rather than four because they share every guard: the
 * node has to still exist, it must not be locked, and the stage itself cannot
 * be moved or removed. A tagged union keeps that in one place and still lets
 * the compiler check each case's parameters.
 */
export type SceneMutation =
  | { kind: 'rename'; id: NodeId; name: string }
  | { kind: 'delete'; id: NodeId }
  | { kind: 'move'; id: NodeId; parent: NodeId; index: number }
  | { kind: 'setLocked'; id: NodeId; locked: boolean };

/**
 * How one of the overlay's frames is painted.
 *
 * Colour and opacity are separate fields rather than one `#rrggbbaa`, because
 * they are separate controls in the settings and separate properties in SVG
 * (`fill` beside `fill-opacity`) — folding them together would mean splitting
 * them again at both ends.
 *
 * Widths are in the overlay's own pixels, the same space `globalBounds` reports
 * in. The overlay is scaled onto the canvas, so a page drawing smaller than its
 * renderer takes these down with everything else.
 */
export interface OutlineStyle {
  /** `#rrggbb`, as the panel's colour picker writes one. */
  fill: string;
  /** 0 to 1. */
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
}

/**
 * The wrap box, which has a stroke and deliberately no fill: it is drawn over
 * the very text it is measuring, and a wash of colour would be in the way.
 */
export type WrapBoxStyle = Omit<OutlineStyle, 'fill' | 'fillOpacity'>;

/**
 * How the overlay is painted, as the panel's settings decide it.
 *
 * The whole object travels or none of it does — a caller that says nothing gets
 * the defaults below, and one that says something says all of it. Merging a
 * partial style would put two sources of truth on either side of the bridge for
 * the same pixel.
 */
export interface OverlayStyle {
  selected: OutlineStyle;
  hover: OutlineStyle;
  wrapBox: WrapBoxStyle;
}

/**
 * What the overlay has always looked like, and what Reset goes back to.
 *
 * Here rather than in the core because both sides need the same numbers: the
 * page draws with them when the panel says nothing, and the panel shows them as
 * the value of a setting nobody has touched. Two copies would drift.
 *
 * The colours are the previous project's own, converted from the `hsl()` they
 * were written in. The hover's wash is the one thing not carried over at its
 * old strength: there it was twice the selected node's, which put the louder of
 * the two on whatever the pointer happened to be passing over rather than on
 * the node that had been chosen.
 */
export const OVERLAY_STYLE_DEFAULTS: OverlayStyle = {
  selected: {
    fill: '#bf2256',
    fillOpacity: 0.2,
    stroke: '#ffffff',
    strokeOpacity: 0.5,
    strokeWidth: 1,
  },
  hover: {
    fill: '#1099bc',
    fillOpacity: 0.2,
    stroke: '#ffffff',
    strokeOpacity: 0.5,
    strokeWidth: 1,
  },
  wrapBox: {
    stroke: '#a3ff1a',
    strokeOpacity: 1,
    /*
     * Four, and not for want of restraint: at a hairline the frame disappeared
     * into the highlight's own outline, and where it had no height the two
     * guides left were the easiest thing on screen to miss.
     */
    strokeWidth: 4,
  },
};

/**
 * How many times one picker click may ask the page's hit test.
 *
 * The picker takes the stack under a point one answer at a time, switching off
 * what came back and asking again, and what is not drawn there is dug past
 * rather than reported. So the budget is questions, not rows: a screen sitting
 * under half a dozen hidden layers spends most of it before reaching anything
 * anyone can see.
 *
 * Here rather than in the core for the same reason the overlay's colours are:
 * the page digs this far when the panel says nothing, and the panel shows the
 * number as the value of a setting nobody has touched.
 *
 * A click, and only a click — but a click that walks the scene once per ask,
 * synchronously, inside the page's own handler. That is what keeps it a
 * setting, and what keeps `MAX_PICK_DEPTH` where it is.
 */
export const DEFAULT_PICK_DEPTH = 256;

/** As deep as the setting goes, and as deep as the page will dig for anyone. */
export const MAX_PICK_DEPTH = 1024;

/**
 * How much of the origin gizmo the overlay draws.
 *
 * Three rather than two because the sign has two jobs and they are wanted
 * separately: the arrows say which way the node is placed, and the point says
 * where its zero is. On a scene of small sprites the arrows are large next to
 * what they mark and get in the way of reading it, while the point never does —
 * so `'origin'` is the middle setting rather than an abbreviation of `'arrows'`.
 */
export type AxesMode = 'arrows' | 'origin' | 'off';

/**
 * A node the panel has pinned a gizmo to.
 *
 * The gizmo follows the selection and the pointer, which means comparing where
 * two nodes' zeros are takes clicking between them. A pin is how one stays.
 *
 * The label travels rather than being worked out in the page. How a node reads
 * — its name, or its type where it has none, with the other in brackets — is
 * the tree's own wording, and spelling it a second time in the core would be
 * two accounts of the same node, drifting.
 */
export interface AxesPin {
  id: NodeId;
  /** Empty draws no caption. */
  label: string;
}

/**
 * A Spine skeleton, as far as the panel needs to know.
 *
 * Almost static: fetched once per selected node rather than polled. What the
 * skeleton *is* rather than what it is doing — the doing lives in `SpineLive`.
 */
export interface SpineInfo {
  skins: string[];
  animations: Array<{ name: string; duration: number }>;
  /**
   * The events the skeleton can fire, by name.
   *
   * The skeleton's own — what an artist keyed into it — rather than the track
   * events every skeleton has. A skeleton that keys none has none, and the
   * panel draws nothing at all rather than an empty list.
   */
  events: string[];
  /**
   * Whether these lists are still being worked out.
   *
   * Only ever true for a skeleton the node is not carrying: its animations are
   * read out of its own export, and reading is asynchronous while the command
   * is not. The panel asks again shortly rather than being pushed at.
   */
  pending: boolean;
  /**
   * The names this page might know a skeleton by.
   *
   * Never from the skeletons themselves: `SkeletonJson` does not fill
   * `SkeletonData.name` in, so a name has to come from outside. Two places
   * supply it — the PixiJS asset store, which knows the alias the application
   * chose but is unreachable on a bundled game, and the browser's own record of
   * what the page fetched, which is always reachable and knows the file name.
   *
   * A guess at what `changeSkeleton` takes, then, rather than a fact — which is
   * why the panel's chooser also accepts a name typed by hand.
   */
  skeletons: string[];
  /**
   * Whether the node offers a way to change skeleton at all.
   *
   * No runtime does — `skeletonData` is read once in the constructor — so this
   * is the application's own method, and a game without one can only be shown
   * the list, not moved through it.
   */
  canChangeSkeleton: boolean;
}

/**
 * One animation queued behind another on the same track.
 *
 * Spine keeps these as a linked list on `TrackEntry.next`; the panel wants them
 * flat and in the order they will play. Reading only: the queue is what the
 * application arranged, and the panel shows it rather than adding to it.
 */
export interface SpineQueued {
  animation: string | null;
  loop: boolean;
  delay: number;
}

/**
 * One track of a Spine animation state — **live**, unlike `SpineInfo`.
 *
 * Spine data is not a flat set of properties but a list of tracks with a clock
 * running through them, which is why it has commands of its own rather than
 * synthetic keys in the property model (docs/architecture.md §3.5).
 */
export interface SpineTrack {
  index: number;
  animation: string | null;
  loop: boolean;
  /** Where the playhead is, in seconds. */
  time: number;
  duration: number;
  timeScale: number;
  alpha: number;
  mixDuration: number;
  /** How far the crossfade into this animation has got. Read only. */
  mixTime: number;
  /** What it is mixing out of, or null when nothing is. Read only. */
  mixingFrom: string | null;
  /**
   * A non-looping animation that has run past its end.
   *
   * It is what Play means on such a track: starting it again rather than
   * un-pausing it.
   */
  complete: boolean;
  queue: SpineQueued[];
}

/**
 * Everything about a skeleton that moves — polled fast while the tab is open.
 *
 * The tracks are most of it but not all: the state's own `timeScale` and the
 * skins being worn change under the panel too, and a second poll at the same
 * rate would cost twice as much as carrying them here.
 */
export interface SpineLive {
  tracks: SpineTrack[];
  /** `AnimationState.timeScale` — every track at once. */
  timeScale: number;
  /** What the skeleton is wearing, or `''` while it wears nothing. */
  skin: string;
  /**
   * Which skeleton the node carries now.
   *
   * Live rather than static, because changing it is the point: read at 30-second
   * intervals the panel would keep showing the old one long after the swap.
   */
  skeleton: string;
}

/** One line of the event log. */
export interface SpineEvent {
  /** Runs across the whole log, so the panel can ask for what it has not seen. */
  seq: number;
  kind: 'start' | 'interrupt' | 'end' | 'complete' | 'dispose' | 'event';
  track: number;
  animation: string | null;
  /** The track's time when it happened. */
  time: number;
  /** Named events only. */
  name?: string;
  intValue?: number;
  floatValue?: number;
  stringValue?: string;
}

/**
 * One track of a setup, as it is applied.
 *
 * Not a `SpineTrack`: that is a reading of something running, and this is an
 * instruction for something that is not.
 */
export interface SpineSetupTrack {
  index: number;
  animation: string;
  loop: boolean;
  timeScale: number;
  alpha: number;
  mixDuration: number;
}

/** The track parameters that are a plain number each. */
export type SpineTrackParam = 'timeScale' | 'alpha' | 'mixDuration';

/**
 * One named style of a MultiStyleText node.
 *
 * The class keeps a set of these and switches between them on markup inside the
 * text itself (`<score>18 450</score>`). `default` is the node's full style;
 * every other tag holds **only what it overrides**, and the rest is inherited —
 * which is why `style` is what the tag actually sets rather than a resolved one.
 *
 * The names are the application's, not PixiJS's, so they cannot be declared in a
 * property schema and travel through commands of their own instead.
 */
export interface TextTagStyle {
  name: string;
  style: Record<string, Json>;
  /**
   * The part of the node's text this tag actually covers — what the style on
   * the left is doing, read off the markup rather than described.
   *
   * Empty when the tag is declared but never used, which is worth seeing too.
   * Whitespace is collapsed and repeated spans are joined: this is one line of
   * information, not the text itself, which the Text tab already shows whole.
   */
  text: string;
}

/**
 * A change to one tag, as a tagged union — the same shape and the same reason as
 * `SceneMutation`: all four cases share every guard (the node has to still be a
 * multi-style text, the key has to be a known style property, `default` cannot
 * be removed), and a union keeps that in one place.
 *
 * `clear` exists because the class's own `setTagStyle` only merges: without it a
 * property added by mistake could never be taken off a tag again.
 *
 * `clearGroup` is `clear` for a group that is one thing (`groupAtomic`). It is a
 * case of its own rather than a series of `clear`s because a stroke half taken
 * off a tag is not a state anyone meant to pass through: every command crosses
 * the bridge on its own, so a series has neither an order nor an
 * all-or-nothing — and on the class where a tag is a whole style, putting the
 * shadow's blur back before the shadow itself would write into nothing.
 */
export type TextTagMutation =
  | { kind: 'set'; tag: string; key: string; value: Json }
  | { kind: 'clear'; tag: string; key: string }
  | { kind: 'clearGroup'; tag: string; group: string }
  | { kind: 'add'; tag: string }
  | { kind: 'remove'; tag: string };

/** Stable within a session; taken from the texture's own uid. */
export type TextureId = number;

/**
 * Metadata for one texture — **without** the preview.
 *
 * The split is the point (docs/architecture.md §3.6): a list of these is cheap
 * to poll, while the image behind each one is fetched separately and only for
 * what is actually on screen.
 */
export interface TextureInfo {
  id: TextureId;
  /** The texture's own label, or the first cache key it was registered under. */
  label: string;
  /** Logical size, in the units the scene works in. */
  width: number;
  height: number;
  /** Uploaded size in texels — differs from the logical size when resolution ≠ 1. */
  pixelWidth: number;
  pixelHeight: number;
  /** A WebGPU format name on v8, a GL format constant on v6/v7. */
  format: string;
  /** Estimated bytes on the GPU; null when the format is not in the tables. */
  gpuSize: number | null;
  /** Whether the texture has actually been uploaded to the GPU. */
  isLoaded: boolean;
  /** Texels per logical unit. The reason the two sizes above can differ. */
  resolution: number;
  /** Whether the texture carries a mip chain — which `gpuSize` does not count. */
  mipmap: boolean;
  /**
   * How alpha is stored, as a name.
   *
   * A name on both lines, though only v8 reports one: v6/v7 keep a number from
   * `ALPHA_MODES`, and turning that into the word it stands for is exactly the
   * kind of difference the adapter exists to hide.
   */
  alphaMode: string;
  /** `2d` for everything a page normally holds; v8 can also report an array or a cube. */
  dimension: string;
  /** `null` on v6/v7, which have no such setting on a texture. */
  antialias: boolean | null;
  isPowerOfTwo: boolean;
  /** Whether the renderer may drop it when unused. `null` on v6/v7. */
  autoGarbageCollect: boolean | null;
  /** A destroyed texture can still be in the renderer's list for a frame. */
  destroyed: boolean;
  /** What is behind it: `image`, `canvas`, `video`, `bitmap`, `buffer`, `compressed`, `none`. */
  sourceKind: string;
  /**
   * Where the image came from, when it came from anywhere.
   *
   * The resource's own address first. Failing that the **label**, when the
   * label names a file: on v8 a texture loaded through `Assets` carries an
   * `ImageBitmap`, which has no `src`, and the address is what `Assets` wrote
   * into the label instead. A relative one is resolved against the page it was
   * loaded by, in the page — the panel is a `chrome-extension://` document and
   * would resolve it against itself.
   *
   * A `data:` URL is reported as its scheme and media type alone — the whole
   * of one is the image again, and sending that over the bridge once a second
   * for every texture is the cost this list exists to avoid. It is not an
   * address either, and the panel treats it as none.
   */
  url: string | null;
  /**
   * What the file weighed on the wire, from the page's own resource timings.
   *
   * `null` when there is no timing for it — a texture drawn into a canvas, a
   * buffer far enough back that the timing buffer has dropped it — and also for
   * a cross-origin response without `Timing-Allow-Origin`, which reports zero
   * rather than refusing. Zero is not a size, so it is reported as unknown.
   */
  fileBytes: number | null;
  /**
   * How many times the page has replaced this texture's pixels since the
   * inspector first described it.
   *
   * Not an identity and not a timestamp — a counter, and only useful as one
   * thing: telling a cached preview that it is of the wrong picture. Nothing
   * else about a texture moves when its content is replaced. A `Text` going
   * from "AAA" to "BBB" keeps its id, its size and its format, and redraws into
   * the same texture; so does any canvas a game repaints. Without this the
   * panel would show the first thumbnail it ever fetched for evermore.
   *
   * Starts at zero for every texture the first time it is reported, which is
   * what a cache wants: what happened before anyone was looking cannot have
   * made anything stale.
   */
  updates: number;
}

/**
 * One region cut out of a texture, as a spritesheet cuts them.
 *
 * The rectangle is in the source's own texels, so the panel can lay it over a
 * preview by scaling it by whatever the preview came back at.
 *
 * An **empty** list is the ordinary answer, not a failure: a standalone texture
 * has no frames, and neither has an atlas page on a v6/v7 build that publishes
 * no PixiJS module — those regions live in a cache the panel cannot reach.
 */
export interface TextureFrame {
  /** Empty for a region nothing named; the panel still has its rectangle. */
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A node drawing a given texture, as the panel needs to list it.
 *
 * The label travels with the id because the Assets tab holds no tree: it has
 * the texture and nothing else, and a list of bare numbers would be a list
 * nobody could read. It is the same string the tree shows — the node's own
 * name, or its type where it has none.
 */
export interface TextureUser {
  id: NodeId;
  label: string;
}

/**
 * The numbers that change every frame, as of the moment they were asked for.
 *
 * Everything here is measured in the page by a consumer of the render hook,
 * which goes on when this command is first polled and comes off when the polls
 * stop (docs/architecture.md §3.13). `null` is the answer on a page with no
 * application attached, and the panel draws nothing rather than zeros.
 */
export interface StatsFrame {
  /**
   * Frames per second over the last second of wall time.
   *
   * Zero — not a stale reading — when fewer than two frames arrived, which is
   * what a paused or frozen scene looks like. The previous project's first
   * window was the whole lifetime of the page and reported nonsense for it.
   */
  fps: number;
  /** Mean milliseconds between frames since the last poll; zero when idle. */
  frameMs: number;
  /**
   * Draw submissions per frame, over the frames since the last poll.
   *
   * A difference taken here rather than a counter reset in the page: the page
   * counts monotonically so that two readers cannot steal each other's frames.
   *
   * **Null when the page could not find a draw path to count** — a renderer
   * whose systems are not shaped the way any supported line shapes them. That
   * has to be a different answer from zero: a flat line along the floor reads as
   * "this scene draws nothing", which is a claim, and the honest report here is
   * that there is no reading at all.
   */
  drawCalls: number | null;
  /**
   * Milliseconds spent inside the renderer's own `render`, averaged over the
   * window.
   *
   * Beside `frameMs` this is the first question after "it is slow": the
   * difference between the two is everything that is **not** drawing — the
   * game's own update, other scripts on the page, the browser. Measured rather
   * than derived, so unlike the figures above it means something with a single
   * frame in the window.
   */
  renderMs: number;
  /**
   * The longest gap between two frames in the window.
   *
   * `frameMs` is a mean, and a mean is exactly the wrong tool for a stutter: one
   * frame of 120 ms among sixty of 16 barely moves it. The distance between this
   * and `frameMs` is the stutter.
   */
  worstFrameMs: number;
  /** Frames rendered since the last poll. Zero means the scene is not drawing. */
  frames: number;
  /** `performance.memory` in MB, or null where the browser has no such thing. */
  heapMB: number | null;
}

/** What the renderer is holding in texture memory, in one line. */
export interface StatsTextures {
  /** Every texture the renderer tracks. */
  count: number;
  /** How many of those have actually reached the GPU. */
  onGpu: number;
  /** Estimated bytes, summed over the textures whose format is in the tables. */
  gpuBytes: number;
}

/**
 * A slice of the recording, from `since` to now.
 *
 * The shape follows `spine.events` (§3.5): a cursor rather than a timestamp, so
 * the panel drains incrementally and a gap it missed is reported rather than
 * silently closed.
 *
 * A sample is `[msSinceStart, mask, ...values]`. `mask` is a bitfield over
 * `fields`, and only the values whose bit is set travel, in field order — a
 * frame where nothing but the frame numbers moved costs three numbers instead
 * of nine. The first sample after the recording starts carries a full mask, so
 * a drained slice always begins with a complete row.
 *
 * `fields` rides along rather than being hard-coded in the panel: the order is
 * the encoding, and two places declaring it is one place to get it wrong.
 */
export interface StatsRecord {
  /** Field names, in the order the mask indexes them. */
  fields: string[];
  samples: number[][];
  /**
   * The lowest and highest each field has reached **since the recording
   * started**, one per name in `fields`.
   *
   * Kept by the page rather than worked out from the samples, and that is the
   * whole point of them travelling: the buffer only holds the last few minutes,
   * so a peak from before that is gone from the samples and would be gone from
   * any figure derived from them. These outlive eviction.
   */
  min: number[];
  max: number[];
  /** Samples newer than `since` that had already been pushed out of the buffer. */
  dropped: number;
  /** The newest sample's sequence number — pass it back as the next `since`. */
  cursor: number;
  /** `Date.now()` when recording started, so the panel can label the axis. */
  startedAt: number;
  /** Whether the page is still recording. False once it has taken itself off. */
  recording: boolean;
}
