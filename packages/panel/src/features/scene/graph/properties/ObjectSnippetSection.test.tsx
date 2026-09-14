// @vitest-environment happy-dom
import type { Json, PropertyDescriptor } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ObjectSnippetSection } from './ObjectSnippetSection.js';

/**
 * What the section does beyond printing: it copies the whole object, it folds
 * without copying, and it disappears where there is nothing to write.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const FIELDS: PropertyDescriptor[] = [
  { key: 'position', label: 'Position', editor: 'vector2' },
  { key: 'anchor', label: 'Anchor', editor: 'vector2' },
  { key: 'alpha', label: 'Alpha', editor: 'range' },
  { key: 'zIndex', label: 'Z Index', editor: 'number' },
];

const VALUES: Record<string, Json> = {
  position: { x: 12, y: 8 },
  anchor: null,
  alpha: 0.5,
  zIndex: 0,
};

const SNIPPET = 'heroSprite: {\n    position: {\n        x: 12,\n        y: 8\n    },\n    alpha: 0.5\n}';

describe('ObjectSnippetSection', () => {
  let container: HTMLElement;
  let root: Root;
  const written: string[] = [];

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    written.length = 0;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          written.push(text);
          return Promise.resolve();
        },
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const folds: boolean[] = [];

  const show = (values: Record<string, Json> | null): void => {
    folds.length = 0;
    act(() => {
      root.render(
        <ObjectSnippetSection
          title="Object"
          name="heroSprite"
          fields={FIELDS}
          values={values}
          onCollapse={(collapsed) => folds.push(collapsed)}
        />,
      );
    });
  };

  const area = (): HTMLTextAreaElement | null => container.querySelector('textarea');

  it('writes out what the node carries, and leaves out what it does not', () => {
    show(VALUES);

    // No anchor: this node has none. No zIndex: a zero is a line pasted into a
    // game to no effect.
    expect(area()?.value).toBe(SNIPPET);
  });

  it('copies the whole object, and leaves the section open', () => {
    show(VALUES);
    const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Copy the object"]');

    act(() => {
      button?.click();
    });

    expect(written).toEqual([SNIPPET]);
    // The button sits in the header, and a header is a fold.
    expect(area()).not.toBeNull();
    expect(folds).toEqual([]);
  });

  it('reports the fold, so a folded snippet stops being asked for', () => {
    show(VALUES);
    const header = [...container.querySelectorAll('div')].find(
      (element) => element.textContent === 'Object',
    );

    act(() => {
      header?.click();
    });

    expect(folds).toEqual([true]);
    expect(area()).toBeNull();
  });

  it('draws no section at all before any value has arrived', () => {
    show(null);

    expect(container.textContent).toBe('');
  });
});
