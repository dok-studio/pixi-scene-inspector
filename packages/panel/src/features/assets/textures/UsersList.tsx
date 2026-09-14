import type { NodeId, TextureId, TextureUser } from '@scene-inspector/protocol';
import { useState } from 'react';

import { CollapsibleSection } from '../../../components/collapsible/collapsible-section.js';
import { useT } from '../../../i18n/index.js';
import type { Client } from '../../../transport/client.js';
import { useRevisioned } from '../../../transport/useRevisioned.js';

/**
 * The nodes drawing the selected texture, and the way from one of them into the
 * Scene tab.
 *
 * The question the grid beside it cannot answer. `assets.list` reports what the
 * renderer is holding and what it costs on the GPU, and says nothing about
 * whether anything is *using* it — an atlas page nothing draws from looks
 * exactly like one the whole game is built on. So the tab could show that a
 * page cost four megabytes and not that it was dead weight.
 *
 * Polled only while the section is open, and it opens folded: the answer is a
 * walk of the entire scene, and having a texture selected should not cost one.
 */

/** Nodes come and go while a game runs; this is the tree's pace, halved. */
const USERS_INTERVAL_MS = 1000;

/** One array, so "nothing yet" does not look like a new list on every render. */
const NOTHING: TextureUser[] = [];

export function UsersList({
  client,
  id,
  onReveal,
}: {
  client: Client;
  id: TextureId;
  /** Select this node and open the Scene tab on it. */
  onReveal: (id: NodeId) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const { data } = useRevisioned(
    (rev) => client.call('assets.users', rev === undefined ? { id } : { id, rev }),
    { intervalMs: USERS_INTERVAL_MS, enabled: open, key: id },
  );

  // `null` is "the page has not answered yet"; an empty list is an answer, and
  // it is the one worth reading — nothing in the scene is drawing this.
  const users = data ?? NOTHING;
  const answered = data !== null;

  return (
    <CollapsibleSection
      title={t('assets.usedBy')}
      defaultCollapsed
      aside={users.length === 0 ? undefined : <span>{users.length}</span>}
      onCollapse={(collapsed) => {
        setOpen(!collapsed);
      }}
    >
      {/* Five rows, then the pane's spare room, then no further than its own
          rows — see the note in `FrameList`, which shares the arrangement. */}
      <div className="max-h-max shrink-0 grow basis-[calc(5*1.25rem)] overflow-auto">
        {users.length === 0 ? (
          <p className="text-muted-foreground p-2 text-center text-xs">
            {answered ? 'Nothing in the scene is drawing this.' : 'Looking…'}
          </p>
        ) : (
          users.map((user) => (
            <button
              key={user.id}
              type="button"
              className="hover:bg-accent flex w-full items-center gap-2 px-2 py-0.5 text-left text-xs"
              onClick={() => {
                onReveal(user.id);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{user.label}</span>
              <span className="text-muted-foreground shrink-0 tabular-nums">#{user.id}</span>
            </button>
          ))
        )}
      </div>
    </CollapsibleSection>
  );
}
