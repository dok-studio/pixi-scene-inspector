/**
 * The core: runs inside the inspected page.
 *
 * Two rules keep this package testable, and both are easy to break by accident:
 *
 *  1. No dependency on `chrome.*`, React or the real `pixi.js` — only on the
 *     adapter interface. That is what lets the core run under vitest against
 *     a fake tree of plain objects.
 *  2. Version checks exist only in `src/adapters/**`, enforced by the linter.
 */

export type {
  GradientSupport,
  Node,
  PixiAdapter,
  PixiCandidate,
  TextureHandle,
  VersionInfo,
} from './adapters/types.js';
export { createAdapter } from './adapters/index.js';
export { nodeType } from './adapters/nodeType.js';
export { detectVersion } from './adapters/version.js';

export type { Detection, WindowLike } from './runtime/detect.js';
export { detect } from './runtime/detect.js';
export type { InitHooks } from './runtime/hooks.js';
export { installInitHooks } from './runtime/hooks.js';
export type { Session } from './runtime/session.js';
export { createSession, readSessionStatus } from './runtime/session.js';
export type { Host, Handlers } from './runtime/host.js';
export { createHost, installHost } from './runtime/host.js';
export type { NodeRef, RefFactory, Registry } from './scene/registry.js';
export { createRegistry } from './scene/registry.js';
export { readTree } from './scene/tree.js';
export { readFrame, readRecord, readTextureAggregate, setRecording, statsArmed } from './stats/frame.js';
export { readTextureStats } from './stats/textures.js';
export type { FrameHook } from './runtime/frame.js';
export { createFrameHook } from './runtime/frame.js';
export type { Overlay, OverlayConfig } from './scene/overlay/overlay.js';
export { createOverlay } from './scene/overlay/overlay.js';
export {
  asSpine,
  readInfo as readSpineInfo,
  readLive as readSpineLive,
  readTracks as readSpineTracks,
} from './scene/spine/spine.js';
export type { MultiStyleShape } from './scene/text/multiStyle.js';
export {
  applyTagMutation,
  asMultiStyle,
  readTagStyles,
  tagStyleFields,
} from './scene/text/multiStyle.js';
export {
  TAG_STYLE_FIELDS_MERGED,
  TAG_STYLE_FIELDS_OVERRIDES,
  TAG_STYLE_KEYS_MERGED,
  TAG_STYLE_KEYS_OVERRIDES,
} from './scene/text/tagStyleFields.js';
export { relayoutFittedText } from './scene/text/relayout.js';
export { readStyleSnippet } from './scene/text/styleSnippet.js';
export { overlaySize, overlayTransform } from './scene/overlay/geometry.js';
export type { Locks } from './scene/mutate.js';
export { applyMutation, createLocks } from './scene/mutate.js';
export type { CanvasFactory, PreviewCanvas, PreviewContext } from './assets/textures.js';
export { fitPreview, readPreview, readTextureFrames, readTextures } from './assets/textures.js';
export { readTextureUsers } from './assets/users.js';
export { readTextureNames } from './assets/names.js';
export { schemaFor } from './scene/properties/schema.js';
export { isGradientFill, readFill, writeFill } from './scene/properties/fill.js';
export { TEXT_SECTION } from './scene/properties/textSchema.js';
export { readValues, writeValue } from './scene/properties/values.js';

import { DEFAULT_PICK_DEPTH, OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';

import { readTextureNames } from './assets/names.js';
import { readPreview, readTextureFrames, readTextures } from './assets/textures.js';
import { readTextureUsers } from './assets/users.js';
import type { WindowLike } from './runtime/detect.js';
import { installInitHooks } from './runtime/hooks.js';
import { installHost } from './runtime/host.js';
import { createSession } from './runtime/session.js';
import { schemaFor } from './scene/properties/schema.js';
import { readValues, writeValue } from './scene/properties/values.js';
import { logNode } from './scene/logNode.js';
import { applyMutation } from './scene/mutate.js';
import { createOverlay } from './scene/overlay/overlay.js';
import * as events from './scene/spine/events.js';
import { watchLoaded } from './scene/spine/loaded.js';
import * as setup from './scene/spine/setup.js';
import * as skeleton from './scene/spine/skeleton.js';
import * as testSpine from './scene/spine/testSpine.js';
import * as spine from './scene/spine/spine.js';
import * as tracks from './scene/spine/tracks.js';
import * as multiStyle from './scene/text/multiStyle.js';
import { relayoutFittedText } from './scene/text/relayout.js';
import { readStyleSnippet } from './scene/text/styleSnippet.js';
import { readTree } from './scene/tree.js';
import { readFrame, readRecord, readTextureAggregate, setRecording } from './stats/frame.js';

/**
 * Page-side entry point: installs the host with every command available so far.
 *
 * In the extension this is called by the injected script (M9); in the local
 * playground, by the page itself. Both hand over the same `window`, so the
 * code path is one and the same rather than "almost the same".
 *
 * The parameter is `object` rather than `Window` for two reasons: the real
 * `Window` has no string index signature (and detection reads keys
 * dynamically), and the core deliberately does not depend on DOM types. The
 * cast happens here, once, instead of at every call site.
 */
export function install(target: object): void {
  const scope = target as WindowLike & Record<string, unknown>;

  // First, and before anything else can create an application: a build that
  // publishes no global is found only by the hooks PixiJS calls on itself, and
  // they have to be in place before `Application.init()` runs.
  const session = createSession(scope, installInitHooks(scope));

  // Same reason, for a different record: the browser's list of what the page
  // fetched is what names a skeleton on a game that publishes no module, and it
  // drops its oldest entries. Asked for the first time when the panel opens, it
  // has long since forgotten the files that matter.
  watchLoaded(scope as unknown as typeof globalThis);

  // Built once, but it puts nothing in the page and hooks nothing until the
  // panel actually asks for a highlight or the picker.
  const overlay = createOverlay(
    () => session.adapter(),
    session.registry,
    session.frame,
    session.locks,
  );

  installHost(scope, {
    'session.status': () => session.status(),

    // An empty tree rather than an error when there is no application: the
    // panel already learns "not detected" from session.status, and a failing
    // command there would only add a second story about the same fact.
    'scene.tree': ({ rev }) => {
      const adapter = session.adapter();
      if (adapter === null) return { rev: 0, data: { nodes: [] } };

      return readTree(adapter, session.registry, session.locks, rev);
    },

    // Static data keyed by type, so it needs no application at all — the panel
    // gets the same answer whether or not the page still holds a scene.
    'scene.propSchema': ({ type }) => schemaFor(type),

    'scene.propValues': ({ id, keys, rev }) => {
      const adapter = session.adapter();
      const node = session.registry.resolve(id);

      // A node that has been removed from the scene, or an application that is
      // gone: an empty set of values rather than an error. The panel is already
      // finding out from the tree, which is the one place that story belongs.
      if (adapter === null || node === null) return { rev: 0, data: {} };

      return readValues(adapter, node, keys, rev);
    },

    'scene.setProp': ({ id, key, value }) => {
      const adapter = session.adapter();
      const node = session.registry.resolve(id);
      if (adapter === null || node === null) return;

      if (!writeValue(adapter, node, key, value)) return;

      // A text that fits itself to a box has to be measured again, and nothing
      // in it asks for that on its own — see `relayoutFittedText`.
      relayoutFittedText(node, key);

      // The frame is owed to the edit, whatever the edit was. On a paused scene
      // nothing draws on its own, so turning a shadow on or changing a fill
      // landed on the node and stayed invisible — while the same change made
      // through a tag mutation appeared, because that path always asks.
      session.frame.requestFrame();
    },

    // A refused mutation is a normal outcome, not an error: the panel finds
    // out the same way it finds out everything else, from the next poll.
    'scene.mutate': (mutation) => {
      const adapter = session.adapter();
      if (adapter === null) return;

      // The frame is asked for on success only, and it is asked for at all
      // because a frozen scene would otherwise go on drawing a node that has
      // been deleted — which is exactly what removing a test Spine does.
      if (applyMutation(adapter, session.registry, session.locks, mutation)) {
        session.frame.requestFrame();
      }
    },

    // A node the registry no longer knows writes nothing rather than a `null`
    // — an empty console is a truer answer than a line saying the selection is
    // gone. The adapter is asked only for the caption, and a page that has
    // lost its application still hands the object over (`logNode`).
    'scene.log': ({ id }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      logNode(session.adapter(), node);
    },

    'overlay.config': ({
      highlight,
      picker,
      selected,
      hovered,
      wrapBox,
      axes,
      pinned,
      transform,
      style,
      pickDepth,
    }) => {
      // The renderer may have been replaced since the last call; this moves the
      // hook across before the overlay asks for a frame on it.
      session.frame.refresh();

      if (selected !== undefined) overlay.setSelected(selected);
      if (hovered !== undefined) overlay.setHovered(hovered);
      // Drawn unless the panel says otherwise: an older panel, or any other
      // caller, gets the frame and the gizmo rather than silently losing them.
      overlay.configure({
        highlight,
        picker,
        wrapBox: wrapBox ?? true,
        axes: axes ?? 'arrows',
        pinned: pinned ?? [],
        // Off unless asked for, unlike the two above: this one lets the page be
        // edited by dragging, and that is not something a caller acquires by
        // saying nothing.
        transform: transform ?? false,
        style: style ?? OVERLAY_STYLE_DEFAULTS,
        pickDepth: pickDepth ?? DEFAULT_PICK_DEPTH,
      });

      return { picked: overlay.takePicked() };
    },

    /*
     * Spine reads need no adapter: a skeleton is not a PixiJS object, and the
     * module that reads it does its own detection (§3.5). The one exception is
     * the list of skeletons the page has loaded — that lives in the PixiJS
     * asset cache, which is the adapter's to reach.
     */
    'spine.info': ({ id, skeleton }) => {
      const node = session.registry.resolve(id);
      if (node === null) return null;

      const store = session.adapter()?.spineStore();

      return spine.readInfo(node, store ?? { skeletons: [], atlases: [] }, skeleton);
    },

    'spine.live': ({ id }) => {
      const node = session.registry.resolve(id);
      return node === null ? null : spine.readLive(node);
    },

    'spine.events': ({ id, since }) => {
      const node = session.registry.resolve(id);
      return node === null ? { entries: [], dropped: 0, cursor: since } : events.readEvents(node, since);
    },

    'spine.setEventCapture': ({ id, on }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      events.setEventCapture(node, on);
    },

    /*
     * Every write below that changes the pose asks for a frame, because the
     * Scene tab is meant to work on a scene that is not rendering at all. The
     * module applies the pose; only here is the renderer allowed to be touched
     * (§3.7).
     */
    'spine.setTrack': ({ id, track, animation, loop, params }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (tracks.setTrack(node, track, animation, loop, params)) session.frame.requestFrame();
    },

    'spine.clearQueue': ({ id, track }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      tracks.clearQueue(node, track);
    },

    'spine.clearTrack': ({ id, track }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (tracks.clearTrack(node, track)) session.frame.requestFrame();
    },

    'spine.clearTracks': ({ id }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (tracks.clearTracks(node)) session.frame.requestFrame();
    },

    'spine.setTrackTime': ({ id, track, time }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      // Scrubbing is the one place in Scene besides the overlay that needs the
      // renderer: the pose is applied there, and the frame is asked for here.
      if (tracks.setTrackTime(node, track, time)) session.frame.requestFrame();
    },

    'spine.setTrackParam': ({ id, track, key, value }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (tracks.setTrackParam(node, track, key, value)) session.frame.requestFrame();
    },

    'spine.setLoop': ({ id, track, loop }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (tracks.setLoop(node, track, loop)) session.frame.requestFrame();
    },

    'spine.setTimeScale': ({ id, value }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      // The pose does not move until the next update, so there is nothing to draw.
      tracks.setTimeScale(node, value);
    },

    'spine.applySetup': ({ id, ...rest }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (setup.applySetup(node, rest)) session.frame.requestFrame();
    },

    'spine.createTest': ({ id, skeleton }) => {
      const adapter = session.adapter();
      const node = session.registry.resolve(id);
      if (adapter === null || node === null) return null;

      const made = testSpine.createTest(adapter, node, skeleton);
      if (made === null) return null;

      // The scene grew: a frozen one would go on drawing without it.
      session.frame.requestFrame();

      return { id: session.registry.idOf(made) };
    },

    'spine.setSkin': ({ id, skin }) => {
      const node = session.registry.resolve(id);
      if (node === null) return;

      if (skeleton.setSkin(node, skin)) session.frame.requestFrame();
    },

    // Static per class, not per node, but which class this is only the node can
    // say — the two spell a style differently.
    'text.tagStyleFields': ({ id }) => {
      const node = session.registry.resolve(id);
      return node === null ? [] : [...multiStyle.tagStyleFields(node)];
    },

    // Reading tags needs no adapter either: the class is the application's, and
    // the module that reads it does its own detection.
    'text.tagStyles': ({ id, rev }) => {
      const node = session.registry.resolve(id);
      return node === null ? { rev: 0, data: [] } : multiStyle.readTagStyles(node, rev);
    },

    // The whole parameter object is passed on rather than the mutation picked
    // out of it: an intersection is assignable to its union, while a rest
    // destructuring would flatten the four cases into one and lose the tag.
    'text.mutateTag': (params) => {
      // Writing does need one, for the single reason that a gradient is a PixiJS
      // class on v8 and only the adapter knows where to find it.
      const adapter = session.adapter();
      const node = session.registry.resolve(params.id);
      if (adapter === null || node === null) return;

      // The class only marks itself dirty; a scene that is not rendering would
      // otherwise keep showing the old text until something else moved.
      if (multiStyle.applyTagMutation(node, params, adapter.gradientSupport())) {
        session.frame.requestFrame();
      }
    },

    // The adapter is here for one thing only: which of the two spellings this
    // line writes a style in. See `readStyleSnippet`.
    'text.styleSnippet': ({ id, rev }) => {
      const adapter = session.adapter();
      const node = session.registry.resolve(id);
      if (adapter === null || node === null) return { rev: 0, data: '' };

      return readStyleSnippet(adapter, node, rev);
    },

    // Metadata only, and revisioned like the tree — see §3.6 for why the image
    // is not in here.
    'assets.list': ({ rev }) => {
      const adapter = session.adapter();
      if (adapter === null) return { rev: 0, data: [] };

      return readTextures(adapter, rev);
    },

    // Not a view of the list above: that one is about the textures the renderer
    // holds, this one about the strings a sprite can be pointed at. See
    // `readTextureNames`.
    'assets.names': ({ rev }) => {
      const adapter = session.adapter();
      if (adapter === null) return { rev: 0, data: [] };

      return readTextureNames(adapter, rev);
    },

    'assets.preview': ({ id, max }) => {
      const adapter = session.adapter();
      if (adapter === null) return { dataUrl: null };

      return readPreview(adapter, id, max);
    },

    // The other direction from `assets.names`: given a sheet, what was cut out
    // of it. Asked only while the panel has the section open.
    'assets.frames': ({ id, rev }) => {
      const adapter = session.adapter();
      if (adapter === null) return { rev: 0, data: [] };

      return readTextureFrames(adapter, id, rev);
    },

    // A walk of the scene, so likewise asked only while the section is open.
    'assets.users': ({ id, rev }) => {
      const adapter = session.adapter();
      if (adapter === null) return { rev: 0, data: [] };

      return readTextureUsers(adapter, session.registry, id, rev);
    },

    'stats.frame': () => readFrame(session),

    // Through the collector rather than straight at the adapter: this call is
    // the panel's poll, so it runs in an `eval` and not inside a rendered frame,
    // and what it leaves behind is what the recorder samples — see
    // `textureValues`.
    'stats.textures': () => readTextureAggregate(session),

    'stats.setRecording': ({ keepMs }) => {
      setRecording(session, keepMs);
    },

    'stats.record': ({ since }) => readRecord(since),
  });
}
