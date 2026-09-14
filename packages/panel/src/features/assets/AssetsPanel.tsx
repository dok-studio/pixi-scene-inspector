import type { NodeId, TextureId, TextureInfo } from '@scene-inspector/protocol';
import { useMemo, useState } from 'react';

import { CollapsibleSplit } from '../../components/collapsible/collapsible-split.js';
import type { Client } from '../../transport/client.js';
import { useRevisioned } from '../../transport/useRevisioned.js';
import { TextureGrid } from './textures/TextureGrid.js';
import { TextureProperties } from './textures/TextureProperties.js';

/**
 * The Assets tab: the texture grid on the left, the selected texture on the
 * right — the same split the previous project had.
 *
 * The list is fetched here for the same reason the scene tree is fetched in
 * `ScenePanel`: the selection is resolved against fresh data on every poll, so
 * a texture that has been destroyed stops being shown as selected instead of
 * lingering in the right-hand pane.
 */

/**
 * Slower than the scene tree on purpose. Textures appear when something loads,
 * not while the game runs, and an unchanged list still costs the page a walk
 * over every texture the renderer holds — measured at about 1.9ms on a page
 * with three hundred of them, most of it building the payload the fingerprint
 * is then read off.
 *
 * Two seconds rather than one because that walk is the whole cost and nothing
 * it reports is urgent: a texture that has just loaded is worth seeing a second
 * later. Not five, which is where it was nearly set — this interval also
 * carries `updates`, so a `Text` whose string keeps changing would have its
 * thumbnail redrawn in visible jerks.
 *
 * The setting in the gear multiplies this like every other interval, so a page
 * that cannot spare even this has `Easy` and gets eight seconds.
 */
const LIST_INTERVAL_MS = 2000;

/** One array, so "nothing yet" does not look like a new list on every render. */
const NOTHING: TextureInfo[] = [];

export function AssetsPanel({
  client,
  onReveal,
}: {
  client: Client;
  /**
   * Follow a node from the texture it draws into the Scene tab.
   *
   * Handed down from the shell rather than done here, because it is two things
   * at once — a selection and a change of tab — and the navbar mounts one tab
   * at a time, so neither lives inside this one.
   */
  onReveal: (id: NodeId) => void;
}) {
  /**
   * What the refresh button moves.
   *
   * The list is revisioned, so the panel holds one and the page answers
   * `unchanged` while nothing moves. Changing the key throws that revision away:
   * the next request carries none, the page answers in full, and it goes out at
   * once rather than on the next tick — which is what a button marked refresh
   * has to do to be worth pressing.
   */
  const [asked, setAsked] = useState(0);

  const { data } = useRevisioned(
    (rev) => client.call('assets.list', rev === undefined ? {} : { rev }),
    { intervalMs: LIST_INTERVAL_MS, key: asked },
  );

  const [selectedId, setSelectedId] = useState<TextureId | null>(null);

  const textures = data ?? NOTHING;
  const selected = useMemo(
    () => textures.find((texture) => texture.id === selectedId) ?? null,
    [textures, selectedId],
  );

  return (
    <div className="flex flex-grow flex-col overflow-hidden">
      <CollapsibleSplit
        left={
          <TextureGrid
            client={client}
            textures={textures}
            selected={selectedId}
            onSelect={setSelectedId}
            onRefresh={() => {
              setAsked((count) => count + 1);
            }}
          />
        }
        right={<TextureProperties client={client} texture={selected} onReveal={onReveal} />}
        /* One right width and no use for another — see `fixedRight`. */
        fixedRight
      />
    </div>
  );
}
