import type { Json } from './json.js';
import type {
  AxesMode,
  AxesPin,
  HighlightMode,
  NodeId,
  OverlayStyle,
  PropertyDescriptor,
  Revisioned,
  SceneMutation,
  SceneTreePayload,
  SectionSchema,
  SessionStatus,
  SpineEvent,
  SpineInfo,
  SpineLive,
  SpineSetupTrack,
  SpineTrackParam,
  StatsFrame,
  StatsRecord,
  StatsTextures,
  TextTagMutation,
  TextTagStyle,
  TextureFrame,
  TextureId,
  TextureInfo,
  TextureUser,
} from './model.js';

/**
 * The command map — the single source of truth for both sides of the bridge.
 *
 * The panel calls `client.call('session.status', {})`, the core registers
 * `'session.status'` on the host, and TypeScript checks the parameters and the
 * result against this same table. That is what removes the class of bugs where
 * a call is a concatenated string the compiler never sees.
 *
 * The map is complete as of M8: everything the two tabs need is here. See
 * docs/architecture.md §3.1.
 */
export interface Commands {
  'session.status': { params: Record<string, never>; result: SessionStatus };
  /**
   * `rev` is the revision the panel already holds. Passing it lets the page
   * answer `unchanged` instead of sending a tree that has not moved.
   */
  'scene.tree': { params: { rev?: number }; result: Revisioned<SceneTreePayload> };

  /**
   * Keyed by node **type**, not by node: the schema is the same for every
   * Sprite on the page, so the panel fetches it once and keeps it while the
   * selection moves around.
   */
  'scene.propSchema': { params: { type: string }; result: SectionSchema[] };

  /**
   * `keys` is what the panel can actually see right now. A collapsed section
   * contributes nothing to it and therefore costs nothing — which is the whole
   * reason values travel separately from the schema.
   */
  'scene.propValues': {
    params: { id: NodeId; keys: string[]; rev?: number };
    result: Revisioned<Record<string, Json>>;
  };

  'scene.setProp': { params: { id: NodeId; key: string; value: Json }; result: void };

  /** Renaming, reparenting, removal and locking — see SceneMutation. */
  'scene.mutate': { params: SceneMutation; result: void };

  /**
   * Writes the node to the page's console, where it is the live object rather
   * than a reading of it: everything the panel does not draw is one disclosure
   * triangle away, and it can be kept, compared, or passed to a call typed
   * beside it.
   *
   * The one thing the panel cannot do itself. A node is a graph of live
   * references — parents, textures, shaders — and nothing that crosses the
   * bridge is. The command exists because the object has to be handed over
   * where it lives, in the page.
   *
   * Nothing comes back, and nothing needs to: what it produced is in the
   * Console tab, not in an answer.
   */
  'scene.log': { params: { id: NodeId }; result: void };

  /**
   * The overlay's whole conversation, in one exchange.
   *
   * Out goes what the panel wants shown — highlight, picker, which node is
   * selected and which is under the pointer. Back comes whatever the picker
   * landed on since the last call, once. A picked node cannot be pushed: push
   * is only ever a hint here (§3.2), so it rides back on the poll that was
   * happening anyway.
   */
  'overlay.config': {
    params: {
      /** How much of the frame is drawn — see `HighlightMode`. */
      highlight: HighlightMode;
      picker: boolean;
      selected?: NodeId | null;
      hovered?: NodeId | null;
      /**
       * Whether the selected caption's wrap box is drawn. Optional and on when
       * unsaid: a caller that has not heard of it should see the frame.
       *
       * Its own switch, not a setting of the highlight. The two answer
       * different questions — where the node is, and what the game told its
       * text to wrap inside — and asking the second is the case where the wash
       * of the first is in the way.
       */
      wrapBox?: boolean;
      /**
       * How much of the sign on the node's zero is drawn — see `AxesMode`.
       * Optional and whole when unsaid, for the same reason `wrapBox` is, and
       * independent of the highlight in the same way.
       */
      axes?: AxesMode;
      /**
       * Nodes the panel has pinned a gizmo to, on top of the selected and the
       * hovered one — see `AxesPin`. Optional and none when unsaid, because a
       * pin is something a caller asks for rather than something it inherits.
       *
       * They obey `axes`, which is the switch that says how much of a gizmo is
       * drawn; a pin says which nodes have one at all.
       */
      pinned?: AxesPin[];
      /**
       * How the frames are painted — see `OverlayStyle`. Optional, and the
       * defaults when unsaid, for the same reason the two above are: a caller
       * that has never heard of the settings gets the drawing the overlay has
       * always had.
       */
      style?: OverlayStyle;
      /**
       * Whether the selected node gets a frame that can be dragged, scaled and
       * turned in the page — see `scene/overlay/freeTransform.ts`. Optional and
       * off when unsaid, because it is the one thing the overlay does that
       * **writes to the scene**, and nothing should acquire that by silence.
       *
       * The panel refuses to arm it together with `picker`: both take the
       * pointer over the application, and one click cannot mean two things.
       */
      transform?: boolean;
      /**
       * How many times one click may ask the page's hit test — see
       * `DEFAULT_PICK_DEPTH`, which is what a caller that says nothing gets.
       * Clamped by the page, because a number arriving from anywhere else is
       * still a loop it has to run inside a click handler.
       */
      pickDepth?: number;
    };
    /**
     * Everything under the click, topmost first — `picked[0]` is what the
     * picker selects, and the rest is what was underneath it, which is the
     * whole point: a node with something drawn over it cannot be reached any
     * other way. Empty when nothing has been picked since the last call.
     */
    result: { picked: NodeId[] };
  };

  /**
   * Spine gets commands of its own rather than synthetic property keys.
   *
   * Its data is not a flat set of values but a list of tracks with a clock
   * running through them: the skeleton info is almost static and fetched once
   * per node, while the tracks are polled fast — but only while the section is
   * open (docs/architecture.md §3.5).
   */
  /**
   * @param skeleton which skeleton to describe, when it is not the one the node
   * is carrying. Choosing a skeleton in the panel is a choice rather than an
   * act — nothing reaches the scene until Apply — so between the two the lists
   * to choose from belong to a skeleton that is not loaded, and are read out of
   * its export instead.
   */
  'spine.info': { params: { id: NodeId; skeleton?: string }; result: SpineInfo | null };
  /**
   * Everything that moves, in one request.
   *
   * The tracks are most of it, but the state's `timeScale`, the skins worn and
   * the skeleton's placement change under the panel too — and a second poll at
   * 25 Hz would cost twice what carrying them along does.
   */
  'spine.live': { params: { id: NodeId }; result: SpineLive | null };
  /**
   * Reading the event log.
   *
   * `since` is the last `seq` the panel has; the page answers with what came
   * after it and how many fell out of the buffer in between. Pull, like
   * everything else: nothing is lost by not asking, only skipped.
   */
  'spine.events': {
    params: { id: NodeId; since: number };
    result: { entries: SpineEvent[]; dropped: number; cursor: number };
  };
  /** The listener goes on the state only while the log is being looked at. */
  'spine.setEventCapture': { params: { id: NodeId; on: boolean }; result: void };

  /**
   * Starting an animation — the one command that calls `setAnimation`.
   *
   * `params` are written onto the entry it returns, which is what lets a track
   * start at the speed and alpha chosen before it was ever running. A `null`
   * animation mixes the track out through an empty animation rather than
   * dropping it, which `spine.clearTrack` does.
   */
  'spine.setTrack': {
    params: {
      id: NodeId;
      track: number;
      animation: string | null;
      loop: boolean;
      params?: Partial<Record<SpineTrackParam, number>>;
    };
    result: void;
  };
  'spine.clearQueue': { params: { id: NodeId; track: number }; result: void };
  'spine.clearTrack': { params: { id: NodeId; track: number }; result: void };
  'spine.clearTracks': { params: { id: NodeId }; result: void };
  /** Scrubbing. Applies the pose and asks for a frame, so a paused scene moves. */
  'spine.setTrackTime': { params: { id: NodeId; track: number; time: number }; result: void };
  'spine.setTrackParam': {
    params: { id: NodeId; track: number; key: SpineTrackParam; value: number };
    result: void;
  };
  /**
   * Looping, written onto the live entry.
   *
   * A command of its own rather than a `spine.setTrack` with a different flag:
   * going through `setAnimation` to change it builds a new entry and drops the
   * playhead back to zero, which looks like the inspector restarting the
   * animation for no reason.
   */
  'spine.setLoop': { params: { id: NodeId; track: number; loop: boolean }; result: void };
  /** `AnimationState.timeScale` — every track at once. */
  'spine.setTimeScale': { params: { id: NodeId; value: number }; result: void };
  /**
   * Puts a second Spine into the scene beside this one, to try things on.
   *
   * The panel used to try things on the game's own node, which meant every
   * experiment wrote over what the game was doing. A node of its own removes
   * that: the original is never written to, and going back to it is a click.
   *
   * `skeleton: null` builds the one the node already carries, which works on
   * every line. Another skeleton needs the runtime's own factory — a static on
   * the v8 class with no counterpart in `pixi-spine` — so on v6/v7 the answer
   * is `null` and the panel says why.
   *
   * Removing it again is `scene.mutate { kind: 'delete' }`, like any other node.
   */
  'spine.createTest': {
    params: { id: NodeId; skeleton: string | null };
    result: { id: NodeId } | null;
  };
  /** Dresses the skeleton, or strips it with `null`. */
  'spine.setSkin': { params: { id: NodeId; skin: string | null }; result: void };
  /**
   * Putting a whole setup on the node at once — **including its skeleton**.
   *
   * One command rather than six sends in a row, and the skeleton is part of it
   * rather than a command of its own for the same reason: changing a skeleton
   * rebuilds the animation state, so on its own it leaves the node carrying
   * nothing and drawing nothing. It only means something with the tracks that
   * follow it, in one action.
   *
   * The change itself goes through the application's own method, because no
   * runtime offers one: on v6/v7 the `Spine` constructor builds a container per
   * slot beside the skeleton, and on v8 `skeletonData` is read once and never
   * again. The contract is a swap **in place** — an implementation that replaces
   * the node leaves the panel holding an id for something that is gone, and the
   * section says so.
   */
  'spine.applySetup': {
    params: {
      id: NodeId;
      /** `null` leaves the skeleton alone. */
      skeleton: string | null;
      skin: string | null;
      timeScale: number;
      tracks: SpineSetupTrack[];
    };
    result: void;
  };

  /**
   * The style properties this node's tags may carry — fetched once per node.
   *
   * Keyed by node rather than global because there are two MultiStyleText
   * classes and they spell a style differently: one keeps a tag as a flat
   * object of PixiJS 6 options (`strokeThickness`), the other as a `TextStyle`
   * (`stroke.width`). Offering both spellings would let the panel create a
   * property nothing reads, so the page answers with the one that fits.
   *
   * They are not in the section's `fields` on purpose. The panel builds the key
   * list for `scene.propValues` out of the fields of every open section, and
   * `writeValue` treats any declared key as writable — but a tag's `fontSize`
   * is not a path into the node, and making it settable through `scene.setProp`
   * would be both meaningless and a hole.
   */
  'text.tagStyleFields': { params: { id: NodeId }; result: PropertyDescriptor[] };

  /**
   * The tags of one node, `default` first. Revisioned: they only move when
   * something here changes them, so polling costs an answer with no payload.
   */
  'text.tagStyles': { params: { id: NodeId; rev?: number }; result: Revisioned<TextTagStyle[]> };

  /** Setting, clearing, adding and removing — see TextTagMutation. */
  'text.mutateTag': { params: { id: NodeId } & TextTagMutation; result: void };

  /**
   * The style of a patched text as its own source, ready to be pasted back into
   * the game — `style: { … }` and, where the node has tags, `multiStyles: { … }`.
   *
   * A string rather than a structure, and built in the page rather than in the
   * panel, because the spelling is the running library's: a gradient is three
   * fields on one line and an options object on the other, and only the side
   * that can see the style knows which. The panel's own shape is deliberately
   * the opposite — one shape for both lines — and cannot be pasted anywhere.
   *
   * An **empty string** is the answer for a node that is not a patched text,
   * which is how a section declared per type ends up drawn per node.
   */
  'text.styleSnippet': { params: { id: NodeId; rev?: number }; result: Revisioned<string> };

  /**
   * The texture list — **metadata only**, and cheap enough to poll because of
   * it (docs/architecture.md §3.6).
   */
  'assets.list': { params: { rev?: number }; result: Revisioned<TextureInfo[]> };

  /**
   * The names a sprite’s `textureId` can be set to — **not** a view of the
   * texture list (docs/architecture.md §3.6).
   *
   * The two answer different questions. `assets.list` is about textures the
   * renderer holds, so it reports atlas *pages*: one entry for a sheet of two
   * hundred frames. This is about the strings the application draws by — the
   * frames themselves, and the standalone textures beside them. A page is never
   * among them, because pointing a sprite at one draws the whole sheet.
   */
  'assets.names': { params: { rev?: number }; result: Revisioned<string[]> };

  /**
   * One preview, for one texture, at the size the panel is about to draw it.
   *
   * Asked for per texture rather than delivered with the list: the grid only
   * requests what is actually on screen, and keeps what comes back. `max` is
   * the longest side in pixels — a thumbnail asks for a small one, the
   * full-size view for a large one, and neither ever upscales.
   *
   * `null` is a normal answer: buffer and compressed sources have no image to
   * draw, and the panel shows a placeholder for them.
   */
  'assets.preview': { params: { id: TextureId; max: number }; result: { dataUrl: string | null } };

  /**
   * The regions cut out of one texture — a spritesheet's frames.
   *
   * Not a slice of `assets.names`, which is a flat list of every string a
   * sprite can be pointed at and says nothing about which sheet a frame came
   * from. This is the other direction: given a page, what was cut from it.
   *
   * Polled only while the panel has the section open, because the answer is
   * read off the source's own listeners and there is no point paying for it
   * while nobody is looking (§3.6).
   */
  'assets.frames': { params: { id: TextureId; rev?: number }; result: Revisioned<TextureFrame[]> };

  /**
   * Which nodes in the scene are drawing this texture.
   *
   * The one question the tab could not answer about a texture: the grid says
   * what the renderer holds and how much it costs, and says nothing about
   * whether anything is using it. An atlas page nothing draws from is exactly
   * what someone comes to this tab to find.
   *
   * A walk of the whole scene, so it is polled only while the panel has the
   * section open — the same bargain `assets.frames` and the Sprite section's
   * name list keep (§3.6).
   */
  'assets.users': { params: { id: TextureId; rev?: number }; result: Revisioned<TextureUser[]> };

  /**
   * The per-frame numbers, and the arming of the hook that produces them.
   *
   * **This poll is the consumer.** Asking installs the render hook if it is not
   * already on; not asking for a couple of seconds takes it off again
   * (docs/architecture.md §3.13). That keeps rule 5 — a hook only while
   * something needs a frame — without a command whose only job is to say so,
   * and it is why closing the tab is enough: the panel mounts one tab at a
   * time, so the polls stop on their own.
   *
   * Recording is armed separately, because it has to outlive this poll.
   */
  'stats.frame': { params: Record<string, never>; result: StatsFrame | null };

  /**
   * What texture memory the renderer is holding.
   *
   * Its own command rather than a slice of `assets.list`: that list is a record
   * per texture and exists for the grid to draw, while this is three numbers a
   * chart wants once a second. Not revisioned for the same reason — a
   * fingerprint over three numbers costs more than the numbers.
   */
  'stats.textures': { params: Record<string, never>; result: StatsTextures | null };

  /**
   * How much history the page should keep, in milliseconds. Zero stops it.
   *
   * A duration rather than a switch: the panel records the whole time it is
   * open, and the only question left is how far back to be able to look. The
   * ring drops whatever is older than this, so the answer is also what it
   * costs.
   *
   * Sent when the panel opens and whenever the duration changes; it is not a
   * poll. The page still takes the recording off by itself if nobody drains the
   * buffer for a minute, which is what closing DevTools looks like from in
   * there — that, rather than a zero, is the "off" that actually happens.
   */
  'stats.setRecording': { params: { keepMs: number }; result: void };

  /** What has been recorded since `since`. See `StatsRecord` for the encoding. */
  'stats.record': { params: { since: number }; result: StatsRecord | null };
}

export type CommandName = keyof Commands;

export type CommandParams<K extends CommandName> = Commands[K]['params'];
export type CommandResult<K extends CommandName> = Commands[K]['result'];

/**
 * Runtime list of command names. The host needs it to tell an unknown command
 * from a known one — types do not survive to runtime.
 *
 * A test cross-checks this list against the `CommandName` type, so the two
 * cannot drift apart unnoticed.
 */
export const COMMAND_NAMES = [
  'session.status',
  'scene.tree',
  'scene.propSchema',
  'scene.propValues',
  'scene.setProp',
  'scene.mutate',
  'scene.log',
  'overlay.config',
  'spine.info',
  'spine.live',
  'spine.events',
  'spine.setEventCapture',
  'spine.setTrack',
  'spine.clearQueue',
  'spine.clearTrack',
  'spine.clearTracks',
  'spine.setTrackTime',
  'spine.setTrackParam',
  'spine.setLoop',
  'spine.setTimeScale',
  'spine.createTest',
  'spine.setSkin',
  'spine.applySetup',
  'text.tagStyleFields',
  'text.tagStyles',
  'text.mutateTag',
  'text.styleSnippet',
  'assets.list',
  'assets.names',
  'assets.preview',
  'assets.frames',
  'assets.users',
  'stats.frame',
  'stats.textures',
  'stats.setRecording',
  'stats.record',
] as const satisfies readonly CommandName[];
