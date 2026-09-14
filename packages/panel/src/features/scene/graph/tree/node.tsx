import { useEffect, useRef } from 'react';
import type { NodeApi, NodeRendererProps } from 'react-arborist';
import {
  FaEye as EyeIcon,
  FaEyeSlash as EyeSlashIcon,
  FaMinus as LayerIconOpen,
  FaPlus as LayerIconClosed,
} from 'react-icons/fa6';
// The glyph the toolbar's Origin axes switch uses, so a row's button and that
// switch read as the same thing.
import { LuAxis3D as GizmoIcon, LuBookmark as BookmarkIcon } from 'react-icons/lu';

import { Input } from '../../../../components/ui/input.js';
import { TooltipWrapper } from '../../../../components/ui/tooltip.js';
import { useT } from '../../../../i18n/index.js';
import { cn } from '../../../../lib/utils.js';
import type { TreeNodeData } from './nested.js';
import { NodeToggleButton } from './node-button.js';

/**
 * One row of the scene tree, ported from the previous project.
 *
 * The row's own state — open, selected, editing — belongs to react-arborist.
 * Everything that touches the scene goes out through `actions`, so this file
 * knows nothing about the protocol.
 *
 * The row used to carry a context menu repeating what the row and the keyboard
 * already do — select, rename, toggle, delete. It is gone: a click selects,
 * Enter renames, a double-click toggles, and Delete asks the question the menu
 * never asked. Deleting is handled a level up, in `SceneTree`, because the
 * confirmation is one dialog for the tree rather than one per row.
 */

export interface NodeActions {
  /** The pointer entered or left a row: what the overlay highlights on hover. */
  setHovered: (id: number | null) => void;
  setVisible: (data: TreeNodeData, visible: boolean) => void;
  /** Pins a gizmo to this node, or takes the pin off again. */
  setPinned: (data: TreeNodeData, pinned: boolean) => void;
  /** Puts this node on the bookmark list under the tree, or takes it off. */
  setBookmarked: (data: TreeNodeData, bookmarked: boolean) => void;
}

const NodeInput: React.FC<{ node: NodeApi<TreeNodeData> }> = ({ node }) => (
  <Input
    autoFocus
    type="text"
    defaultValue={node.data.name}
    onFocus={(event) => {
      event.currentTarget.select();
    }}
    onBlur={() => {
      node.reset();
    }}
    onKeyDown={(event) => {
      if (event.key === 'Escape') node.reset();
      if (event.key === 'Enter') node.submit(event.currentTarget.value);
    }}
    className="bg-background max-h-[22px]"
  />
);

const FolderArrow: React.FC<{ node: NodeApi<TreeNodeData> }> = ({ node }) => {
  if (node.isLeaf) return null;
  return <span>{node.isOpen ? <LayerIconOpen /> : <LayerIconClosed />}</span>;
};

export function makeNodeRenderer(actions: NodeActions) {
  return function Node({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
    const { data } = node;
    const t = useT();

    const onToggle = (): void => {
      if (node.isInternal) node.toggle();
    };

    /**
     * A row that is removed while the pointer is over it never gets its
     * mouse-leave, so the overlay was left highlighting a node the scene no
     * longer has — until the pointer happened to enter some other row.
     */
    const clearHover = useRef(actions.setHovered);
    clearHover.current = actions.setHovered;

    useEffect(
      () => () => {
        clearHover.current(null);
      },
      [],
    );

    return (
      <div
        ref={dragHandle}
        className={cn('mb-1 flex h-full min-w-max items-center gap-2 leading-5', node.state)}
        onDoubleClick={onToggle}
        onMouseEnter={() => {
          actions.setHovered(data.nodeId);
        }}
        onMouseLeave={() => {
          actions.setHovered(null);
        }}
      >
        {/* `style` is arborist's depth indent, and nothing else. It belongs to
            the arrow rather than to the row it used to pad, because as padding
            on the row it was also the left wall the buttons below could not be
            pushed past: they are `sticky right-0`, and a sticky box stops at
            its container's content edge. In a narrow pane a deep row's indent
            reached further right than the pane, and the group was stranded
            inside it while shallower rows sat at the edge. */}
        <span style={style} onClick={onToggle}>
          <FolderArrow node={node} />
        </span>
        <span onClick={onToggle}>{node.isEditing ? <NodeInput node={node} /> : data.name}</span>
        <span>{data.suffix}</span>

        {/* Pushes the buttons to the right edge of the row. */}
        <div className="flex-grow" />

        <div className="node-actions sticky right-0 flex items-center gap-1 pl-1">
          <TooltipWrapper
            contentProps={{ side: 'left' }}
            providerProps={{ delayDuration: 2500 }}
            trigger={
              <NodeToggleButton
                pressed={!data.visible}
                icon={data.visible ? <EyeIcon /> : <EyeSlashIcon />}
                onPressedChange={(pressed) => {
                  actions.setVisible(data, !pressed);
                }}
                className="mt-[-2px] w-[20px] px-1 py-0.5"
              />
            }
            tip={t('scene.node.visible')}
          />
          {/* Between the two it is between in meaning as well: the eye changes
              the scene, the gizmo draws over it, and this one changes neither —
              it is the panel writing down where a node was so it can be found
              again once the page has thrown every id away. */}
          <TooltipWrapper
            contentProps={{ side: 'left' }}
            providerProps={{ delayDuration: 2500 }}
            trigger={
              <NodeToggleButton
                pressed={data.bookmarked}
                icon={<BookmarkIcon />}
                onPressedChange={(pressed) => {
                  actions.setBookmarked(data, pressed);
                }}
                className="mt-[-2px] w-[20px] px-1 py-0.5"
              />
            }
            tip={t('scene.node.bookmark')}
          />
          <TooltipWrapper
            contentProps={{ side: 'left' }}
            providerProps={{ delayDuration: 2500 }}
            trigger={
              <NodeToggleButton
                pressed={data.pinned}
                icon={<GizmoIcon />}
                onPressedChange={(pressed) => {
                  actions.setPinned(data, pressed);
                }}
                className="mt-[-2px] w-[20px] px-1 py-0.5"
              />
            }
            tip={t('scene.node.pin')}
          />
        </div>
      </div>
    );
  };
}
