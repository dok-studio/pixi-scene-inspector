import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select.js';
import type { PropertyPanelData } from './propertyTypes.js';

/**
 * Ported from the previous project. The choices come from the descriptor's
 * `options`, which is a plain array of strings — declared in the schema, not
 * discovered from the node.
 */
export const SelectProperty: React.FC<PropertyPanelData> = ({ value, entry }) => {
  const options = Array.isArray(entry.options) ? entry.options.map(String) : [];
  const current = value === null || value === undefined ? '' : String(value);

  return (
    <Select
      value={current}
      onValueChange={(next) => {
        entry.onChange(next);
      }}
    >
      <SelectTrigger className="border-border hover:border-secondary focus:border-secondary h-7 w-full text-sm outline-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {entry.optionLabels?.[option] ?? option}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
