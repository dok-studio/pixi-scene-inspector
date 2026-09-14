// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_LIST_PX, HEADER_PX } from '../strip/stripHeight.js';
import type { PickedRow } from './PickedList.js';
import { PickedList } from './PickedList.js';

/**
 * The list of what a click landed on: the node on top, and everything the
 * picker could not have reached because it is drawn under something else.
 */

const ROWS: PickedRow[] = [
  { id: 4, name: 'coin', suffix: '(Sprite)', type: 'Sprite' },
  { id: 3, name: 'hero', suffix: '(Sprite)', type: 'Sprite' },
];

/** One of each kind the head has a button for, plus one it has none for. */
const MIXED: PickedRow[] = [
  { id: 4, name: 'coin', suffix: '(Sprite)', type: 'Sprite' },
  { id: 5, name: 'score', suffix: '(MultiStyleText)', type: 'MultiStyleText' },
  { id: 6, name: 'hero', suffix: '(Spine)', type: 'Spine' },
  { id: 7, name: 'grid', suffix: '(Graphics)', type: 'Graphics' },
];

/** Tall enough that the divider has somewhere to be dragged to. */
const COLUMN_PX = 600;

const onSelect = vi.fn();
const onHover = vi.fn();
const onClose = vi.fn();

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  onSelect.mockClear();
  onHover.mockClear();
  onClose.mockClear();
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

function render(rows: readonly PickedRow[], selected: number | null = null): void {
  act(() => {
    root.render(
      <PickedList
        rows={rows}
        selected={selected}
        onSelect={onSelect}
        onHover={onHover}
        onClose={onClose}
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

const strip = (): HTMLElement | null => container.firstElementChild as HTMLElement | null;
const header = (): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="separator"]')?.nextElementSibling as HTMLElement | null;
const closeButton = (): HTMLElement | null => container.querySelector<HTMLElement>('button');

/** The filter in the head with that label. */
function filter(label: string): HTMLElement | null {
  for (const button of container.querySelectorAll<HTMLElement>('button')) {
    if (button.textContent === label) return button;
  }
  return null;
}

const names = (): (string | null)[] =>
  [...container.querySelectorAll<HTMLElement>('li')].map((item) => item.textContent);

function click(element: HTMLElement | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function pointer(element: HTMLElement | null, type: 'mouseover' | 'mouseout'): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  });
}

describe('PickedList', () => {
  it('lists what the click found, topmost first, with the type beside each', () => {
    render(ROWS);

    expect(header()?.textContent).toContain('Under cursor');
    expect(header()?.textContent).toContain('2');
    expect([...container.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
      'coin (Sprite)',
      'hero (Sprite)',
    ]);
  });

  it('selects the node a row names', () => {
    render(ROWS);
    click(line('hero')?.querySelector('button') ?? null);

    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it('marks the row whose node is the selected one', () => {
    render(ROWS, 4);

    expect(line('coin')?.className).toContain('bg-primary/20');
    expect(line('hero')?.className).not.toContain('bg-primary/20');
  });

  /**
   * The part that settles which row is which: four sprites with the same name
   * are told apart by watching one light up on the canvas, not by reading.
   */
  it('highlights the node under the pointer, and stops when it leaves', () => {
    render(ROWS);

    pointer(line('hero'), 'mouseover');
    expect(onHover).toHaveBeenCalledWith(3);

    pointer(line('hero'), 'mouseout');
    expect(onHover).toHaveBeenLastCalledWith(null);
  });

  /**
   * The list goes away on the next pick, and the rows go with it — there is no
   * mouse-leave to be had by then. Same case as a tree row removed under the
   * pointer, and the same answer.
   */
  it('takes the highlight off on its way out', () => {
    render(ROWS);
    pointer(line('coin'), 'mouseover');
    onHover.mockClear();

    act(() => {
      root.unmount();
    });

    expect(onHover).toHaveBeenCalledWith(null);
    root = createRoot(container);
  });

  it('closes on the button in its header, without folding the section', () => {
    render(ROWS);
    click(closeButton());

    expect(onClose).toHaveBeenCalled();
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });

  /**
   * A click on a built screen answers with a dozen nodes, and what someone is
   * after is usually one kind of thing.
   */
  describe('the filters in its head', () => {
    it('shows every kind until one is pressed', () => {
      render(MIXED);

      expect(names()).toHaveLength(4);
      expect(filter('Container')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('narrows the list to the kind that is pressed', () => {
      render(MIXED);
      click(filter('Sprite'));

      expect(names()).toEqual(['coin (Sprite)']);
    });

    it('has a button for the shapes a game draws by hand', () => {
      render(MIXED);
      click(filter('Graphics'));

      expect(names()).toEqual(['grid (Graphics)']);
    });

    /**
     * A row of five coloured words reads as a legend — something to understand
     * rather than press. The glyph in front of it is what says otherwise.
     */
    it('is introduced by a sign saying it is one', () => {
      render(MIXED);

      const row = filter('Container')?.parentElement;
      expect(row?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    });

    it('takes more than one kind at a time', () => {
      render(MIXED);
      click(filter('Sprite'));
      click(filter('Spine'));

      expect(names()).toEqual(['coin (Sprite)', 'hero (Spine)']);
    });

    /** A patched text and a plain one are one button — see `filters.ts`. */
    it('finds a patched text under the Text button', () => {
      render(MIXED);
      click(filter('Text'));

      expect(names()).toEqual(['score (MultiStyleText)']);
    });

    it('says how many of the found nodes are on screen', () => {
      render(MIXED);
      expect(header()?.textContent).toContain('4');

      click(filter('Sprite'));
      expect(header()?.textContent).toContain('1/4');
    });

    /** The buttons stay on screen, or there would be no way to press them off. */
    it('says why the list is empty rather than emptying the window', () => {
      render(MIXED);
      click(filter('Container'));

      expect(names()).toEqual([]);
      expect(container.textContent).toContain('Nothing of that kind');
      expect(filter('Container')).not.toBeNull();
    });

    /**
     * Two chips pressed inside one batch, which a fast pair of clicks is. Both
     * have to land: starting each from the render's own list loses the first.
     */
    it('keeps both of two kinds pressed in the same breath', () => {
      render(MIXED);

      act(() => {
        filter('Sprite')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        filter('Spine')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(names()).toEqual(['coin (Sprite)', 'hero (Spine)']);
    });

    it('presses off again, and shows everything once nothing is pressed', () => {
      render(MIXED);
      click(filter('Sprite'));
      click(filter('Sprite'));

      expect(names()).toHaveLength(4);
    });

    /**
     * A hunt lasts longer than one click: the window stays up while pick after
     * pick lands, and what is pressed has to stay pressed through them.
     */
    it('stays pressed while the window is up and the rows change under it', () => {
      render(MIXED);
      click(filter('Spine'));

      render([
        { id: 8, name: 'other', suffix: '(Sprite)', type: 'Sprite' },
        { id: 9, name: 'boss', suffix: '(Spine)', type: 'Spine' },
      ]);

      expect(names()).toEqual(['boss (Spine)']);
    });

    /**
     * And no longer than the window. It closes on the button, on a pick that
     * found one node, and on the picker being switched off — after any of
     * those, a list narrowed by something nobody can see they asked for would
     * be a list with rows missing for no reason on screen.
     */
    it('is forgotten once the window has closed', () => {
      render(MIXED);
      click(filter('Spine'));

      // What closing it does: the window is unmounted by the tree above.
      act(() => {
        root.unmount();
      });
      root = createRoot(container);
      render(MIXED);

      expect(names()).toHaveLength(4);
      expect(filter('Spine')?.getAttribute('aria-pressed')).toBe('false');
      expect(localStorage.getItem('scene.picked.filters')).toBeNull();
    });
  });

  /**
   * The point of the colouring: the eye finds the green one in a list of twelve
   * without reading any of them. It only works if the button and the type in
   * the brackets are the same colour, which is what this holds still.
   */
  describe('the colour of a kind', () => {
    const suffix = (name: string): HTMLElement | null =>
      line(name)?.querySelector<HTMLElement>('span') ?? null;

    it('spells the type in the colour its own button wears', () => {
      render(MIXED);

      expect(suffix('coin')?.className).toContain('text-emerald-500');
      expect(filter('Sprite')?.className).toContain('text-emerald-500');

      expect(suffix('grid')?.className).toContain('text-rose-400');
      expect(filter('Graphics')?.className).toContain('text-rose-400');
    });

    /** Both spellings of a text are one button, so they are one colour. */
    it('spells a patched text as a text', () => {
      render(MIXED);

      expect(suffix('score')?.className).toContain('text-amber-500');
    });

    /** Grey says what it has always said: there is no button to look for. */
    it('leaves a kind with no button of its own grey', () => {
      render([
        { id: 1, name: 'ribbon', suffix: '(Mesh)', type: 'Mesh' },
        { id: 2, name: 'coin', suffix: '(Sprite)', type: 'Sprite' },
      ]);

      expect(suffix('ribbon')?.className).toContain('text-muted-foreground');
      expect(suffix('ribbon')?.className).not.toContain('text-emerald');
    });
  });

  describe('the divider', () => {
    it('starts at the default height', () => {
      render(ROWS);

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX)}px`);
    });

    /** Its own height, kept apart from the bookmarks' — see `useStripHeight`. */
    it('remembers how far it was dragged, under a key of its own', () => {
      render(ROWS);

      act(() => {
        container
          .querySelector('[role="separator"]')
          ?.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 400 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 340 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { clientY: 340 }));
      });

      expect(strip()?.style.height).toBe(`${String(HEADER_PX + DEFAULT_LIST_PX + 60)}px`);
      expect(JSON.parse(localStorage.getItem('scene.picked.height') ?? 'null')).toBe(
        DEFAULT_LIST_PX + 60,
      );
    });
  });

  /**
   * Not stored, unlike the bookmarks' fold state: this list is up until the
   * next click and then gone, so it always opens showing what it found.
   */
  it('opens unfolded every time, and remembers nothing about being folded', () => {
    render(ROWS);
    click(header());
    expect(container.querySelectorAll('li')).toHaveLength(0);

    act(() => {
      root.unmount();
    });
    root = createRoot(container);
    render(ROWS);

    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(localStorage.getItem('scene.picked.collapsed')).toBeNull();
  });
});
