// @vitest-environment happy-dom
import type { CommandName, CommandResult, NodeId, SpineEvent } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../../../transport/client.js';
import { EventLog } from './EventLog.js';

/**
 * The log, and the one thing done with it besides reading.
 *
 * Copying is why the log is worth having at all past the glance: what goes into
 * a bug report is the lines, and retyping a named event's values off a panel
 * this narrow is not something anyone does twice. So the text it hands over is
 * checked here — the columns on screen, tab-separated.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const ENTRIES: SpineEvent[] = [
  { seq: 1, kind: 'start', track: 0, animation: 'walk', time: 0 },
  {
    seq: 2,
    kind: 'event',
    track: 1,
    animation: 'walk',
    time: 0.5,
    name: 'change_bg',
    intValue: 3,
    stringValue: 'left',
  },
];

function fakeClient(entries: SpineEvent[]): Client {
  return {
    call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
      if (cmd === 'spine.events') {
        return Promise.resolve({
          entries,
          dropped: 0,
          cursor: entries.length,
        } as CommandResult<K>);
      }

      return Promise.resolve(undefined as CommandResult<K>);
    },
    send() {
      // The capture flag; nothing here reads it back.
    },
  };
}

describe('EventLog', () => {
  let container: HTMLElement;
  let root: Root;
  let written: string[];

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    written = [];

    // happy-dom has no clipboard, and a real one would be the browser's answer
    // rather than the panel's anyway.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn((text: string) => {
          written.push(text);
          return Promise.resolve();
        }),
      },
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const show = async (entries: SpineEvent[]): Promise<void> => {
    await act(async () => {
      root.render(<EventLog client={fakeClient(entries)} id={1 as NodeId} />);
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  const copy = (): void => {
    const button = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy the log to the clipboard"]',
    );
    if (button === null) throw new Error('No copy button');

    act(() => {
      button.click();
    });
  };

  it('hands over the lines as they are drawn, tab-separated', async () => {
    await show(ENTRIES);

    copy();

    expect(written).toEqual(['0\t#0\tstart\twalk\n0.5\t#1\tevent\tchange_bg (int 3, "left")']);
  });

  /** Nothing to copy is not an error, and a button that does nothing is worse. */
  it('offers nothing to copy while the log is empty', async () => {
    await show([]);

    const button = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy the log to the clipboard"]',
    );

    expect(button?.disabled).toBe(true);
  });
});
