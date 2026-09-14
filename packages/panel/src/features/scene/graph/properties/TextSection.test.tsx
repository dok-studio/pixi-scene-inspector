// @vitest-environment happy-dom
import type { Json, SectionSchema } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TextSection } from './TextSection.js';

/**
 * The gesture the Text tab adds to the grid: a style field is copied by double
 * clicking the name that labels it, exactly as a row's name is under Properties.
 *
 * Which fields offer it is the whole rule under test — everything from the first
 * heading down, and nothing above it.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const SECTION: SectionSchema = {
  id: 'text',
  title: 'Text',
  layout: 'custom:text',
  tab: 'Text',
  fields: [
    // Above the first heading, and none of them a line anyone pastes: the
    // classes a framework set, where the caption sits, and the words it says.
    { key: 'classesList', label: 'Classes List', editor: 'textList' },
    { key: 'text', label: 'Text', editor: 'textMultiLine' },
    { key: 'style.fontSize', label: 'Size', editor: 'number', group: 'Font' },
    { key: 'style.fill', label: 'Colour', editor: 'fill', group: 'Fill' },
  ],
};

const VALUES: Record<string, Json> = {
  classesList: 'button large',
  text: 'Level cleared',
  'style.fontSize': 28,
  'style.fill': 4465677,
};

describe('TextSection', () => {
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

  const show = (): void => {
    act(() => {
      root.render(
        <TextSection
          section={SECTION}
          values={VALUES}
          presence={VALUES}
          conditions={{}}
          onChange={() => undefined}
          nodeId={1}
        />,
      );
    });
  };

  const copyable = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.cursor-copy')];

  it('offers the gesture from the first heading down, and not above it', () => {
    show();

    expect(copyable().map((element) => element.textContent)).toEqual(['Size', 'Colour']);
  });

  it('copies a style field under the name the style holds it by', () => {
    show();
    const size = copyable().find((element) => element.textContent === 'Size');

    act(() => {
      size?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(written).toEqual(['fontSize: 28,']);
  });

  it('copies a colour as a colour, not as the number v8 converted it to', () => {
    show();
    const colour = copyable().find((element) => element.textContent === 'Colour');

    act(() => {
      colour?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });

    expect(written).toEqual(['fill: "#44240d",']);
  });
});
