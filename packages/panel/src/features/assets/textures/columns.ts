/**
 * The grid's geometry, in one place because three things need the same answer:
 * the tiles that are drawn, the keys that move between them, and the window
 * that decides which of them exist at all.
 *
 * It is numbers rather than classes on purpose. The tile carried `h-42
 * max-h-42`, which is not a Tailwind class at all — 42 is not on the spacing
 * scale, and neither rule reached the stylesheet — so the tile had whatever
 * height its contents came to, and nothing could be computed from it. A
 * virtualised grid has to know the pitch of a row before it draws one, so the
 * pitch is stated here and the tile is sized from it.
 *
 * The tile is no longer a fixed 160px either. A grid of fixed tiles leaves a
 * ragged strip of nothing down its right-hand side — up to a whole tile's worth
 * — and that strip is at its widest exactly when the pane is narrowest and the
 * room is worth most. So the width is divided: as many columns as will fit
 * without the tile dropping below its floor, and then the remainder is spent on
 * making those columns wider rather than left over.
 */

/** The size the tile was drawn at, and what the floor is a fraction of. */
export const BASE_TILE_WIDTH = 160;

/** The picture inside it, at that width. Both scale together. */
export const BASE_IMAGE_HEIGHT = 128;

/**
 * The captions under the picture, which do **not** scale with the tile.
 *
 * At `leading-tight` a 12px line is 15px, so the name comes to 21 (15 + 2 above
 * + 4 below) and each of the two figures to 17 (15 + 1 + 1). Text is set at the
 * size it is legible at whatever the tile is doing, which is why this is a
 * constant added to a scaled picture rather than a share of the height.
 */
export const CAPTION_HEIGHT = 55;

/** The tile's own border, top and bottom. */
const TILE_BORDER = 2;

/** `gap-1`. */
export const TILE_GAP = 4;

/** `p-2` around the whole grid. */
export const GRID_PADDING = 8;

/**
 * How narrow a tile may get in order to fit one more column beside it.
 *
 * Four fifths of the size it was drawn at. Below that the picture stops being
 * something the grid can be read by, which is the whole reason the grid is a
 * grid of pictures.
 */
export const MIN_TILE_WIDTH = Math.round(BASE_TILE_WIDTH * 0.8);

export interface GridLayout {
  /** Tiles across. At least one, whatever the width. */
  columns: number;
  tileWidth: number;
  /** The picture's height, scaled with the width so the tile keeps its shape. */
  imageHeight: number;
  tileHeight: number;
  /** Top of one row to the top of the next. */
  rowPitch: number;
}

/** What one tile is left with when `columns` of them share the width. */
function share(available: number, columns: number): number {
  return (available - (columns - 1) * TILE_GAP) / columns;
}

/**
 * How the tiles are laid out across a box of this width.
 *
 * The column count is the most that can be had without a tile falling below
 * `MIN_TILE_WIDTH`; the width is then the exact division, so the row ends where
 * the box does. That bounds the tile from above without a second constant: one
 * more column always fits before a tile could reach twice the floor.
 *
 * A box too narrow even for one tile at the floor gets one tile as wide as the
 * box. Filling what there is beats overflowing it, and a pane that small is one
 * nobody is reading the grid in.
 */
export function layoutFor(width: number): GridLayout {
  const available = Math.max(0, width - GRID_PADDING * 2);

  let columns = 1;
  while (share(available, columns + 1) >= MIN_TILE_WIDTH) columns += 1;

  const tileWidth = Math.max(1, Math.floor(share(available, columns)));
  const imageHeight = Math.round((BASE_IMAGE_HEIGHT * tileWidth) / BASE_TILE_WIDTH);
  const tileHeight = imageHeight + CAPTION_HEIGHT + TILE_BORDER;

  return { columns, tileWidth, imageHeight, tileHeight, rowPitch: tileHeight + TILE_GAP };
}

/** The height the scroll box has to reserve for every row, drawn or not. */
export function contentHeight(layout: GridLayout, rowCount: number): number {
  if (rowCount === 0) return 0;
  return GRID_PADDING * 2 + rowCount * layout.rowPitch - TILE_GAP;
}

/** The top of a row, measured inside the scrolled content. */
export function rowTop(layout: GridLayout, rowIndex: number): number {
  return GRID_PADDING + rowIndex * layout.rowPitch;
}

/**
 * Which rows are worth drawing: the ones in view, plus `overscan` either side
 * so a scroll meets tiles that are already there.
 *
 * Inclusive of `last`, and empty — `first > last` — only when there are no
 * rows at all, which the caller handles before reaching here.
 */
export function windowFor(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  overscan: number,
): { first: number; last: number } {
  if (rowCount === 0) return { first: 0, last: -1 };

  // A row is in view when it overlaps the viewport at all, so the two edges are
  // asked separately: the first row is the earliest whose *bottom* has not gone
  // past the top of the box, the last is the latest whose *top* has not gone
  // past the bottom of it. Dividing the scroll offset by the pitch — which is
  // the obvious thing — answers neither, and was a row out at both ends.
  const firstVisible = Math.ceil(
    (scrollTop - GRID_PADDING - layout.tileHeight) / layout.rowPitch,
  );
  const lastVisible = Math.floor(
    (scrollTop + Math.max(0, viewportHeight) - GRID_PADDING) / layout.rowPitch,
  );

  const first = Math.max(0, firstVisible - overscan);
  const last = Math.min(rowCount - 1, Math.max(firstVisible, lastVisible) + overscan);

  return { first, last: Math.max(first, last) };
}

/**
 * Where the scroll has to be for a row to be wholly visible, or `null` when it
 * already is.
 *
 * Both edges, because the arrow keys travel in both directions and a row
 * scrolled to the top when it was only just below the fold would move the whole
 * grid under the reader for no reason.
 */
export function scrollToRow(
  layout: GridLayout,
  rowIndex: number,
  scrollTop: number,
  viewportHeight: number,
): number | null {
  const top = rowTop(layout, rowIndex);
  const bottom = top + layout.tileHeight;

  if (top < scrollTop) return Math.max(0, top - GRID_PADDING);
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight + GRID_PADDING;
  return null;
}

/**
 * The tile the arrow keys land on.
 *
 * Clamped rather than wrapped: a grid is a plan of what is there, and a cursor
 * that reappears at the far edge is a cursor that has to be found again. The
 * last row is usually short, so moving down from a full row above it lands on
 * the last tile rather than on nothing.
 */
export function moveIndex(
  current: number,
  count: number,
  columns: number,
  key: 'left' | 'right' | 'up' | 'down' | 'home' | 'end',
): number {
  if (count === 0) return -1;

  switch (key) {
    case 'home':
      return 0;
    case 'end':
      return count - 1;
    case 'left':
      return Math.max(0, current - 1);
    case 'right':
      return Math.min(count - 1, current + 1);
    case 'up':
      return current - columns < 0 ? current : current - columns;
    case 'down':
      return Math.min(count - 1, current + columns);
  }
}
