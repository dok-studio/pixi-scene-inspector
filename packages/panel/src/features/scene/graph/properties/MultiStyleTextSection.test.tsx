// @vitest-environment happy-dom
import type {
  CommandName,
  CommandParams,
  CommandResult,
  PropertyDescriptor,
  TextTagStyle,
} from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '../../../../transport/client.js';
import { MultiStyleTextSection } from './MultiStyleTextSection.js';

/**
 * The tags of a MultiStyleText, which the schema cannot declare: the names are
 * the application's and the set changes while the panel is open. What a tag may
 * carry is static and arrives separately, which is what these tests hold apart.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const FIELDS: PropertyDescriptor[] = [
  { key: 'fontFamily', label: 'Family', editor: 'text', group: 'Font' },
  { key: 'fontSize', label: 'Size', editor: 'number', group: 'Font' },
  { key: 'fill', label: 'Fill', editor: 'fill', group: 'Fill & Stroke' },
  { key: 'strokeThickness', label: 'Stroke width', editor: 'number', group: 'Fill & Stroke' },
];

const DEFAULT_TAG: TextTagStyle = {
  name: 'default',
  style: { fontFamily: 'Arial', fontSize: 26, fill: '#ffffff' },
  text: 'Level cleared',
};

const TAGS: TextTagStyle[] = [
  DEFAULT_TAG,
  {
    name: 'score',
    style: {
      fontSize: 44,
      fill: {
        kind: 'gradient',
        direction: 'vertical',
        stops: [
          { color: '#ffec6c', offset: 0.25 },
          { color: '#c07e00', offset: 0.75 },
        ],
      },
    },
    text: '18 450',
  },
  { name: 'odd', style: { flexFont: true }, text: '' },
];

interface Sent {
  command: CommandName;
  params: unknown;
}

function clientWith(sent: Sent[], tags: TextTagStyle[] = TAGS): Client {
  const client: Client = {
    call<K extends CommandName>(cmd: K, params: CommandParams<K>): Promise<CommandResult<K>> {
      sent.push({ command: cmd, params });

      if (cmd === 'text.tagStyleFields') return Promise.resolve(FIELDS as CommandResult<K>);
      if (cmd === 'text.tagStyles') {
        return Promise.resolve({ rev: 1, data: tags } as CommandResult<K>);
      }

      return Promise.resolve(undefined as CommandResult<K>);
    },
    send(cmd, params) {
      void client.call(cmd, params);
    },
  };

  return client;
}

describe('MultiStyleTextSection', () => {
  let container: HTMLElement;
  let root: Root;
  let sent: Sent[];

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    sent = [];
    localStorage.clear();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = async (client: Client): Promise<void> => {
    await act(async () => {
      root.render(<MultiStyleTextSection client={client} id={7} title="Tag styles" />);
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const buttonTitled = (title: string): HTMLButtonElement => {
    const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`);
    if (found === null) throw new Error(`No button titled ${title}`);
    return found;
  };

  /** The header of a collapsible is what folds it, and it is a div, not a button. */
  const expandTag = (name: string): void => {
    const header = [...container.querySelectorAll<HTMLElement>('[class*="cursor-pointer"]')].find(
      (element) => element.textContent?.startsWith(name) === true,
    );
    if (header === undefined) throw new Error(`No header for ${name}`);
    header.click();
  };

  /**
   * The section decides whether it exists, which nothing above it can: on
   * PixiJS 8 a multi-style text is an ordinary `Text`, so the schema offers the
   * tags to every text and only the page knows which of them has any.
   * `text.tagStyleFields` answers with nothing for the rest.
   */
  it('draws nothing at all for a text that carries no tags', async () => {
    const client: Client = {
      call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
        if (cmd === 'text.tagStyleFields') return Promise.resolve([] as CommandResult<K>);
        return Promise.resolve(undefined as CommandResult<K>);
      },
      send() {
        /* nothing is written from a section that is not drawn */
      },
    };

    await show(client);

    expect(container.textContent).toBe('');
  });

  it('draws a header of its own for a text that does', async () => {
    await show(clientWith(sent));

    expect(container.textContent).toContain('Tag styles');
  });

  /** Every tag is a header; only the folded state decides what is drawn under it. */
  it('lists the tags of the node', async () => {
    await show(clientWith(sent));

    expect(container.textContent).toContain('<score>');
    expect(container.textContent).toContain('<odd>');
    expect(container.textContent).toContain('default');
  });

  /**
   * A tag inherits everything it does not set, and thirty inherited rows would
   * bury the two that make it a tag at all.
   */
  it('draws only what a tag overrides', async () => {
    await show(clientWith(sent));

    const score = container.textContent ?? '';
    expect(score).toContain('Size');
    expect(score).toContain('Fill');
    expect(score).not.toContain('Stroke width');
  });

  /**
   * What the style cells cannot say: which words this tag is deciding. It sits
   * in the header so that folding the tag away keeps it, and it is information
   * only — no editor, so nothing to type into and nothing to write back.
   */
  it('heads a tag with the text it covers', async () => {
    await show(clientWith(sent));

    const header = [...container.querySelectorAll<HTMLElement>('[class*="cursor-pointer"]')].find(
      (element) => element.textContent?.startsWith('<score>') === true,
    );

    expect(header?.textContent).toContain('18 450');
    expect(header?.querySelector('input')).toBeNull();
  });

  it('says so when a tag the node declares is never used', async () => {
    await show(clientWith(sent));

    expect(container.textContent).toContain('not used in the text');
  });

  /**
   * A gradient gets a field per colour and a strip showing the ramp — the strip
   * being the point, since a fill written out as a list of hex codes is one nobody
   * can picture. What it looks like is judged on the stand; what is checkable here
   * is that the colours are editable and that the ramp is painted from them.
   */
  it('draws a gradient fill as a ramp with a field per colour', async () => {
    await show(clientWith(sent));

    const values = [...container.querySelectorAll('input')].map((input) => input.value);
    expect(values).toContain('#ffec6c');
    expect(values).toContain('#c07e00');

    const ramp = [...container.querySelectorAll<HTMLElement>('div')].find((element) =>
      element.style.backgroundImage.includes('gradient'),
    );
    expect(ramp?.style.backgroundImage).toContain('#ffec6c 25.0%');
  });

  /**
   * Which of the two a fill is belongs in the heading, not in the row: the row is
   * about the value, the heading about what kind of value it is. It is a choice
   * rather than a switch so that it says which one is current — a button said
   * nothing, including when the page refused the write.
   */
  describe('the choice between a colour and a gradient', () => {
    const kind = (name: string): HTMLButtonElement => {
      const found = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent?.trim() === name,
      );
      if (found === undefined) throw new Error(`No ${name} button`);
      return found;
    };

    it('shows which one the tag is filled with', async () => {
      await show(clientWith(sent));

      // `aria-checked` rather than `data-state`: the hint wrapped around a
      // segment is a Radix trigger too, and its own state attribute lands on
      // the same element — see `ui/tooltip.tsx`.
      expect(kind('Gradient').getAttribute('aria-checked')).toBe('true');
      expect(kind('Solid').getAttribute('aria-checked')).toBe('false');
    });

    /** Back to one colour, and the ramp's first is the one worth keeping. */
    it('writes the first colour of the ramp when the choice goes back', async () => {
      await show(clientWith(sent));

      act(() => {
        kind('Solid').click();
      });

      expect(sent.at(-1)).toEqual({
        command: 'text.mutateTag',
        params: { id: 7, kind: 'set', tag: 'score', key: 'fill', value: '#ffec6c' },
      });
    });

    it('writes nothing when the choice is already where it was clicked', async () => {
      await show(clientWith(sent));
      const before = sent.length;

      act(() => {
        kind('Gradient').click();
      });

      expect(sent).toHaveLength(before);
    });
  });

  /** A game's own patch adds properties of its own; a tag that sets one says so. */
  it('shows a key the declared list does not cover, and does not offer to write it', async () => {
    await show(clientWith(sent));

    expect(container.textContent).toContain('Flex Font');
    expect(container.querySelector('button[aria-label="Reset Flex Font on <odd> to default"]')).toBeNull();
  });

  /**
   * `default` is a complete style rather than an override, so nothing is taken
   * off it and it cannot be deleted. It also starts folded: it is long, and the
   * Text tab right above already shows the same values.
   */
  it('offers no way to clear a property off default, or to delete it', async () => {
    await show(clientWith(sent, [DEFAULT_TAG]));

    expect(container.querySelector('button[aria-label^="Reset"]')).toBeNull();

    act(() => {
      expandTag('default');
    });

    expect(container.textContent).toContain('Family');
    expect(container.querySelector('button[aria-label^="Reset"]')).toBeNull();
    expect(container.querySelector('button[aria-label^="Delete the"]')).toBeNull();
  });

  it('clears a property off a tag', async () => {
    await show(clientWith(sent));

    act(() => {
      buttonTitled('Reset Size on <score> to default').click();
    });

    expect(sent.filter((call) => call.command === 'text.mutateTag')).toEqual([
      { command: 'text.mutateTag', params: { id: 7, kind: 'clear', tag: 'score', key: 'fontSize' } },
    ]);
  });

  it('deletes a tag', async () => {
    await show(clientWith(sent));

    act(() => {
      buttonTitled('Delete the <score> tag').click();
    });

    expect(sent.filter((call) => call.command === 'text.mutateTag')).toEqual([
      { command: 'text.mutateTag', params: { id: 7, kind: 'remove', tag: 'score' } },
    ]);
  });

  it('adds a tag by name', async () => {
    await show(clientWith(sent));

    const input = container.querySelector<HTMLInputElement>('input[placeholder="New tag name"]');
    if (input === null) throw new Error('No name field');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input, 'hint');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      buttonTitled('Add a tag').click();
    });

    expect(sent.filter((call) => call.command === 'text.mutateTag')).toEqual([
      { command: 'text.mutateTag', params: { id: 7, kind: 'add', tag: 'hint' } },
    ]);
  });

  /** A tag with no name is not a tag; the button says so rather than failing. */
  it('will not add a tag without a name', async () => {
    await show(clientWith(sent));

    expect(buttonTitled('Add a tag').disabled).toBe(true);
  });

  it('offers the properties a tag has not set yet', async () => {
    await show(clientWith(sent));

    act(() => {
      // `default` starts folded, so the first menu on screen is `score`'s.
      const menus = container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Add a property to this tag"]',
      );
      menus[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    const offered = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
      (item) => item.textContent,
    );

    expect(offered).toEqual(['Family', 'Stroke width']);
  });

  /**
   * Asking for a property writes nothing. On the class where a tag holds a whole
   * style there is nothing meaningful to write — the tag already carries the
   * default's value — and on the other one a made-up number would move the text
   * before anyone asked. The row opens at what the default says; the first edit
   * is what turns it into an override.
   */
  it('opens a property at the default value without writing anything', async () => {
    await show(clientWith(sent));

    act(() => {
      const menus = container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Add a property to this tag"]',
      );
      menus[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    const family = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'Family',
    );

    act(() => {
      family?.click();
    });

    const values = [...container.querySelectorAll('input')].map((input) => input.value);
    expect(values).toContain('Arial');
    expect(sent.filter((call) => call.command === 'text.mutateTag')).toEqual([]);
  });

  /** Having asked for a row, one has to be able to take it away again. */
  it('takes a revealed row away again', async () => {
    await show(clientWith(sent));

    act(() => {
      const menus = container.querySelectorAll<HTMLButtonElement>(
        'button[aria-label="Add a property to this tag"]',
      );
      menus[0]?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    act(() => {
      [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
        .find((item) => item.textContent === 'Family')
        ?.click();
    });

    act(() => {
      buttonTitled('Reset Family on <score> to default').click();
    });

    expect(container.querySelector('button[aria-label="Reset Family on <score> to default"]')).toBeNull();
  });
});
