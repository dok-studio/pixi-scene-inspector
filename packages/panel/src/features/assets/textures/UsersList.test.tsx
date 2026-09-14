// @vitest-environment happy-dom
import type { TextureUser } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { UsersList } from './UsersList.js';

/**
 * Which nodes are drawing the selected texture, and the way from one of them
 * into the Scene tab.
 *
 * The rule worth guarding is the same one the frame list keeps: the answer is a
 * walk of the whole scene in the page, and a folded section must not buy one.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const USERS: TextureUser[] = [
  { id: 12, label: 'hero' },
  { id: 31, label: 'Sprite' },
];

describe('UsersList', () => {
  let container: HTMLElement;
  let root: Root;
  const call = vi.fn();
  const onReveal = vi.fn();
  const client = { call } as unknown as Client;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    call.mockReset();
    call.mockResolvedValue({ rev: 1, data: USERS });
    onReveal.mockClear();
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

  const show = async (): Promise<void> => {
    await act(async () => {
      root.render(<UsersList client={client} id={7} onReveal={onReveal} />);
      await Promise.resolve();
    });
  };

  const header = (): HTMLElement => {
    const found = container.querySelector<HTMLElement>('div');
    if (found === null) throw new Error('no header');
    return found;
  };

  const open = async (): Promise<void> => {
    await act(async () => {
      header().click();
      await Promise.resolve();
    });
  };

  const rows = (): HTMLButtonElement[] => [...container.querySelectorAll('button')];

  /** A walk of the whole scene, and nobody is looking at it yet. */
  it('asks the page for nothing while it is folded', async () => {
    await show();

    expect(call).not.toHaveBeenCalled();
  });

  it('lists the nodes drawing the texture once it is opened', async () => {
    await show();
    await open();

    expect(call).toHaveBeenCalledWith('assets.users', { id: 7 });
    expect(rows().map((row) => row.textContent)).toEqual(['hero#12', 'Sprite#31']);
  });

  /** The whole point of the section: a page nothing draws from is dead weight. */
  it('says plainly when nothing in the scene is drawing it', async () => {
    call.mockResolvedValue({ rev: 1, data: [] });

    await show();
    await open();

    expect(container.textContent).toContain('Nothing in the scene is drawing this.');
  });

  it('does not call a texture unused before the page has answered', async () => {
    call.mockReturnValue(new Promise(() => undefined));

    await show();
    await open();

    expect(container.textContent).toContain('Looking…');
    expect(container.textContent).not.toContain('Nothing in the scene');
  });

  it('hands a node up to be revealed in the Scene tab', async () => {
    await show();
    await open();

    act(() => {
      rows()[0]?.click();
    });

    expect(onReveal).toHaveBeenCalledWith(12);
  });
});
