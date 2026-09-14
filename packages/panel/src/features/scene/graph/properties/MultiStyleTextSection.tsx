import type { Json, NodeId, PropertyDescriptor, TextTagMutation, TextTagStyle } from '@scene-inspector/protocol';
import { useCallback, useMemo, useState } from 'react';
import { FaPlus } from 'react-icons/fa6';

import {
  CollapsibleSection,
  SaveCollapsibleSection,
} from '../../../../components/collapsible/collapsible-section.js';
import { Button } from '../../../../components/ui/button.js';
import { useT } from '../../../../i18n/index.js';
import { Input } from '../../../../components/ui/input.js';
import { Hint } from '../../../../components/ui/tooltip.js';
import type { Client } from '../../../../transport/client.js';
import { useResource } from '../../../../transport/useResource.js';
import { useRevisioned } from '../../../../transport/useRevisioned.js';
import { TagStyleGrid } from './TagStyleGrid.js';

/**
 * MultiStyleText: `layout: 'custom:multiStyleText'`.
 *
 * Like Spine, this section draws no descriptors from the schema, and for the
 * same kind of reason: a tag's name belongs to the application, so a schema
 * keyed by node type cannot declare one. What is static — which properties a
 * tag may carry — arrives once as `text.tagStyleFields`; what is per node
 * arrives as `text.tagStyles` (docs/architecture.md §3.5).
 *
 * Three things are deliberate:
 *
 *  - **only what a tag overrides is drawn.** A tag inherits everything else from
 *    `default`, and showing thirty inherited cells per tag would bury the two
 *    that make it a tag at all. What is missing can be added from the `+` menu,
 *    and what was added can be taken off again;
 *  - **the text a tag covers sits in its header.** It is one line of reference
 *    rather than a setting, and there it survives the tag being folded away —
 *    which is what makes a folded list of tags worth reading;
 *  - **nothing is mirrored locally after a change.** The next poll says what the
 *    scene actually holds, which is the honest answer when the class clamps a
 *    value or the write was refused — the same position `scene.setProp` takes.
 */

/** The list only moves when something here moves it. */
const TAGS_INTERVAL_MS = 500;

/** The properties a tag may carry cannot change under us. */
const FIELDS_INTERVAL_MS = 30_000;

/** The one tag that is a whole style rather than an override of one. */
const DEFAULT_TAG = 'default';

function Tag({
  tag,
  base,
  fields,
  onMutate,
}: {
  tag: TextTagStyle;
  base: Record<string, Json>;
  fields: readonly PropertyDescriptor[];
  onMutate: (mutation: TextTagMutation) => void;
}) {
  /**
   * Properties asked for from the `+` menu.
   *
   * Asking for one writes nothing. On the class where a tag holds a whole style
   * it *cannot* write anything meaningful — the tag already carries the
   * default's value for every key — and on the other one writing a made-up
   * number the moment a cell appears would move the text before anyone asked.
   * So the cell is opened at what the default says, and the first edit is what
   * turns it into an override.
   */
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());

  // Keys rather than a key: what is asked for from the `+` menu is often a whole
  // group — a stroke, a shadow — because that is the unit a tag carries them in.
  const reveal = useCallback((keys: readonly string[]) => {
    setRevealed((previous) => {
      const next = new Set(previous);
      for (const key of keys) next.add(key);
      return next;
    });
  }, []);

  const hide = useCallback((keys: readonly string[]) => {
    setRevealed((previous) => {
      if (!keys.some((key) => previous.has(key))) return previous;

      const next = new Set(previous);
      for (const key of keys) next.delete(key);
      return next;
    });
  }, []);

  const isDefault = tag.name === DEFAULT_TAG;

  return (
    <SaveCollapsibleSection
      // Folded state is per tag and outlives the panel being closed. `default`
      // is long and rarely the one being worked on.
      storageKey={`properties.multiStyleText.${tag.name}`}
      defaultCollapsed={isDefault}
      title={isDefault ? DEFAULT_TAG : `<${tag.name}>`}
      aside={
        // Information only: which words this tag is deciding. It follows the
        // markup, so editing the text above changes it on the next poll — and
        // there is no editor here at all, nothing to type into and nothing to
        // write back.
        <span className="text-muted-foreground min-w-0 select-none truncate text-xs font-normal">
          {tag.text === '' ? 'not used in the text' : tag.text}
        </span>
      }
      /*
        Grey, and the same grey for every tag — the one heading here that is not
        about a kind of setting. The groups inside it carry a hue each; a tag is
        the box those groups sit in, and a box wants an edge rather than a colour
        of its own.

        `bg-border` is the theme's own next step of grey after the `bg-muted` the
        group bands and every other section header take, so the header reads as a
        level up in both themes without a colour being chosen here. The edge is
        the outline: a border in the muted ink, which is the one line in this
        panel that is neither a band nor a divider.
      */
      className="bg-border border-muted-foreground/40 border-x pl-6 text-xs"
    >
      <TagStyleGrid
        tag={tag}
        base={base}
        fields={fields}
        revealed={revealed}
        onMutate={onMutate}
        onReveal={reveal}
        onHide={hide}
      />
    </SaveCollapsibleSection>
  );
}

export interface MultiStyleTextSectionProps {
  client: Client;
  id: NodeId;
  title: string;
}

/**
 * The section draws its own header, because it is the one that decides whether
 * it exists.
 *
 * On PixiJS 8 there is no MultiStyleText class: the game folds the feature into
 * its own `Text`, and whether a given text reads its markup depends on the style
 * it was handed (`adapters/nodeType.ts`). So the schema offers the tags to every
 * `Text` and the answer to "are there any" is per node — which nothing above can
 * know before the page has replied.
 *
 * `text.tagStyleFields` is what asks. It answers with the properties a tag of
 * **this** class may carry, and with nothing at all for a text that has no tags;
 * it is static, so the 30s poll behind it costs nothing. The tags themselves
 * stay inside the fold, where a folded section is still never read.
 */
export function MultiStyleTextSection({ client, id, title }: MultiStyleTextSectionProps) {
  const { data: fields } = useResource(() => client.call('text.tagStyleFields', { id }), {
    intervalMs: FIELDS_INTERVAL_MS,
    key: id,
  });

  // No tags, or the page has not answered yet. A header over nothing is worse
  // than no header.
  if (fields === null || fields.length === 0) return null;

  return (
    <CollapsibleSection title={title} className="border-x">
      <Tags client={client} id={id} fields={fields} />
    </CollapsibleSection>
  );
}

function Tags({
  client,
  id,
  fields,
}: {
  client: Client;
  id: NodeId;
  fields: readonly PropertyDescriptor[];
}) {
  const t = useT();
  const { data: tags } = useRevisioned(
    (rev) => client.call('text.tagStyles', rev === undefined ? { id } : { id, rev }),
    { intervalMs: TAGS_INTERVAL_MS, key: id },
  );

  const [draft, setDraft] = useState('');

  // What every other tag inherits, and therefore what a cell that overrides
  // nothing is showing.
  const base = useMemo(
    () => (tags ?? []).find((tag) => tag.name === DEFAULT_TAG)?.style ?? {},
    [tags],
  );

  const onMutate = useCallback(
    (mutation: TextTagMutation) => {
      client.send('text.mutateTag', { id, ...mutation });
    },
    [client, id],
  );

  const addTag = (): void => {
    const name = draft.trim();
    if (name === '') return;

    onMutate({ kind: 'add', tag: name });
    setDraft('');
  };

  return (
    <div className="py-1">
      {(tags ?? []).map((tag) => (
        <Tag key={tag.name} tag={tag} base={base} fields={fields} onMutate={onMutate} />
      ))}

      <div className="flex items-center gap-1 px-2 pt-2">
        <Input
          className="border-border h-6 w-full rounded text-xs"
          placeholder="New tag name"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            addTag();
          }}
        />
        <Hint text={t('scene.prop.addTag')}>
          <Button
            variant="outline"
            size="xs"
            className="gap-1 px-1"
            disabled={draft.trim() === ''}
            onClick={addTag}
          >
            <FaPlus /> Tag
          </Button>
        </Hint>
      </div>
    </div>
  );
}
