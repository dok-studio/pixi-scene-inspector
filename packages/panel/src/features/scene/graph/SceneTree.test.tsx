// @vitest-environment happy-dom
import type { SceneNode } from '@scene-inspector/protocol';
import { NODE_VISIBLE } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PickedRow } from '../picked/PickedList.js';
import type { Client } from '../../../transport/client.js';
import type { OverlayControls } from './useOverlay.js';

// The tree measures itself, and nothing has a size in a headless document, so
// every row would be virtualized away. Give it a viewport instead.
vi.mock('react-virtualized-auto-sizer', () => ({
  default: ({ children }: { children: (size: { width: number; height: number }) => unknown }) =>
    children({ width: 300, height: 600 }),
}));

const { SceneTree } = await import('./SceneTree.js');

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** stage → group → two sprites: the sprites start out of sight. */
const NODES: SceneNode[] = [
  { id: 1, parent: 0, name: 'stage', type: 'Container', flags: NODE_VISIBLE },
  { id: 2, parent: 1, name: 'group', type: 'Container', flags: NODE_VISIBLE },
  { id: 3, parent: 2, name: 'hero', type: 'Sprite', flags: NODE_VISIBLE },
  { id: 4, parent: 2, name: 'coin', type: 'Sprite', flags: NODE_VISIBLE },
];

const send = vi.fn();
const onBookmark = vi.fn();
const onClosePicked = vi.fn();
const onCounts = vi.fn();
const client = { call: () => Promise.resolve(undefined), send } as unknown as Client;

const setHovered = vi.fn();

const overlay: OverlayControls = {
  highlight: false,
  picker: true,
  wrapBox: true,
  axes: 'arrows',
  transform: false,
  setHighlight: () => undefined,
  setPicker: () => undefined,
  setWrapBox: () => undefined,
  setAxes: () => undefined,
  setTransform: () => undefined,
  setHovered,
};

/** One bookmark, so the strip under the tree has something to show. */
const BOOKMARKS = [
  {
    path: [{ index: 0, name: 'stage', type: 'Container', siblings: 1 }],
    id: 3,
    name: 'hero',
    suffix: '(Sprite)',
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  send.mockClear();
  onBookmark.mockClear();
  onClosePicked.mockClear();
  onCounts.mockClear();
  setHovered.mockClear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** The row carrying that name, or `null` when it is not on screen. */
function row(name: string): HTMLElement | null {
  for (const element of container.querySelectorAll<HTMLElement>('div')) {
    if (element.className.includes('items-center') && element.textContent?.startsWith(name)) {
      return element;
    }
  }
  return null;
}

/** The `role="treeitem"` wrapper of that row — what react-arborist listens on. */
function treeitem(name: string): HTMLElement | null {
  return row(name)?.closest<HTMLElement>('[role="treeitem"]') ?? null;
}

/** Clicking a row is how it becomes the focused one, which Delete acts on. */
async function focusRow(name: string): Promise<void> {
  await act(async () => {
    treeitem(name)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function press(name: string, key: string): Promise<void> {
  await act(async () => {
    treeitem(name)?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
}

/** The dialog is portalled out of the tree, so it is looked up in the document. */
function dialogButton(label: string): HTMLElement | null {
  for (const button of document.querySelectorAll<HTMLElement>('button')) {
    if (button.textContent === label) return button;
  }
  return null;
}

async function click(element: HTMLElement | null): Promise<void> {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

async function render(selected: number | null, picked: PickedRow[] = []): Promise<void> {
  await act(async () => {
    root.render(
      <SceneTree
        client={client}
        nodes={NODES}
        selected={selected}
        overlay={overlay}
        pinned={new Set()}
        bookmarked={new Set()}
        bookmarks={BOOKMARKS}
        picked={picked}
        onSelect={() => undefined}
        onPin={() => undefined}
        onClearPins={() => undefined}
        onBookmark={onBookmark}
        onRemoveBookmark={() => undefined}
        onClearBookmarks={() => undefined}
        onClosePicked={onClosePicked}
        counts={false}
        onCounts={onCounts}
      />,
    );
  });
}

describe('SceneTree', () => {
  it('highlights a node picked in the scene on the first pick', async () => {
    await render(null);
    expect(row('hero')).toBeNull();

    await render(3);

    const hero = row('hero');
    expect(hero).not.toBeNull();
    expect(hero?.className).toContain('isSelected');
  });

  it('moves the highlight when the next pick is in the same branch', async () => {
    await render(3);
    await render(4);

    expect(row('hero')?.className).not.toContain('isSelected');
    expect(row('coin')?.className).toContain('isSelected');
  });

  /**
   * The buttons at the end of a row are `sticky right-0`, and a sticky box is
   * stopped by the edges of the box it lives in. Two things decide where those
   * edges are, and both are load-bearing for the buttons lining up in one
   * column — how wide they end up being is a matter of layout, which nothing
   * here measures, but where the walls are put is structure.
   */
  describe('the row the buttons are pinned inside', () => {
    it('takes its width from the shared one rather than its own content', async () => {
      await render(3);

      const rows = [...container.querySelectorAll<HTMLElement>('[role="treeitem"]')];
      expect(rows.length).toBeGreaterThan(1);

      // arborist's own row asks for `max-content`, which is each row's own name
      // and no wider — the right edge would then be in a different place on
      // every row.
      for (const element of rows) {
        expect(element.style.minWidth).toBe('var(--tree-row-width, max-content)');
      }
    });

    it('carries the depth indent on the arrow, not on itself', async () => {
      await render(3);

      const hero = row('hero');
      expect(hero).not.toBeNull();

      // As padding on the row, the indent was also the left wall the buttons
      // could not be pushed past.
      expect(hero?.style.paddingLeft).toBe('');
      expect(hero?.querySelector('span')?.getAttribute('style')).toContain('padding-left');
    });
  });

  /**
   * The lens is the field's own sign, not a control beside it — which is the
   * whole of what the markup has to get right: inside the label, so a click on
   * it puts the caret in the input, and in front of the text rather than after
   * it, where a glyph reads as a button that does something.
   */
  it('puts the lens inside the search field, ahead of the text', async () => {
    await render(null);

    const field = container.querySelector<HTMLInputElement>('input[placeholder="Search"]');
    const label = field?.closest('label');

    expect(label).not.toBeNull();
    expect(label?.firstElementChild?.tagName.toLowerCase()).toBe('svg');
    expect(label?.contains(field ?? null)).toBe(true);
  });

  /**
   * The third button, between the eye and the gizmo. What it does never
   * reaches the page — the tree reports the node and the shell writes the walk
   * down — so what there is to check here is that the right node is reported
   * and that the row underneath is not selected or folded by the press.
   */
  it('bookmarks the node its row belongs to, and tells the page nothing', async () => {
    await render(3);

    // The toggles themselves, not the tooltip triggers wrapped around them:
    // both carry `data-state`, only a toggle says whether it is pressed.
    const buttons = row('hero')?.querySelectorAll<HTMLElement>('[aria-pressed]') ?? [];
    expect(buttons).toHaveLength(3);

    await click(buttons[1] ?? null);

    expect(onBookmark).toHaveBeenCalledWith(3, true);
    expect(send).not.toHaveBeenCalled();
    expect(row('hero')?.className).toContain('isSelected');
  });

  /**
   * The two lists under the tree share one strip, and the transient one covers:
   * what a click just found is answered now, a bookmark keeps.
   */
  describe('the strip under the tree', () => {
    it('shows the bookmarks while no pick found more than one node', async () => {
      await render(null);

      expect(container.textContent).toContain('Bookmarks');
      expect(container.textContent).not.toContain('Under cursor');
    });

    it('gives the strip to what the last pick found, and takes it back', async () => {
      await render(null, [
        { id: 4, name: 'coin', suffix: '(Sprite)', type: 'Sprite' },
        { id: 3, name: 'hero', suffix: '(Sprite)', type: 'Sprite' },
      ]);

      expect(container.textContent).toContain('Under cursor');
      expect(container.textContent).not.toContain('Bookmarks');

      await render(null);

      expect(container.textContent).toContain('Bookmarks');
    });
  });

  describe('deleting with the keyboard', () => {
    it('asks before removing the focused node, and removes it when told to', async () => {
      await render(3);
      await focusRow('hero');
      await press('hero', 'Delete');

      // The question names the node, and nothing has left for the page yet.
      expect(document.body.textContent).toContain('Delete “hero”?');
      expect(send).not.toHaveBeenCalled();

      await click(dialogButton('Delete'));

      expect(send).toHaveBeenCalledWith('scene.mutate', { kind: 'delete', id: 3 });
    });

    it('leaves the node alone when the question is answered no', async () => {
      await render(3);
      await focusRow('hero');
      await press('hero', 'Delete');
      await click(dialogButton('Cancel'));

      expect(send).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('Delete “hero”?');
    });

    /**
     * react-arborist deletes on Backspace by itself, without asking. The tree
     * takes that key over so there is one way to delete a node, not two.
     */
    it('asks on Backspace as well, rather than deleting outright', async () => {
      await render(3);
      await focusRow('hero');
      await press('hero', 'Backspace');

      expect(send).not.toHaveBeenCalled();
      expect(document.body.textContent).toContain('Delete “hero”?');
    });

    /** The scene refuses to remove the stage, so the tree does not offer to. */
    it('says nothing about the stage', async () => {
      await render(null);
      await focusRow('stage');
      await press('stage', 'Delete');

      expect(document.body.textContent).not.toContain('Delete “stage');
      expect(send).not.toHaveBeenCalled();
    });
  });
});
