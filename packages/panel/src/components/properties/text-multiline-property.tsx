import { useEffect, useState } from 'react';

import { Textarea } from '../ui/textarea.js';
import type { PropertyPanelData } from './propertyTypes.js';

/**
 * Ported from the previous project. Commits on Ctrl+Enter or blur rather than
 * on Enter, since a newline is a legitimate thing to type here.
 */
export const TextMultiLineProperty: React.FC<PropertyPanelData> = ({ value, entry }) => {
  const text = typeof value === 'string' ? value : '';
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
    <Textarea
      value={buffer}
      onChange={(event) => {
        setIsEditing(true);
        setBuffer(event.target.value);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && event.ctrlKey) {
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
      minRows={1}
      maxRows={8}
      className="border-border hover:border-secondary focus:border-secondary w-full rounded text-xs outline-none"
    />
  );
};
