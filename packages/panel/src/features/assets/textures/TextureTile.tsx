import type { TextureId, TextureInfo } from '@scene-inspector/protocol';
import { memo } from 'react';

import { formatNumber } from '../../../lib/formatNumber.js';
import { cn } from '../../../lib/utils.js';
import { textureName } from './arrange.js';
import { megabytes } from './bytes.js';

/**
 * One texture in the grid, ported from the previous project — the same size,
 * the same chequerboard, the same three lines of numbers under the image.
 *
 * Two lines under the name rather than three. There was a `File: N KB`, taken
 * by fetching the texture's own URL from the panel and measuring the response —
 * that cannot work in the extension, where the panel is a `chrome-extension://`
 * document and a relative asset path resolves against the wrong origin. Its
 * replacement was the format, and the format turned out not to be worth a line:
 * on v6/v7 it is a bare GL constant (`6408`), and the one case worth noticing on
 * v8 — a compressed texture, which the size tables do not cover — already shows
 * itself as a GPU size of "unknown". It is still a row in the pane on the right,
 * where there is room for what is occasionally wanted.
 *
 * What is left is set tight. Four captions at `text-xs`'s own 16px leading made
 * the caption block two thirds as tall as the picture above it, and the picture
 * is what the grid is read by.
 *
 * The size is handed in rather than written here. It used to be `w-40` and
 * `h-42 max-h-42`, of which only the first was a real utility: 42 is not on
 * Tailwind's spacing scale, so neither height rule was ever written, and the
 * tile was as tall as its contents happened to be. Nothing noticed until the
 * grid had to know a row's height before drawing one — and by then the grid was
 * also dividing its width between the tiles, so there is no one size to write.
 */

export const TextureTile: React.FC<{
  texture: TextureInfo;
  preview: string | null | undefined;
  selected: boolean;
  /**
   * Handed the id rather than a closure over it: the grid's own handler is
   * stable, and an inline arrow here would be a new prop on every poll —
   * which is all it took for the memo below to never once hold.
   */
  onSelect: (id: TextureId | null) => void;
  tileRef: (element: HTMLElement | null) => void;
  /** From `layoutFor`: the grid divides its width between the tiles. */
  width: number;
  height: number;
  /** The picture's share of that height; the captions take the rest. */
  imageHeight: number;
}> = memo(({ texture, preview, selected, onSelect, tileRef, width, height, imageHeight }) => {
  const bg = selected ? 'bg-secondary' : texture.isLoaded ? 'bg-primary' : 'bg-border';

  return (
    <div
      ref={tileRef}
      // The grid owns the keyboard, so the tile is a cell in it rather than a
      // stop of its own: with rows virtualised, a roving `tabIndex` would move
      // focus onto an element that is about to be unmounted.
      role="gridcell"
      id={`texture-tile-${String(texture.id)}`}
      aria-selected={selected}
      style={{ width, height }}
      className={cn(
        selected ? 'border-secondary' : 'border-border',
        'group-hover:bg-secondary hover:border-secondary checkerboard flex shrink-0 cursor-pointer flex-col items-center justify-between overflow-hidden rounded-sm border',
      )}
      onClick={() => {
        onSelect(selected ? null : texture.id);
      }}
    >
      <div className="group flex w-full flex-col">
        <div
          className="flex w-full items-center justify-center overflow-hidden p-1"
          style={{ height: imageHeight }}
        >
          {preview === undefined || preview === null ? (
            <div className="flex h-full w-full items-center justify-center rounded-sm bg-black/20 text-xs text-white/70">
              {/* Undefined is "not fetched yet", null is "there is no image". */}
              {preview === undefined ? 'Loading…' : 'No preview'}
            </div>
          ) : (
            <img src={preview} alt={textureName(texture)} className="max-h-full max-w-full" />
          )}
        </div>

        <div className={cn(bg, 'group-hover:bg-secondary rounded-b-sm leading-tight')}>
          <div className="w-full truncate px-1 pb-1 pt-0.5 text-center text-xs text-white">
            {textureName(texture)}
          </div>
          <div className="w-full truncate px-1 py-px text-left text-xs text-white">
            Size: {formatNumber(texture.pixelWidth, 1)} x {formatNumber(texture.pixelHeight, 1)}
          </div>
          <div className="w-full truncate px-1 py-px text-left text-xs text-white">
            GPU: {megabytes(texture.gpuSize)}
          </div>
        </div>
      </div>
    </div>
  );
});
TextureTile.displayName = 'TextureTile';
