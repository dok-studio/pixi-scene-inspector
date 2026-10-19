import { useMemo, useState } from 'react';
import { FaAngleDown, FaAngleRight } from 'react-icons/fa6';

import { formatNumber } from '../../../../../lib/formatNumber.js';
import { cn } from '../../../../../lib/utils.js';
import type { AnimationNode, NamedEntry } from './animationTree.js';
import { animationTree } from './animationTree.js';
import { breakableName } from './breakableName.js';

/**
 * A list of names, folded by the folders the names spell out (`animationTree`).
 * A list whose names have no `/` in them draws exactly the flat list it was.
 *
 * Two places draw it: the Info list, where it is only read, and the picker,
 * where a name is chosen — `onPick` is what turns the leaves into buttons.
 *
 * Open by default: a tree that opens shut hides the very names it was asked
 * about, and in the picker it would cost a click per level on every choice.
 */

/** How far each level of the tree steps in. */
const INDENT_PX = 12;

/** The chevron's 10px and the 4px gap after it. */
const CHEVRON_PX = 14;

interface Shared {
  /** Set where a leaf is chosen rather than only read. */
  onPick?: (name: string) => void;
  /** Drawn in the accent, so the current choice can be found in the tree. */
  selected?: string | null;
}

export function NameTree({ entries, ...shared }: Shared & { entries: readonly NamedEntry[] }) {
  const nodes = useMemo(() => animationTree(entries), [entries]);
  return <Rows nodes={nodes} depth={0} {...shared} />;
}

function Rows({
  nodes,
  depth,
  ...shared
}: Shared & { nodes: readonly AnimationNode[]; depth: number }) {
  // A flat list — no folder anywhere at the top — keeps the edge it always had.
  const stepped = depth > 0 || nodes.some((node) => node.children.length > 0);

  return nodes.map((node) => (
    <Row key={node.path} node={node} depth={depth} stepped={stepped} {...shared} />
  ));
}

function Detail({ entry }: { entry: NamedEntry | undefined }) {
  // Only where it is known. Two of the three ways a skeleton the node is not
  // carrying gets read do not parse its timelines, so a zero there means "not
  // read" rather than "instant".
  if (entry?.detail === undefined || entry.detail <= 0) return null;

  return (
    <span className="text-muted-foreground shrink-0 tabular-nums">
      {formatNumber(entry.detail, 2)}
    </span>
  );
}

function Row({
  node,
  depth,
  stepped,
  ...shared
}: Shared & {
  node: AnimationNode;
  depth: number;
  /** Whether a leaf here makes room for the chevron its folder siblings draw. */
  stepped: boolean;
}) {
  const [open, setOpen] = useState(true);
  const folder = node.children.length > 0;

  if (!folder) {
    return (
      <Leaf
        label={node.label}
        entry={node.entry}
        indent={depth * INDENT_PX + (stepped ? CHEVRON_PX : 0)}
        {...shared}
      />
    );
  }

  const Chevron = open ? FaAngleDown : FaAngleRight;
  // In the picker a folder that is also a name has to be choosable as well, and
  // the folder's own row already means "fold me" — so the name gets a row of its
  // own, first among the children.
  const ownLeaf = node.entry !== undefined && shared.onPick !== undefined;

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        className="hover:bg-muted flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left"
        style={{ paddingLeft: depth * INDENT_PX + 4 }}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Chevron className="shrink-0 self-center text-[10px] opacity-60" />
        <span className="text-muted-foreground min-w-0 flex-1 [overflow-wrap:anywhere]">
          {breakableName(node.label)}
        </span>
        {!ownLeaf && <Detail entry={node.entry} />}
      </button>

      {open && ownLeaf && (
        <Leaf
          label={node.label}
          entry={node.entry}
          indent={(depth + 1) * INDENT_PX + CHEVRON_PX}
          {...shared}
        />
      )}
      {open && <Rows nodes={node.children} depth={depth + 1} {...shared} />}
    </>
  );
}

function Leaf({
  label,
  entry,
  indent,
  onPick,
  selected,
}: Shared & { label: string; entry: NamedEntry | undefined; indent: number }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{breakableName(label)}</span>
      <Detail entry={entry} />
    </>
  );

  // `px-1` on both kinds of row, and the indent on top of it, so a leaf lines up
  // with its folder siblings' names whichever of the two it is drawn as.
  const style = { paddingLeft: indent + 4 };

  if (onPick === undefined || entry === undefined) {
    return (
      <div className="flex items-baseline gap-1 px-1 py-0.5" style={style}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      // The whole name for a screen reader: the row shows only its last
      // segment, and the folders above it are the rest.
      aria-label={entry.name}
      className={cn(
        'hover:bg-muted flex w-full items-baseline gap-1 rounded px-1 py-0.5 text-left',
        entry.name === selected && 'text-primary',
      )}
      style={style}
      onClick={() => {
        onPick(entry.name);
      }}
    >
      {body}
    </button>
  );
}
