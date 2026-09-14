import { FaListUl } from 'react-icons/fa6';

import { Input } from '../ui/input.js';
import { useT } from '../../i18n/index.js';
import { Textarea } from '../ui/textarea.js';
import { Toggle } from '../ui/toggle.js';
import { Hint } from '../ui/tooltip.js';
import { setClassesLayout, useClassesLayout } from './classesLayout.js';
import type { PropertyPanelData } from './propertyTypes.js';

/**
 * A list the application keeps in one string — a game's `classesList` is
 * `'button large primary'` — with a switch for reading it as a column.
 *
 * **Read, never written.** These belong to the framework that put them there,
 * and it is the framework that reads them back, so the field only shows. It is
 * a `readOnly` box rather than a plain span because a list is something to copy
 * out of, in part or whole, and a box is what can be selected in.
 *
 * The switch is a way of looking rather than a setting, so it is one switch for
 * the whole panel and it does not outlive the session — see `classesLayout.ts`.
 * The compact form is what the panel opens on: most of the time the row is one
 * line among thirty, and the column is for the moment the classes are the
 * question being asked.
 *
 * **Each form is the control that suits it**, and the compact one is a plain
 * single-line field rather than a box one line tall. A box that scrolls
 * sideways draws a scrollbar, and this panel's is 10px in a row of 20 — a long
 * list came out with a grey bar across the middle of the words. A field scrolls
 * with the caret and draws nothing, which is also how every other single-line
 * row here already behaves.
 *
 * `readOnly` rather than `disabled` in both: a disabled field cannot be selected
 * in, and copying a class out of it is most of what it is for.
 */

/** Any run of whitespace separates two items; empties are not items. */
function items(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(/\s+/).filter((item) => item !== '');
}

export const TextListProperty: React.FC<PropertyPanelData> = ({ value }) => {
  const t = useT();
  const layout = useClassesLayout();
  const list = items(value);

  return (
    <span className="flex min-w-0 flex-1 items-start gap-1">
      {layout === 'column' ? (
        <Textarea
          readOnly
          spellCheck={false}
          // Off: an item broken across two lines would read as two items.
          wrap="off"
          value={list.join('\n')}
          minRows={1}
          maxRows={12}
          className="border-border w-full rounded px-1.5 py-0.5 text-xs outline-none"
        />
      ) : (
        <Input
          readOnly
          spellCheck={false}
          type="text"
          value={list.join(' ')}
          className="border-border h-6 w-full rounded text-xs outline-none"
        />
      )}
      <Hint text={t('ui.textList.onePerLine')}>
        <Toggle
          variant="outline"
          size="xs"
          className="mt-0.5 flex-none px-1"
          pressed={layout === 'column'}
          onPressedChange={(pressed) => {
            setClassesLayout(pressed ? 'column' : 'line');
          }}
        >
          <FaListUl />
        </Toggle>
      </Hint>
    </span>
  );
};
