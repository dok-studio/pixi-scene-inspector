import type { Vector2Value } from '../ui/vector2.js';
import { Vector2 } from '../ui/vector2.js';
import type { PropertyPanelData } from './propertyTypes.js';
import { optionsOf } from './propertyTypes.js';

interface VectorOptions {
  step: number;
  min: number;
  max: number;
  wheelStep: number;
}

function asVector(value: PropertyPanelData['value']): Vector2Value | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

/**
 * Ported from the previous project. The axis options are shared by both fields
 * here rather than declared per axis: every vector in the schema steps the same
 * way on x and y, and the descriptor says so once.
 */
export const Vector2Property: React.FC<PropertyPanelData> = (data) => {
  const options = optionsOf<VectorOptions>(data);

  return (
    <Vector2
      x={{ label: 'x', ...options }}
      y={{ label: 'y', ...options }}
      value={asVector(data.value)}
      onChange={(next) => {
        data.entry.onChange({ x: next.x, y: next.y });
      }}
    />
  );
};
