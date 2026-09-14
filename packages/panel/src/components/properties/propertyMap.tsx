import type { PropertyEditor } from '@scene-inspector/protocol';
import { memo } from 'react';

import { BooleanProperty } from './boolean-property.js';
import { ColorProperty } from './color-property.js';
import { FillProperty } from './fill-property.js';
import { NumberProperty } from './number-property.js';
import type { PropertyPanelData } from './propertyTypes.js';
import { RangeProperty } from './range-property.js';
import { SelectProperty } from './select-property.js';
import { TextListProperty } from './text-list-property.js';
import { TextMultiLineProperty } from './text-multiline-property.js';
import { TextProperty } from './text-property.js';
import { Vector2Property } from './vector-property.js';

/**
 * Editor kind → component.
 *
 * Each is memoized on its own value, so a poll that moves one property does not
 * re-render the rest of the panel. The previous project compared props by
 * `JSON.stringify`; here the value is already plain JSON and the descriptor is
 * a stable object, so a shallow comparison is both cheaper and enough.
 *
 * Every kind the protocol declares has an entry. The map is still `Partial`,
 * because the key arrives from the page rather than from this compilation: a
 * host older or newer than the panel can name a kind that is not here, and
 * `FallbackProperty` draws it read-only instead of rendering nothing.
 */

function sameData(previous: PropertyPanelData, next: PropertyPanelData): boolean {
  if (previous.prop !== next.prop || previous.entry.type !== next.entry.type) return false;

  const a = previous.value;
  const b = next.value;
  if (a === b) return true;

  // Vectors are a fresh object on every poll, so identity says nothing.
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  return false;
}

export const propertyMap: Partial<Record<PropertyEditor, React.FC<PropertyPanelData>>> = {
  boolean: memo(BooleanProperty, sameData),
  color: memo(ColorProperty, sameData),
  fill: memo(FillProperty, sameData),
  number: memo(NumberProperty, sameData),
  range: memo(RangeProperty, sameData),
  select: memo(SelectProperty, sameData),
  text: memo(TextProperty, sameData),
  textList: memo(TextListProperty, sameData),
  textMultiLine: memo(TextMultiLineProperty, sameData),
  vector2: memo(Vector2Property, sameData),
};

/** Anything without a registered editor, so a new descriptor is visible rather than missing. */
export const FallbackProperty: React.FC<PropertyPanelData> = ({ value }) => (
  <span className="text-muted-foreground text-xs">
    {value === undefined ? '—' : JSON.stringify(value)}
  </span>
);
