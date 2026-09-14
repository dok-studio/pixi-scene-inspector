import { useEffect, useState } from 'react';

import { Input } from '../ui/input.js';
import type { PropertyPanelData } from './propertyTypes.js';

/**
 * A text field, ported from the previous project. Commits on Enter or blur,
 * rolls back on Escape, and holds its draft while focused so a polled value
 * cannot overwrite what is being typed.
 *
 * One change: the value is handed over as a string rather than as
 * `JSON.stringify(string)`. The quoting existed because the value was about to
 * be interpolated into a line of JavaScript.
 */
export const TextProperty: React.FC<PropertyPanelData> = ({ value, entry, readOnly }) => {
  const text = typeof value === 'string' ? value : value === undefined ? '' : String(value);

  const [buffer, setBuffer] = useState(text);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) setBuffer(text);
  }, [text, isEditing]);

  const commit = (next: string): void => {
    entry.onChange(next);
    setIsEditing(false);
  };

  return (
    <Input
      type="text"
      disabled={readOnly === true}
      value={buffer}
      onChange={(event) => {
        setIsEditing(true);
        setBuffer(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(buffer);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          setBuffer(text);
          setIsEditing(false);
        }
      }}
      onBlur={() => {
        commit(buffer);
      }}
      className="border-border hover:border-secondary focus:border-secondary h-6 w-full rounded text-xs outline-none"
    />
  );
};
