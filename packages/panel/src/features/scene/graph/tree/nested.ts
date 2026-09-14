import type { NodeId, SceneNode } from '@scene-inspector/protocol';
import { NODE_LOCKED, NODE_VISIBLE } from '@scene-inspector/protocol';

/**
 * The flat payload turned into the nested shape react-arborist works with.
 *
 * The page keeps the graph flat because that is cheaper to build, to serialize
 * and to fingerprint (docs/architecture.md §3.2). The tree component wants
 * nesting. One pass converts between them, which is possible only because the
 * payload is depth-first: a parent is always seen before its children.
 */

export interface TreeNodeData {
  /** react-arborist keys rows by string. */
  id: string;
  nodeId: NodeId;
  /** What the row reads as: the given name, or the type when there is none. */
  name: string;
  /** The type shown beside the name, empty when the name already is the type. */
  suffix: string;
  visible: boolean;
  locked: boolean;
  /** Whether a gizmo is pinned to this node. The panel's, not the scene's. */
  pinned: boolean;
  /** Whether this node is on the bookmark list under the tree. Also the panel's. */
  bookmarked: boolean;
  /**
   * Absent for a leaf, never empty. react-arborist decides a row is a leaf by
   * the absence of this — an empty array makes every node look like a folder
   * that opens onto nothing.
   */
  children?: TreeNodeData[];
}

/**
 * How a node reads, in two halves.
 *
 * An unnamed node reads as its type; a named one keeps its name and shows the
 * type in brackets beside it. The root always says it is the stage, named or
 * not — so an unnamed stage reads "Container (Stage)".
 *
 * Exported because a gizmo pinned to a node is captioned with the `name` half
 * of this (`AxesPin`), and a node spelled one way in the tree and another on the
 * canvas would be two accounts of it. The caption takes the name alone: the
 * type is worth a glance in a list of thirty rows and is noise over a scene,
 * where the shape under the sign already says what it is.
 */
export function rowLabel(node: SceneNode, isRoot: boolean): { name: string; suffix: string } {
  // The root is the stage, and saying so is more useful than 'Container'.
  const kind = isRoot ? 'Stage' : node.type;

  return {
    name: node.name === '' ? node.type : node.name,
    suffix: node.name === '' && !isRoot ? '' : `(${kind})`,
  };
}

export function toNested(
  nodes: readonly SceneNode[],
  pinned: ReadonlySet<NodeId> = new Set(),
  bookmarked: ReadonlySet<NodeId> = new Set(),
): TreeNodeData[] {
  const byId = new Map<NodeId, TreeNodeData>();
  const roots: TreeNodeData[] = [];

  for (const node of nodes) {
    const parent = byId.get(node.parent);
    const isRoot = parent === undefined;

    const data: TreeNodeData = {
      id: String(node.id),
      nodeId: node.id,
      ...rowLabel(node, isRoot),
      visible: (node.flags & NODE_VISIBLE) !== 0,
      locked: (node.flags & NODE_LOCKED) !== 0,
      pinned: pinned.has(node.id),
      bookmarked: bookmarked.has(node.id),
    };

    byId.set(node.id, data);

    if (parent === undefined) {
      roots.push(data);
      continue;
    }

    parent.children ??= [];
    parent.children.push(data);
  }

  return roots;
}
