import type { NodeId } from '@scene-inspector/protocol';

import { SaveCollapsibleSection } from '../../../../components/collapsible/collapsible-section.js';
import { CopyButton } from '../../../../components/ui/copy-button.js';
import { useT } from '../../../../i18n/index.js';
import { Textarea } from '../../../../components/ui/textarea.js';
import type { Client } from '../../../../transport/client.js';
import { useRevisioned } from '../../../../transport/useRevisioned.js';

/**
 * The Style snippet: `layout: 'custom:textStyleSnippet'`.
 *
 * The rows above it in this tab answer "what is this value now". This answers
 * "what would I write to get this" — the style of a patched text as its own
 * source, in the spelling the running library uses, ready to be pasted back
 * into the game. The page builds the whole string (`text.styleSnippet`); there
 * is nothing to compose here.
 *
 * Two things are deliberate:
 *
 *  - **the section draws its own header**, unlike every other one, because it
 *    is the only one that decides whether it exists at all. Being a patched text
 *    is a property of the node and the schema is keyed by type, so the section
 *    is declared for every Text and the empty answer is what takes it away
 *    again. Nothing above can know that before the page has answered;
 *  - **the text is read-only rather than disabled.** A disabled textarea greys
 *    out and refuses to be selected, and selecting part of a style is half of
 *    what this is for. The other half is the button in the header.
 */

/** It only moves when something edits the node, and it is one small string. */
const SNIPPET_INTERVAL_MS = 1000;

export interface StyleSnippetSectionProps {
  client: Client;
  id: NodeId;
  title: string;
}

export function StyleSnippetSection({ client, id, title }: StyleSnippetSectionProps) {
  const t = useT();
  const { data } = useRevisioned(
    (rev) => client.call('text.styleSnippet', rev === undefined ? { id } : { id, rev }),
    { intervalMs: SNIPPET_INTERVAL_MS, key: id },
  );

  const text = data ?? '';

  // Not a patched text — or the page has not answered yet. Either way there is
  // nothing to draw, and a header over an empty box would be worse than none.
  if (text === '') return null;

  return (
    <SaveCollapsibleSection
      // Folded state is the section's rather than the node's: this is a habit
      // ("I read snippets" / "I do not"), not something about one caption.
      storageKey="properties.textStyleSnippet"
      title={title}
      className="border-x"
      aside={<CopyButton value={text} title={t('scene.prop.copyStyle')} />}
    >
      <div className="px-1 py-1">
        <Textarea
          readOnly
          spellCheck={false}
          // Off, with the scroll that comes with it: a wrapped line of source
          // reads as two properties, and one of them does not exist.
          wrap="off"
          value={text}
          minRows={6}
          maxRows={24}
          className="overflow-x-auto whitespace-pre px-2 py-1 font-mono text-xs leading-snug"
        />
      </div>
    </SaveCollapsibleSection>
  );
}
