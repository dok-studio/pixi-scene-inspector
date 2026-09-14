// @vitest-environment happy-dom
import type { CommandName, CommandResult } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Client } from '../../../../transport/client.js';
import { StyleSnippetSection } from './StyleSnippetSection.js';

/**
 * The section that decides whether it exists.
 *
 * Being a patched text is a property of the node while the schema is keyed by
 * type, so the page answers with an empty string for everything else and this
 * component is what turns that into "no section" — which is the one piece of
 * behaviour here worth rendering to check.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const SNIPPET = 'style: {\n    fontSize: 28\n}';

function clientWith(snippet: string): Client {
  const client: Client = {
    call<K extends CommandName>(cmd: K): Promise<CommandResult<K>> {
      if (cmd === 'text.styleSnippet') {
        return Promise.resolve({ rev: 1, data: snippet } as CommandResult<K>);
      }

      return Promise.resolve(undefined as CommandResult<K>);
    },
    send(cmd, params) {
      void client.call(cmd, params);
    },
  };

  return client;
}

describe('StyleSnippetSection', () => {
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

  const show = async (client: Client): Promise<void> => {
    await act(async () => {
      root.render(<StyleSnippetSection client={client} id={1} title="Style" />);
      await Promise.resolve();
    });
  };

  const area = (): HTMLTextAreaElement => {
    const found = container.querySelector('textarea');
    if (found === null) throw new Error('No snippet');
    return found;
  };

  it('draws nothing for a node the page has no snippet for', async () => {
    await show(clientWith(''));

    expect(container.textContent).toBe('');
  });

  it('shows the snippet under a header of its own', async () => {
    await show(clientWith(SNIPPET));

    expect(container.textContent).toContain('Style');
    expect(area().value).toBe(SNIPPET);
  });

  it('refuses to be edited, without refusing to be selected', async () => {
    await show(clientWith(SNIPPET));

    expect(area().readOnly).toBe(true);
    expect(area().disabled).toBe(false);
  });

  it('copies the whole snippet, and leaves the section open', async () => {
    await show(clientWith(SNIPPET));

    const button = container.querySelector<HTMLButtonElement>('button[aria-label^="Copy the style"]');
    act(() => {
      button?.click();
    });

    expect(written).toEqual([SNIPPET]);

    // The button sits inside the header, and the header is a fold: copying must
    // not close what was copied.
    expect(container.querySelector('textarea')).not.toBeNull();
  });
});
