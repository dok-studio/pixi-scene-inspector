import { ColorInput } from '../ui/color.js';
import type { PropertyPanelData } from './propertyTypes.js';

/** Ported from the previous project. */
export const ColorProperty: React.FC<PropertyPanelData> = ({ value, entry }) => (
  <ColorInput
    value={typeof value === 'number' || typeof value === 'string' ? value : null}
    onChange={entry.onChange}
  />
);
