import type { RowRendererProps } from 'react-arborist';

import type { TreeNodeData } from './nested.js';

/**
 * The tree's row, which exists to change exactly one thing about the row
 * react-arborist would draw itself.
 *
 * Arborist gives every row `min-width: max-content`, so each is as wide as its
 * own name and no wider. The buttons at the end of a row are `sticky right-0`,
 * and a sticky element can be pushed no further than the box it lives in — so
 * once the pane was scrolled past a row's own end, that row's buttons came
 * along with the text instead of staying at the edge, and the column broke into
 * a staircase. Holding every row to the same width is what puts the right edge
 * in the same place on all of them; `rowWidth.ts` works out where that is.
 *
 * The rest of this is arborist's `DefaultRow`, copied because there is no way
 * to ask for only the style change: the click handler is how a row is selected,
 * and the focus guard is what stops a row's focus reaching the tree container,
 * which would otherwise scroll the list back.
 */
export function Row({ node, attrs, innerRef, children }: RowRendererProps<TreeNodeData>) {
  return (
    <div
      {...attrs}
      style={{ ...attrs.style, minWidth: 'var(--tree-row-width, max-content)' }}
      ref={innerRef}
      onFocus={(event) => {
        event.stopPropagation();
      }}
      onClick={node.handleClick}
    >
      {children}
    </div>
  );
}
