// @vitest-environment happy-dom
import type {
  CommandName,
  CommandParams,
  CommandResult,
  SceneNode,
  SectionSchema,
} from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { SceneProperties } from './SceneProperties.js';

/**
 * The panel must not empty itself between two selections.
 *
 * In the playground every call settles in a microtask, so a component that
 * renders nothing until its first answer arrives still paints only once. Behind
 * `chrome.devtools.inspectedWindow.eval` the same round trip takes tens of
 * milliseconds and the empty render reaches the screen — the flash this file
 * guards against. The client here is therefore deliberately slow: nothing
 * settles until the test says so.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const SPRITE_SCHEMA: SectionSchema[] = [
  {
    id: 'transform',
    title: 'Transform',
    layout: 'generic',
    fields: [
      { key: 'x', label: 'X', editor: 'number' },
      { key: 'y', label: 'Y', editor: 'number' },
      // Declared for every type and carried by none of these nodes — `label` is
      // v8's, and this stands for every field the running PixiJS does not have.
      { key: 'label', label: 'Label', editor: 'text' },
    ],
  },
  {
    id: 'interaction',
    title: 'Interaction',
    layout: 'generic',
    fields: [{ key: 'cursor', label: 'Cursor', editor: 'text' }],
  },
];

/**
 * A type with a tab of its own: the Container sections, and under them two
 * sections that name the same tab — one titled after it, as the real Text
 * schema is, and one that is not.
 */
const TEXT_SCHEMA: SectionSchema[] = [
  ...SPRITE_SCHEMA,
  {
    id: 'text.placement',
    title: 'Placement',
    layout: 'generic',
    tab: 'Text',
    // The same key General offers, which is allowed because only one tab is
    // ever on screen.
    fields: [{ key: 'x', label: 'X', editor: 'number' }],
  },
  {
    id: 'text',
    title: 'Text',
    layout: 'generic',
    tab: 'Text',
    fields: [
      { key: 'size', label: 'Size', editor: 'number' },
      // Declared for both PixiJS lines and carried by one of them, which is
      // what an uncovered tab would show two of.
      { key: 'legacySize', label: 'Legacy size', editor: 'number' },
    ],
  },
];

/**
 * What the real Container schema does: a section of rows and, under it, a
 * section that writes the very same fields out as source.
 */
const SNIPPET_SCHEMA: SectionSchema[] = [
  {
    id: 'general',
    title: 'General',
    layout: 'generic',
    fields: [
      { key: 'x', label: 'X', editor: 'number' },
      { key: 'y', label: 'Y', editor: 'number' },
    ],
  },
  {
    id: 'interaction',
    title: 'Interaction',
    layout: 'generic',
    fields: [{ key: 'cursor', label: 'Cursor', editor: 'text' }],
  },
  {
    id: 'objectSnippet',
    title: 'Object',
    layout: 'custom:objectSnippet',
    fields: [
      { key: 'x', label: 'X', editor: 'number' },
      { key: 'y', label: 'Y', editor: 'number' },
    ],
  },
];

const VALUES: Record<number, Record<string, number | string | null>> = {
  1: { x: 10, y: 20, label: null, cursor: 'pointer' },
  2: { x: 30, y: 40, label: null, cursor: 'pointer' },
  3: { x: 50, y: 60, label: null, cursor: 'pointer', size: 12, legacySize: null },
};

function node(id: number, type: string): SceneNode {
  return { id, parent: 0, name: `node-${String(id)}`, type, flags: 0 };
}

/** A client whose every answer waits for `settle()`. */
function slowClient(sprite: SectionSchema[] = SPRITE_SCHEMA) {
  let pending: Array<() => void> = [];
  const asked: string[] = [];
  /** The key lists `scene.propValues` was asked for, in order. */
  const askedKeys: string[][] = [];

  const answer = <K extends CommandName>(cmd: K, params: CommandParams<K>): unknown => {
    if (cmd === 'scene.propSchema') {
      const { type } = params as CommandParams<'scene.propSchema'>;
      return type === 'Text' ? TEXT_SCHEMA : sprite;
    }

    if (cmd === 'scene.propValues') {
      const { id, keys } = params as CommandParams<'scene.propValues'>;
      const table = VALUES[id];
      const data: Record<string, number | string | null> = {};
      // A key the node does not carry answers null, as the page does.
      for (const key of keys) data[key] = table === undefined ? `text-${String(id)}` : table[key] ?? null;
      return { rev: id, data };
    }

    return undefined;
  };

  /** Everything asked, arguments and all, for the calls whose arguments matter. */
  const askedWith: Array<{ cmd: string; params: unknown }> = [];

  const client: Client = {
    call<K extends CommandName>(cmd: K, params: CommandParams<K>): Promise<CommandResult<K>> {
      asked.push(cmd);
      askedWith.push({ cmd, params });
      if (cmd === 'scene.propValues') {
        askedKeys.push([...(params as CommandParams<'scene.propValues'>).keys]);
      }
      return new Promise<CommandResult<K>>((resolve) => {
        pending.push(() => {
          resolve(answer(cmd, params) as CommandResult<K>);
        });
      });
    },
    send(cmd, params) {
      void client.call(cmd, params);
    },
  };

  /** Answers everything asked so far, including whatever those answers ask for next. */
  const settle = async (rounds = 3): Promise<void> => {
    for (let round = 0; round < rounds; round += 1) {
      const due = pending;
      pending = [];
      for (const resolve of due) resolve();
      await act(async () => {
        await Promise.resolve();
      });
    }
  };

  return { client, settle, asked, askedKeys, askedWith };
}

/**
 * The button in the tab strip that writes the node to the page's console.
 *
 * Found by the label its `Hint` gives it, which is also how a screen reader
 * finds it: the glyph is the only other thing it has, and the glyph is the very
 * thing that changes when the button is pressed.
 */
function logButton(container: HTMLElement): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((element) =>
    (element.getAttribute('aria-label') ?? '').includes('console'),
  );
  if (button === undefined) throw new Error('No console button');

  return button;
}

/** The number fields, which is where the values under test are read. */
function inputs(container: HTMLElement): HTMLInputElement[] {
  return [...container.querySelectorAll<HTMLInputElement>('input[data-number-input]')];
}

/** The tabs on offer, in the order they are drawn. */
function tabs(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-tab]')].map(
    (element) => element.dataset.tab ?? '',
  );
}

/** Switches to a tab, the way clicking it does. */
function openTab(container: HTMLElement, name: string): void {
  const tab = container.querySelector<HTMLElement>(`[data-tab="${name}"]`);
  if (tab === null) throw new Error(`No tab named ${name}`);

  act(() => {
    tab.click();
  });
}

/** Clicks a section header by its title, the way folding it happens. */
function fold(container: HTMLElement, title: string): void {
  const header = [...container.querySelectorAll('div')].find(
    (element) => element.textContent === title,
  );
  if (header === undefined) throw new Error(`No section titled ${title}`);

  act(() => {
    header.click();
  });
}

describe('SceneProperties', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
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

  const show = async (selected: SceneNode | null, client: Client): Promise<void> => {
    await act(async () => {
      root.render(<SceneProperties client={client} node={selected} />);
      await Promise.resolve();
    });
  };

  it('keeps the fields on screen while the next node is being read', async () => {
    const { client, settle } = slowClient();

    await show(node(1, 'Sprite'), client);
    await settle();

    expect(inputs(container).map((input) => input.value)).toEqual(['10', '20']);

    // The selection moves, and nothing has answered yet. This is the moment the
    // panel used to spend empty.
    await show(node(2, 'Sprite'), client);
    expect(inputs(container)).toHaveLength(2);

    await settle();
    expect(inputs(container).map((input) => input.value)).toEqual(['30', '40']);
  });

  it('does not ask for a schema it has already been told', async () => {
    const { client, settle, asked } = slowClient();

    await show(node(1, 'Sprite'), client);
    await settle();

    const before = asked.filter((cmd) => cmd === 'scene.propSchema').length;

    await show(node(2, 'Sprite'), client);
    await settle();

    expect(asked.filter((cmd) => cmd === 'scene.propSchema')).toHaveLength(before);
  });

  it('never shows a field this PixiJS does not have, not even in passing', async () => {
    const { client, settle } = slowClient();

    await show(node(1, 'Sprite'), client);
    await settle();
    expect(container.textContent).not.toContain('Label');

    // The reading that says `label` is not there belongs to the type and the
    // version, not to the node, so it still holds while the next node is read.
    await show(node(2, 'Sprite'), client);
    expect(container.textContent).not.toContain('Label');

    await settle();
    expect(container.textContent).not.toContain('Label');
  });

  it('waits for the first reading of a type instead of guessing its fields', async () => {
    const { client, settle } = slowClient();

    await show(node(1, 'Sprite'), client);

    // The schema has arrived, the values have not. Nothing is known yet about
    // which of these fields the node carries, and a row that appears only to be
    // taken away again is worse than one that arrives a round trip late.
    await settle(1);
    expect(inputs(container)).toHaveLength(0);

    await settle();
    expect(inputs(container)).toHaveLength(2);
  });

  /**
   * What this button does happens in another tab of DevTools, so the press has
   * to be answered here or it cannot be told from a press that missed.
   */
  describe('the console button', () => {
    it('sends the selected node, and says that it did', async () => {
      const { client, settle, askedWith } = slowClient();

      await show(node(1, 'Sprite'), client);
      await settle();

      expect(logButton(container).className).not.toContain('text-primary');

      act(() => {
        logButton(container).click();
      });

      expect(askedWith.filter((one) => one.cmd === 'scene.log')).toEqual([
        { cmd: 'scene.log', params: { id: 1 } },
      ]);
      expect(logButton(container).className).toContain('text-primary');
    });

    it('takes the confirmation away with the node it was about', async () => {
      const { client, settle } = slowClient();

      await show(node(1, 'Sprite'), client);
      await settle();

      act(() => {
        logButton(container).click();
      });

      // Nothing has been logged about this one, and the button must not look
      // as though something had.
      await show(node(2, 'Sprite'), client);
      await settle();

      expect(logButton(container).className).not.toContain('text-primary');
    });
  });

  it('keeps a folded section, which is the only place its header can come back from', async () => {
    const { client, settle } = slowClient();

    await show(node(1, 'Sprite'), client);
    await settle();

    // Folding takes the section's keys out of the request, so the next reading
    // says nothing about them. Silence is not the page saying the fields are
    // gone — and the header goes with them if it is read that way.
    fold(container, 'Interaction');
    await settle();

    expect(container.textContent).toContain('Interaction');
  });

  /**
   * A tab is a slice of the same schema, so what holds for a section holds for
   * it: only what is on screen is asked for, and nothing is drawn before it is
   * known — the second one matters more here, because a tab's fields arrive all
   * at once and half of them may not exist on this PixiJS.
   */
  describe('tabs', () => {
    /** The strip is the panel's header; one that comes and goes moves the rest. */
    it('draws the strip even when there is a single tab', async () => {
      const { client, settle } = slowClient();

      await show(node(1, 'Sprite'), client);
      await settle();

      expect(tabs(container)).toEqual(['Properties']);
    });

    it('names the tabs the schema mentions, in the order it mentions them', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      expect(tabs(container)).toEqual(['Properties', 'Text']);
    });

    it('opens on the properties every node has', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      expect(container.textContent).toContain('Interaction');
      expect(container.textContent).not.toContain('Placement');
    });

    it('asks only for the keys of the tab on screen', async () => {
      const { client, settle, askedKeys } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      expect(askedKeys[askedKeys.length - 1]).not.toContain('size');

      openTab(container, 'Text');
      await settle();

      expect(askedKeys[askedKeys.length - 1]).toEqual(['x', 'size', 'legacySize']);
    });

    /**
     * The reading for the previous tab says nothing about these keys, and
     * silence is not the page saying the fields are there. Showing them anyway
     * would put both PixiJS lines' names on screen and take half away a moment
     * later.
     */
    it('waits for the first reading of a tab instead of guessing its fields', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      openTab(container, 'Text');
      expect(container.textContent).not.toContain('Legacy size');

      await settle();
      expect(container.textContent).toContain('Size');
      expect(container.textContent).not.toContain('Legacy size');
    });

    /** The tab is the section's header; drawing both says the same word twice. */
    it('drops the header of a section named after its tab', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      openTab(container, 'Text');
      await settle();

      const headers = [...container.querySelectorAll('div')].filter(
        (element) => element.textContent === 'Text' && !('tab' in element.dataset),
      );

      expect(headers).toEqual([]);
      // The section that is not named after the tab keeps its own.
      expect(container.textContent).toContain('Placement');
    });

    it('goes back to a tab it has already read without an empty frame', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      openTab(container, 'Text');
      await settle();

      // Nothing is asked yet, and nothing has to be: what these fields are was
      // learnt on the way out and never forgotten.
      openTab(container, 'Properties');
      expect(container.textContent).toContain('Interaction');
    });

    /**
     * Falling back to the first tab must not be a choice: clicking through a
     * list that mixes captions with everything else would keep throwing the
     * Text tab away.
     */
    it('keeps the chosen tab across a node that does not have it', async () => {
      const { client, settle } = slowClient();

      await show(node(3, 'Text'), client);
      await settle();

      openTab(container, 'Text');
      await settle();

      await show(node(1, 'Sprite'), client);
      await settle();
      expect(tabs(container)).toEqual(['Properties']);
      expect(container.textContent).toContain('Interaction');

      await show(node(3, 'Text'), client);
      await settle();
      expect(container.textContent).toContain('Placement');
    });
  });

  /**
   * The Object snippet declares the fields General draws, so that folding
   * General does not take the values it writes off the wire. What it must not
   * do is put each of them on the wire twice.
   */
  it('asks for a shared key once, however many sections declare it', async () => {
    const { client, settle, askedKeys } = slowClient(SNIPPET_SCHEMA);

    await show(node(1, 'Sprite'), client);
    await settle();

    const keys = askedKeys.at(-1) ?? [];

    expect(keys).toEqual(['x', 'y', 'cursor']);
  });

  /**
   * The gesture belongs to the section a node's own placement lives in. On rows
   * whose value is not a field of anything — a type, a list of classes — there
   * is nothing to write, and a gesture that works on some names and quietly not
   * on others is worse than one that belongs to a section.
   */
  it('offers the copy gesture on the General rows, and nowhere else', async () => {
    const { client, settle } = slowClient(SNIPPET_SCHEMA);

    await show(node(1, 'Sprite'), client);
    await settle();

    const names = [...container.querySelectorAll<HTMLElement>('.cursor-copy')];

    expect(names.map((element) => element.textContent)).toEqual(['X', 'Y']);
  });

  it('brings back a known type without an empty frame in between', async () => {
    const { client, settle } = slowClient();

    await show(node(1, 'Sprite'), client);
    await settle();

    await show(node(3, 'Text'), client);
    await settle();

    // Back to a type the panel has already seen: its fields are there in the
    // very first render, before anything is asked.
    await show(node(2, 'Sprite'), client);
    expect(inputs(container)).toHaveLength(2);
  });
});
