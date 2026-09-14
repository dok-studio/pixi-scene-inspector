// @vitest-environment happy-dom
import type { TextureFrame } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { FrameList } from './FrameList.js';

/**
 * The regions cut out of a sheet — and, as much as anything, the rule that
 * nobody pays for them until they are asked for: finding them means walking a
 * source's listeners or the whole texture cache in the page.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const FRAMES: TextureFrame[] = [
  { name: 'hero_idle_01', x: 0, y: 0, width: 32, height: 32 },
  { name: '', x: 32, y: 0, width: 32, height: 48 },
];

describe('FrameList', () => {
  let container: HTMLElement;
  let root: Root;
  const call = vi.fn();
  const onHover = vi.fn();
  const client = { call } as unknown as Client;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    call.mockReset();
    call.mockResolvedValue({ rev: 1, data: FRAMES });
    onHover.mockClear();
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
      root.render(<FrameList client={client} id={7} onHover={onHover} />);
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

  const rows = (): HTMLElement[] => [
    ...container.querySelectorAll<HTMLElement>('div[class*="hover:bg-accent"]'),
  ];

  /** Finding these means a walk in the page; a folded section must not cost one. */
  it('asks the page for nothing while it is folded', async () => {
    await show();

    expect(call).not.toHaveBeenCalled();
    expect(rows()).toEqual([]);
  });

  /** An empty list is a claim about the texture, and it has not been made yet. */
  it('does not call a texture frameless before the page has answered', async () => {
    call.mockReturnValue(new Promise(() => undefined));

    await show();
    await open();

    expect(container.textContent).toContain('Looking…');
    expect(container.textContent).not.toContain('Nothing was cut out');
  });

  it('lists the regions once it is opened', async () => {
    await show();
    await open();

    expect(call).toHaveBeenCalledWith('assets.frames', { id: 7 });
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.textContent).toContain('hero_idle_01');
    expect(rows()[0]?.textContent).toContain('32×32');
    expect(rows()[0]?.textContent).toContain('@0,0');
  });

  /** A region nobody named still has a rectangle, which is what it is here for. */
  it('shows an unnamed region rather than dropping it', async () => {
    await show();
    await open();

    expect(rows()[1]?.textContent).toContain('unnamed');
    expect(rows()[1]?.textContent).toContain('32×48');
  });

  it('hands the preview above whichever region the pointer is over', async () => {
    await show();
    await open();

    act(() => {
      rows()[0]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    expect(onHover).toHaveBeenCalledWith(FRAMES[0]);
  });

  /** A standalone texture is the ordinary case, and it is not a failure. */
  it('says so when nothing was cut out of the texture', async () => {
    call.mockResolvedValue({ rev: 1, data: [] });

    await show();
    await open();

    expect(container.textContent).toContain('Nothing was cut out of this texture.');
  });

  it('stops outlining anything when it is folded again', async () => {
    await show();
    await open();
    onHover.mockClear();

    await act(async () => {
      header().click();
      await Promise.resolve();
    });

    expect(onHover).toHaveBeenCalledWith(null);
  });
});
