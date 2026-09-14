// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BookmarkRow } from './BookmarkList.js';
import { BookmarkList } from './BookmarkList.js';
import type { NodePath } from './path.js';
import { DEFAULT_LIST_PX, HEADER_PX } from '../strip/stripHeight.js';

const path = (name: string): NodePath => [
  { name: 'stage', type: 'Container', index: 0, siblings: 1 },
  { name: 'world', type: 'Container', index: 0, siblings: 1 },
  { name, type: 'Sprite', index: 0, siblings: 1 },
];

const ROWS: BookmarkRow[] = [
  { path: path('hero'), id: 3, name: 'hero', suffix: '(Sprite)' },
  { path: path('coin'), id: 4, name: 'coin', suffix: '(Sprite)' },
];

/** Tall enough that the divider has somewhere to be dragged to. */
const COLUMN_PX = 600;

const onSelect = vi.fn();
const onRemove = vi.fn();
const onClear = vi.fn();

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  onSelect.mockClear();
  onRemove.mockClear();
  onClear.mockClear();
  localStorage.clear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);

  // The strip measures the column it shares with the tree, and nothing has a
  // size in a headless document. The container *is* that column here.
  container.getBoundingClientRect = () => ({ height: COLUMN_PX }) as DOMRect;

  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
});

function render(rows: readonly BookmarkRow[], selected: number | null = null): void {
  act(() => {
    root.render(
      <BookmarkList
        rows={rows}
        selected={selected}
        onSelect={onSelect}
        onRemove={onRemove}
        onClear={onClear}
      />,
    );
  });
}

/** The row naming that node, or `null` when it is not on screen. */
function line(name: string): HTMLElement | null {
  for (const item of container.querySelectorAll<HTMLElement>('li')) {
    if (item.textContent?.startsWith(name) === true) return item;
  }
  return null;
}

function buttonIn(item: HTMLElement | null, at: number): HTMLElement | null {
  return item?.querySelectorAll<HTMLElement>('button')[at] ?? null;
}

const strip = (): HTMLElement | null => container.firstElementChild as HTMLElement | null;
const header = (): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="separator"]')?.nextElementSibling as HTMLElement | null;
const clearButton = (): HTMLElement | null => container.querySelector<HTMLElement>('button');

function click(element: HTMLElement | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** A pointer gesture on the divider, from one y to another. */
function drag(from: number, to: number): void {
  act(() => {
    container
      .querySelector('[role="separator"]')
      ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: from }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: to }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { clientY: to }));
  });
}

describe('BookmarkList', () => {
  it('takes no room at all while nothing is bookmarked', () => {
    render([]);
    expect(container.textContent).toBe('');
  });

  it('lists a bookmarked node with the type beside it, and says how many there are', () => {
    render(ROWS);

    expect(line('hero')?.textContent).toContain('(Sprite)');
    expect(header()?.textContent).toContain('Bookmarks');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  it('selects the node a row names', () => {
    render(ROWS);
    click(buttonIn(line('hero'), 0));

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('removes a bookmark by the walk it was written down under', () => {
    render(ROWS);
    click(buttonIn(line('coin'), 1));

    expect(onRemove).toHaveBeenCalledWith(path('coin'));
  });

  it('marks the row whose node is the selected one', () => {
    render(ROWS, 3);

    expect(line('hero')?.className).toContain('bg-primary/20');
    expect(line('coin')?.className).not.toContain('bg-primary/20');
  });

  it('spells the whole walk out, so two nodes that read alike can be told apart', () => {
    render(ROWS);

    expect(buttonIn(line('hero'), 0)?.getAttribute('aria-label')).toBe('stage / world / hero');
  });

  describe('folding it away', () => {
    it('leaves the header and nothing else, and stops setting a height', () => {
      render(ROWS);
      expect(strip()?.style.height).not.toBe('');

      click(header());

      expect(container.querySelectorAll('li')).toHaveLength(0);
      expect(header()?.textContent).toContain('Bookmarks');
      // Folded, the strip is as tall as what is left in it.
      expect(strip()?.style.height).toBe('');
    });

    it('is still folded the next time the panel opens', () => {
      render(ROWS);
      click(header());

      expect(JSON.parse(localStorage.getItem('scene.bookmarks.collapsed') ?? 'null')).toBe(true);
    });

    /** The header is itself the control that folds; Clear sits inside it. */
    it('is not folded by the Clear button inside its header', () => {
      render(ROWS);
      click(clearButton());

      expect(onClear).toHaveBeenCalled();
      expect(container.querySelectorAll('li')).toHaveLength(2);
    });
  });

  describe('the divider', () => {
    it('starts at the default height', () => {
      render(ROWS);

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX)}px`);
    });

    it('grows the list when dragged up, and remembers how far', () => {
      render(ROWS);
      drag(400, 340);

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX + 60)}px`);
      expect(JSON.parse(localStorage.getItem('scene.bookmarks.height') ?? 'null')).toBe(
        DEFAULT_LIST_PX + 60,
      );
    });

    it('shrinks the list when dragged down', () => {
      render(ROWS);
      drag(400, 440);

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX - 40)}px`);
    });

    it('stops following the pointer once it has been let go', () => {
      render(ROWS);
      drag(400, 340);

      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 }));
      });

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX + 60)}px`);
    });

    it('cannot be dragged while the list is folded away', () => {
      render(ROWS);
      click(header());
      drag(400, 200);

      expect(strip()?.style.height).toBe('');
    });
  });
});
