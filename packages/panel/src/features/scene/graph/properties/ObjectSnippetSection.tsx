import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';

import { CollapsibleSection } from '../../../../components/collapsible/collapsible-section.js';
import { CopyButton } from '../../../../components/ui/copy-button.js';
import { useT } from '../../../../i18n/index.js';
import { Textarea } from '../../../../components/ui/textarea.js';
import { objectSnippet } from './objectSnippet.js';

/**
 * The Object snippet: `layout: 'custom:objectSnippet'`.
 *
 * The rows above it answer "what is this value now". This answers "what would I
 * write to get this" — the node's own placement as source, ready to be pasted
 * back into the game. The style snippet asks the same question of a caption's
 * style; this asks it of the transform every node has.
 *
 * Three things are deliberate:
 *
 *  - **the text is built here**, not in the page. A style has to be spelled the
 *    way the running library spells it and only the page knows that; a transform
 *    is numbers, and they are already on their way for the rows. So there is no
 *    command behind this section — `objectSnippet.ts` is the whole of it;
 *  - **the header is the section's own**, because the button that copies the
 *    whole object lives in it. Folding is still the panel's: `onCollapse` is
 *    passed down, so a folded snippet stops being asked for like any other
 *    section;
 *  - **the text is read-only rather than disabled**, for the reason the style
 *    snippet gives: selecting part of an object is half of what this is for, and
 *    a disabled textarea refuses to be selected. The other half is the button.
 */

export interface ObjectSnippetSectionProps {
  title: string;
  /** The name the object is written under, already chosen (`snippetName`). */
  name: string;
  /** Filtered to what this node carries, as every section's fields are. */
  fields: readonly PropertyDescriptor[];
  values: Record<string, Json> | null;
  onCollapse: (collapsed: boolean) => void;
}

export function ObjectSnippetSection({
  title,
  name,
  fields,
  values,
  onCollapse,
}: ObjectSnippetSectionProps) {
  const t = useT();
  const text = objectSnippet(name, fields, values);

  // Nothing known about this node yet, or nothing worth writing. A header over
  // an empty box would be worse than no section.
  if (text === '') return null;

  return (
    <CollapsibleSection
      title={title}
      className="border-x"
      onCollapse={onCollapse}
      aside={<CopyButton value={text} title={t('scene.prop.copyObject')} />}
    >
      <div className="px-1 py-1">
        <Textarea
          readOnly
          spellCheck={false}
          // Off, with the scroll that comes with it: a wrapped line reads as two
          // properties, and one of them does not exist.
          wrap="off"
          value={text}
          minRows={6}
          maxRows={24}
          className="overflow-x-auto whitespace-pre px-2 py-1 font-mono text-xs leading-snug"
        />
      </div>
    </CollapsibleSection>
  );
}
