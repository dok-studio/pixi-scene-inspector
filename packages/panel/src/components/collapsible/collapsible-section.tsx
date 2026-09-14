import { useState } from 'react';
import { FaAngleDown, FaCopy as CopyIcon } from 'react-icons/fa6';

import { useLocalStorage } from '../../lib/localStorage.js';
import { cn } from '../../lib/utils.js';

/**
 * Ported from the previous project, less one thing: the header no longer draws
 * a coloured rule under itself on hover.
 *
 * It was the same mark the open tab used, and a panel that answers a pointer
 * with the same bright line everywhere is a panel where the line has stopped
 * meaning anything in particular. The cursor already says the header is
 * clickable, and the arrow at its end says what the click does.
 */

interface CollapsibleSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  title: string;
  /**
   * A word about the section, drawn at the end of its header.
   *
   * What a folded section is worth saying about itself: a tag of a
   * MultiStyleText puts the piece of text it covers here, so folding it away
   * loses the settings and keeps the answer to which words they decide.
   */
  aside?: React.ReactNode;
  onCopy?: () => void;
  defaultCollapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
}

export function CollapsibleSection({
  className,
  children,
  title,
  aside,
  onCopy,
  defaultCollapsed,
  onCollapse,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  return (
    <>
      <div
        className={cn(
          'border-border bg-muted flex h-6 min-h-6 w-full cursor-pointer items-center justify-between border-b border-t px-4 text-sm font-bold',
          className,
        )}
        onClick={() => {
          setCollapsed(!collapsed);
          onCollapse?.(!collapsed);
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {onCopy !== undefined && (
            <CopyIcon
              onClick={(event) => {
                onCopy();
                event.stopPropagation();
              }}
              className="hover:fill-primary cursor-pointer opacity-45 hover:opacity-100"
            />
          )}
          {/* `min-w-0` as well as `truncate`: a flex item will not shrink below
              its own content without it, so the title pushed instead of
              ellipsing — and what it pushed off the edge, in a pane narrow
              enough, was the arrow that folds the section. */}
          <div className="min-w-0 truncate">{title}</div>
        </div>
        {/* No `min-w-0` on this half, unlike the title's: it holds controls,
            and a group allowed to shrink past its content does not shrink its
            children — it lets them spill out of itself, where the header's clip
            takes them. What gives way instead is whatever inside it says it
            can (an `aside` of text carries `min-w-0 truncate`), so the arrow
            stays on screen at any width the pane can reach. */}
        <div className="flex items-center gap-2">
          {aside}
          <FaAngleDown
            className={cn('flex-none transform', collapsed ? 'rotate-180' : 'rotate-0')}
          />
        </div>
      </div>
      {!collapsed && children}
    </>
  );
}

/** The same section, but its folded state outlives the panel being closed. */
export function SaveCollapsibleSection({
  storageKey,
  ...props
}: CollapsibleSectionProps & { storageKey: string }) {
  const [defaultCollapsed, setDefaultCollapsed] = useLocalStorage(storageKey, props.defaultCollapsed);

  return (
    <CollapsibleSection {...props} defaultCollapsed={defaultCollapsed} onCollapse={setDefaultCollapsed} />
  );
}
