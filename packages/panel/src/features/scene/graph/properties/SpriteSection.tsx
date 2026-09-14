import type { Json, NodeId, PropertyDescriptor } from '@scene-inspector/protocol';
import { useMemo } from 'react';
import { FaAngleDown } from 'react-icons/fa6';

import { PropertyEntry } from '../../../../components/properties/propertyEntry.js';
import { FallbackProperty, propertyMap } from '../../../../components/properties/propertyMap.js';
import { propertyData } from '../../../../components/properties/propertyTypes.js';
import { Button } from '../../../../components/ui/button.js';
import { useT } from '../../../../i18n/index.js';
import { Hint } from '../../../../components/ui/tooltip.js';
import { CopyButton } from '../../../../components/ui/copy-button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/dropdown-menu.js';
import type { Client } from '../../../../transport/client.js';
import { useRevisioned } from '../../../../transport/useRevisioned.js';
import { textureChoices } from './textureChoices.js';

/**
 * The Sprite section: `layout: 'custom:sprite'`.
 *
 * What makes it worth a component of its own is that the value is a name from a
 * set the page holds: a texture id is typed today and mistyped tomorrow, so the
 * loaded textures are offered to pick from, and the id itself can be taken to
 * the clipboard.
 *
 * The field is still a declared descriptor, read and written through the same
 * commands as any other property (§3.4) — only the markup around it is here.
 *
 * The list is `assets.names` and **not** the one the Assets tab polls: that one
 * is about the textures the renderer holds, which are atlas pages, and pointing
 * a sprite at a page draws the whole sheet. It is polled **only while this
 * section is open**, because a folded section unmounts its children.
 */

/** The page's set of names moves when something loads, and not otherwise. */
const TEXTURES_INTERVAL_MS = 1000;

export interface SpriteSectionProps {
  client: Client;
  /** The node being edited — part of every row key; see below. */
  nodeId: NodeId;
  /** The section's fields that are actually shown — presence is decided above. */
  fields: readonly PropertyDescriptor[];
  values: Record<string, Json> | null;
  onChange: (key: string, value: Json) => void;
}

export function SpriteSection({ client, nodeId, fields, values, onChange }: SpriteSectionProps) {
  const t = useT();
  const { data: names } = useRevisioned(
    (rev) => client.call('assets.names', rev === undefined ? {} : { rev }),
    { intervalMs: TEXTURES_INTERVAL_MS },
  );

  const choices = useMemo(() => textureChoices(names), [names]);

  return (
    <div className="px-1 py-1 [&>*:first-child]:pt-0">
      {fields.map((descriptor, index) => {
        const value = values?.[descriptor.key];
        const text = typeof value === 'string' ? value : '';
        const Editor = propertyMap[descriptor.editor] ?? FallbackProperty;

        return (
          <PropertyEntry
            // Keyed by node as well as by field, the same as the generic
            // layout and the Text section. The panel does not remount when the
            // selection moves, and an editor's props are compared by value —
            // so two sprites sharing a texture id handed the second one the
            // first one's `onChange`, and typing a new id wrote it to the
            // sprite that was no longer selected.
            key={`${String(nodeId)}:${descriptor.key}`}
            title={descriptor.label}
            isLast={index === fields.length - 1}
            input={
              <div className="flex w-full items-center gap-1">
                <Editor {...propertyData(descriptor, value, onChange)} />

                <DropdownMenu>
                  <Hint text={t('scene.prop.pickTexture')}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="xs"
                        className="px-1"
                        disabled={choices.length === 0}
                      >
                        <FaAngleDown />
                      </Button>
                    </DropdownMenuTrigger>
                  </Hint>
                  <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                    {choices.map((choice) => (
                      <DropdownMenuItem
                        key={choice}
                        onSelect={() => {
                          onChange(descriptor.key, choice);
                        }}
                      >
                        {choice}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <CopyButton value={text} title={t('scene.prop.copyTextureId')} />
              </div>
            }
          />
        );
      })}
    </div>
  );
}
