// @vitest-environment happy-dom
import type { CommandName, CommandResult, PropertyDescriptor } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../../transport/client.js';
import { SpriteSection } from './SpriteSection.js';

/**
 * The Sprite section draws one declared field with two things around it: the
 * names the page can draw by, to pick from, and the id itself, to copy.
 * Neither is in the schema, and that is the point of the custom layout.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const FIELDS: PropertyDescriptor[] = [{ key: 'textureId', label: 'Texture Id', editor: 'text' }];

function clientWith(names: string[]): Client {
  const client: Client = {
    call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
      if (cmd === 'assets.names') {
        return Promise.resolve({ rev: 1, data: names } as CommandResult<K>);
      }

      return Promise.resolve(undefined as CommandResult<K>);
    },
    send(cmd, params) {
      void client.call(cmd, params);
    },
  };

  return client;
}

describe('SpriteSection', () => {
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

  const show = async (client: Client, onChange = vi.fn(), nodeId = 1): Promise<void> => {
    await act(async () => {
      root.render(
        <SpriteSection
          client={client}
          nodeId={nodeId}
          fields={FIELDS}
          values={{ textureId: 'hero.png' }}
          onChange={onChange}
        />,
      );
      await Promise.resolve();
    });
  };

  const buttonTitled = (title: string): HTMLButtonElement => {
    const found = container.querySelector<HTMLButtonElement>(`button[aria-label="${title}"]`);
    if (found === null) throw new Error(`No button titled ${title}`);
    return found;
  };

  it('draws the declared field with its value', async () => {
    await show(clientWith(['hero.png']));

    expect(container.textContent).toContain('Texture Id');
    expect(container.querySelector('input')?.value).toBe('hero.png');
  });

  it('copies the texture id', async () => {
    await show(clientWith(['hero.png']));

    act(() => {
      buttonTitled('Copy the texture id').click();
    });

    expect(written).toEqual(['hero.png']);
  });

  it('offers the file rather than the path it was served from', async () => {
    await show(clientWith(['assets/img/hero.png', 'assets/img/villain.png']));

    // The menu opens on a pointer press, not on a click — that is how the
    // primitive behind it works, and a plain `click()` would open nothing.
    act(() => {
      buttonTitled('Pick a loaded texture').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      );
    });

    expect(document.body.textContent).toContain('villain.png');
    expect(document.body.textContent).not.toContain('assets/img/villain.png');
  });

  it('writes the short name of the texture that was picked', async () => {
    const onChange = vi.fn();
    await show(clientWith(['assets/img/hero.png', 'assets/img/villain.png']), onChange);

    act(() => {
      buttonTitled('Pick a loaded texture').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0 }),
      );
    });

    const picked = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent === 'villain.png',
    );

    act(() => {
      picked?.click();
    });

    expect(onChange).toHaveBeenCalledWith('textureId', 'villain.png');
  });

  /**
   * The panel does not remount when the selection moves, and an editor is
   * memoised on its value — so a row keyed by field alone kept the previous
   * node's `onChange` for any two sprites that happened to share a texture id.
   */
  it('writes to the node now selected, not the one before it', async () => {
    const client = clientWith(['hero.png', 'villain.png']);

    const first = vi.fn();
    await show(client, first, 1);

    const second = vi.fn();
    await show(client, second, 2);

    // Through the field rather than the menu: the memo is on the editor, and
    // the menu button reads its handler straight from the props.
    const field = container.querySelector('input');
    if (field === null) throw new Error('expected the texture id field');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(field, 'villain.png');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(second).toHaveBeenCalledWith('textureId', 'villain.png');
    expect(first).not.toHaveBeenCalled();
  });

  /** Nothing loaded is nothing to pick from, and a menu of nothing is a trap. */
  it('has nothing to offer when the page has loaded nothing', async () => {
    await show(clientWith([]));

    expect(buttonTitled('Pick a loaded texture').disabled).toBe(true);
  });
});
