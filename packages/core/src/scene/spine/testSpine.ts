import type { Node, PixiAdapter } from '../../adapters/types.js';
import { buildSpine } from './factory.js';
import { asSpine, refresh } from './spine.js';
import { setTrack } from './tracks.js';

/**
 * A second Spine, beside the one the game made, for trying things on.
 *
 * The panel used to try things on the game's own node: applying a setup wrote
 * over its skins, its speed and its tracks, so every experiment destroyed what
 * the game was doing and getting back was another act of the same kind. A node
 * of our own removes the whole problem — the original is never written to, and
 * going back to it is a click.
 *
 * It is a real node in the game's scene, and that is deliberate: it has to be,
 * to draw. Two consequences are handled here and one is not:
 *
 *  - it goes in **beside the original**, at the next index in the same parent,
 *    and inherits its placement — a Spine draws where its node is, and a test
 *    that landed at the origin would be a test of nothing;
 *  - it is **labelled as a test**, so the tree says plainly which node is the
 *    inspector's;
 *  - it is **not cleaned up on its own**. Closing the tab removes it; walking
 *    away leaves it, hidden or not, until the page reloads. That is the agreed
 *    trade: setups that survive a change of selection are worth more than a
 *    scene that tidies itself.
 *
 * Removing goes the way every other removal goes — `scene.mutate { delete }`,
 * which detaches rather than destroys. `destroy()` is not called here either:
 * the atlas textures behind a test skeleton are the game's own.
 */

/** What a test node is called, and what the next one should be called. */
const TEST = /^(.*) \(test (\d+)\)$/;

/**
 * The name a test is counted against, which is not always the label it was
 * taken from: building a test **from a test** would otherwise stack the suffix
 * — `hero (test 1) (test 2)` — and start counting again from one, because no
 * sibling matches that base. Stripping it first puts the new node in the same
 * series as the one it was copied from, which is where it belongs.
 */
function baseOf(label: string): string {
  return TEST.exec(label)?.[1] ?? label;
}

function nextLabel(adapter: PixiAdapter, parent: Node, original: string): string {
  const base = baseOf(original);
  let highest = 0;

  for (const child of adapter.children(parent)) {
    const match = TEST.exec(adapter.label(child));
    if (match !== null && match[1] === base) {
      highest = Math.max(highest, Number(match[2]));
    }
  }

  return `${base} (test ${String(highest + 1)})`;
}

/**
 * Where the original stands, carried over so the test stands there too.
 *
 * Through the adapter rather than by reading fields: these are declared property
 * paths, and going through `getProp`/`setProp` is what keeps every read of a
 * node's field behind the one boundary (§3.3).
 */
const PLACEMENT = ['position', 'scale', 'rotation', 'alpha'] as const;

/**
 * @param skeleton the name to build, or null for the one the original carries.
 * @returns the new node, or null when this runtime cannot build that skeleton —
 * which on v6/v7 is every skeleton but the original's own.
 */
export function createTest(
  adapter: PixiAdapter,
  original: Node,
  skeleton: string | null,
): Node | null {
  if (asSpine(original) === null) return null;

  const parent = adapter.parentOf(original);
  if (parent === null) return null;

  /*
   * The asset store first, for the same reason the probe reads it first: a
   * skeleton parsed in there needs no factory, and on v6/v7 the factory is not
   * on offer at all.
   */
  const made = buildSpine(original, skeleton, adapter.spineStore());
  if (made === null) return null;

  /*
   * Into the scene first, and only then anything else.
   *
   * The registry holds nodes weakly, so a built-but-unattached node has nothing
   * keeping it alive: taking an id for it and then attaching would be a race
   * with the collector for no reason.
   */
  const at = adapter.children(parent).indexOf(original);
  adapter.addChildAt(parent, made, at < 0 ? adapter.children(parent).length : at + 1);

  for (const path of PLACEMENT) {
    const value = adapter.getProp(original, path);
    if (value !== undefined) adapter.setProp(made, path, value);
  }

  adapter.setLabel(made, nextLabel(adapter, parent, adapter.label(original)));

  /*
   * And playing, because an empty skeleton in the setup pose says nothing about
   * whether this is the skeleton you wanted. The first animation is the one
   * guess available, and the panel's track row is right there to change it.
   */
  const first = asSpine(made)?.skeleton.data?.animations?.[0]?.name;
  if (typeof first === 'string' && first !== '') setTrack(made, 0, first, true);

  const spine = asSpine(made);
  if (spine !== null) refresh(spine);

  return made;
}
