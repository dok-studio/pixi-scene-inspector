import type { TextureFrame, TextureId } from '@scene-inspector/protocol';
import { useState } from 'react';

import { CollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { useT } from '../../../i18n/index.js';
import { formatNumber } from '../../../lib/formatNumber.js';
import type { Client } from '../../../transport/client.js';
import { useRevisioned } from '../../../transport/useRevisioned.js';

/**
 * The regions cut out of the selected texture, and the rectangle each of them
 * covers.
 *
 * This is the half of a spritesheet the tab could not show before. `assets.list`
 * reports what the renderer holds, which is *pages* — a sheet of two hundred
 * frames is one tile in the grid — and `assets.names` flattens every frame in
 * the page into one list with nothing saying which sheet each came from. Asking
 * a page what was cut out of it is a question of its own, and it is the one
 * being asked here.
 *
 * Polled only while the section is open, and the section opens folded. Reading
 * the answer means walking a source's listeners on v8 or the whole texture
 * cache on v6/v7, and nobody should pay for that by having a texture selected.
 */

/** Frames move when a sheet is reloaded, and hardly ever otherwise. */
const FRAMES_INTERVAL_MS = 2000;

/** One array, so "nothing yet" does not look like a new list on every render. */
const NOTHING: TextureFrame[] = [];

export function FrameList({
  client,
  id,
  onHover,
}: {
  client: Client;
  id: TextureId;
  /**
   * Which frame the pointer is over, for the preview above to outline. `null`
   * when it has left the list.
   */
  onHover: (frame: TextureFrame | null) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const { data } = useRevisioned(
    (rev) => client.call('assets.frames', rev === undefined ? { id } : { id, rev }),
    { intervalMs: FRAMES_INTERVAL_MS, enabled: open, key: id },
  );

  // `null` is "the page has not answered yet"; an empty list is an answer,
  // and it is the ordinary one for a texture nobody cut anything out of.
  const frames = data ?? NOTHING;
  const answered = data !== null;

  return (
    <CollapsibleSection
      title={t('assets.frames')}
      defaultCollapsed
      aside={frames.length === 0 ? undefined : <span>{frames.length}</span>}
      onCollapse={(collapsed) => {
        setOpen(!collapsed);
        if (collapsed) onHover(null);
      }}
    >
      {/*
        Five rows tall to start with, then as much of the pane as is going, and
        never taller than the list itself.

        The floor is the flex **basis**, not `min-height`: a minimum wins over a
        maximum in CSS, so `min-h` would have held a two-frame list open at five
        empty rows — the one thing asked not to happen. As a basis it is a
        starting size instead, which `max-h-max` is then free to clamp down to
        whatever the rows actually come to. `grow` spends the room the preview
        and the folded headers left over; `shrink-0` keeps the five rows when
        there is no room at all, and the pane scrolls instead. A fixed
        `max-h-48` did none of it: fifty frames scrolled nine at a time under
        half a pane of nothing.
      */}
      <div
        className="max-h-max shrink-0 grow basis-[calc(5*1.25rem)] overflow-auto"
        onMouseLeave={() => {
          onHover(null);
        }}
      >
        {frames.length === 0 ? (
          // Two different silences, and saying the wrong one is a claim about
          // the texture that the page has not made yet.
          <p className="text-muted-foreground p-2 text-center text-xs">
            {answered ? 'Nothing was cut out of this texture.' : 'Looking…'}
          </p>
        ) : (
          frames.map((frame, index) => (
            <div
              key={`${frame.name}:${String(index)}`}
              className="hover:bg-accent flex cursor-default items-center gap-2 px-2 py-0.5 text-xs"
              onMouseEnter={() => {
                onHover(frame);
              }}
            >
              <span className="min-w-0 flex-1 truncate">
                {frame.name === '' ? <span className="text-muted-foreground">unnamed</span> : frame.name}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                {formatNumber(frame.width, 0)}×{formatNumber(frame.height, 0)}
              </span>
              <span className="text-muted-foreground shrink-0 tabular-nums">
                @{formatNumber(frame.x, 0)},{formatNumber(frame.y, 0)}
              </span>
            </div>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
