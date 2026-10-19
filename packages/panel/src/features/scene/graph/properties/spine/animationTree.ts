/**
 * A skeleton's animations as a tree, for names written as paths.
 *
 * `collector/collect/lvl_4/win/loop` is five folders' worth of name in a box a
 * few hundred pixels wide, and forty of them repeat the same first three. Split
 * on `/`, the shared part is said once and each row is left with what is its
 * own.
 *
 * A chain of folders with one child each is merged into a single folder —
 * `collector/collect` rather than `collector` holding only `collect` — because a
 * level that branches nowhere is a click that tells nothing.
 *
 * Generic over what the names are: the Info list and the animation picker both
 * draw it, and the picker draws skeletons with it too.
 */

/** One name, and the number drawn beside it where there is one. */
export interface NamedEntry {
  name: string;
  detail?: number;
}

export interface AnimationNode {
  /** What this row shows: one segment, or several merged ones. */
  label: string;
  /** The full path up to here — unique, so it keys the row and its fold. */
  path: string;
  /** Present where this path is itself a name in the list. */
  entry?: NamedEntry;
  children: AnimationNode[];
}

export function animationTree(entries: readonly NamedEntry[]): AnimationNode[] {
  const root: AnimationNode = { label: '', path: '', children: [] };

  for (const entry of entries) {
    let node = root;

    for (const segment of entry.name.split('/')) {
      const path = node.path === '' ? segment : `${node.path}/${segment}`;
      let child = node.children.find((candidate) => candidate.path === path);

      if (child === undefined) {
        child = { label: segment, path, children: [] };
        node.children.push(child);
      }

      node = child;
    }

    node.entry = entry;
  }

  return root.children.map(merge);
}

function merge(node: AnimationNode): AnimationNode {
  let current = node;
  let label = node.label;

  while (current.entry === undefined && current.children.length === 1) {
    const [only] = current.children as [AnimationNode];
    // A lone child that is itself an animation with nothing under it stays a
    // row of its own: merging it would turn the folder into a leaf.
    if (only.children.length === 0) break;

    label = `${label}/${only.label}`;
    current = only;
  }

  return { ...current, label, children: current.children.map(merge) };
}
