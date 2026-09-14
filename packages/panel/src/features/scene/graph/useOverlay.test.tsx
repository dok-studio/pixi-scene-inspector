// @vitest-environment happy-dom
import type { CommandName, CommandResult } from '@scene-inspector/protocol';
import { DEFAULT_PICK_DEPTH, OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Client } from '../../../transport/client.js';
import { resetPickDepth, setPickDepth } from '../../settings/pickDepth.js';
import type { OverlayControls } from './useOverlay.js';
import { useOverlay } from './useOverlay.js';

/**
 * Which switches the overlay comes up with, and that it comes up with the same
 * ones every time.
 *
 * Both change what the inspected page draws, so neither is remembered: a panel
 * that reopened with the picker still armed would swallow the next click on the
 * application, with nothing on screen to explain why.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

/** What the poll last asked the page for, so the switches can be seen leaving. */
let sent: Record<string, unknown> | null = null;

/** What the page answers the next poll with: every node under the last click. */
let picked: number[] = [];

const client: Client = {
  call<K extends CommandName>(_command: K, params: unknown): Promise<CommandResult<K>> {
    sent = params as Record<string, unknown>;
    return Promise.resolve({ picked } as CommandResult<K>);
  },
  send(cmd, params) {
    void client.call(cmd, params);
  },
};

/** One pinned node, so the poll can be seen carrying it. */
const PINS = [{ id: 7, label: 'hero (Sprite)' }];

let container: HTMLDivElement;
let root: Root;
let controls: OverlayControls | null = null;
/** Every stack the hook has reported since the panel was mounted. */
let reported: (readonly number[])[] = [];

function Probe() {
  controls = useOverlay(
    client,
    null,
    (ids) => {
      reported.push(ids);
    },
    OVERLAY_STYLE_DEFAULTS,
    PINS,
  );
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  controls = null;
  picked = [];
  reported = [];
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
  // A module the whole panel shares: what a test set must not outlive it.
  resetPickDepth();
});

async function mount(): Promise<void> {
  await act(async () => {
    root.render(<Probe />);
  });
}

describe('useOverlay', () => {
  it('starts with the highlight on and the picker off', async () => {
    await mount();

    expect(controls?.highlight).toBe(true);
    expect(controls?.picker).toBe(false);
  });

  /**
   * The frame edits the scene, so it starts off and is never remembered — the
   * same promise the picker keeps, for a stronger reason: a panel that reopened
   * armed would answer the next press on the game with a move nobody asked for.
   */
  it('starts with the free transform off', async () => {
    await mount();

    expect(controls?.transform).toBe(false);
  });

  it('carries the frame to the page once it is armed', async () => {
    await mount();
    await act(async () => {
      controls?.setTransform(true);
    });

    // On the next tick rather than at once: the switch is read inside the loop
    // so that a change never restarts the timer — see the hook.
    await vi.waitFor(() => {
      expect(sent?.['transform']).toBe(true);
    });
  });

  /**
   * One press on the canvas cannot mean "select this" and "drag this" at once,
   * so the two switches are one tool between them.
   */
  it('puts the picker away when the frame is armed, and the other way round', async () => {
    await mount();
    await act(async () => {
      controls?.setPicker(true);
    });
    expect(controls?.picker).toBe(true);

    await act(async () => {
      controls?.setTransform(true);
    });
    expect(controls?.transform).toBe(true);
    expect(controls?.picker).toBe(false);

    await act(async () => {
      controls?.setPicker(true);
    });
    expect(controls?.picker).toBe(true);
    expect(controls?.transform).toBe(false);
  });

  it('does not carry either switch over to the next run', async () => {
    await mount();
    await act(async () => {
      controls?.setPicker(true);
      controls?.setHighlight(false);
    });
    expect(controls?.picker).toBe(true);
    expect(controls?.highlight).toBe(false);

    // A fresh panel over the same page: nothing of the old one survives.
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mount();

    expect(controls?.highlight).toBe(true);
    expect(controls?.picker).toBe(false);
  });

  /**
   * Nothing stored yet: a panel opening where it has never run before shows the
   * whole overlay, which is the same promise the page keeps for a caller that
   * names neither field.
   */
  it('opens with the wrap box on and the whole gizmo drawn', async () => {
    await mount();

    expect(controls?.wrapBox).toBe(true);
    expect(controls?.axes).toBe('arrows');
  });

  /**
   * These two *are* carried over, unlike the highlight and the picker above.
   * How much of the overlay to draw is a preference someone arrives at once,
   * and a DevTools panel is torn down and rebuilt constantly — re-entering it
   * on every reopen is the failure this asserts against.
   */
  it('carries the wrap box and the gizmo mode over to the next run', async () => {
    await mount();
    await act(async () => {
      controls?.setWrapBox(false);
      controls?.setAxes('origin');
    });

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mount();

    expect(controls?.wrapBox).toBe(false);
    expect(controls?.axes).toBe('origin');
  });

  /**
   * The pick rides back on the poll — there is no push channel for one — and it
   * is the whole stack under the click, not the node on top: what is underneath
   * is offered as a list beside the tree.
   */
  it('reports every node the pick found', async () => {
    picked = [4, 3];
    await mount();

    expect(reported).toEqual([[4, 3]]);
  });

  /** An empty answer means "nothing picked since you last asked", not a pick. */
  it('reports nothing when the page has no pick to hand over', async () => {
    await mount();

    expect(reported).toEqual([]);
  });

  /**
   * All four travel in the one exchange the overlay has. A switch the panel
   * holds but never sends is a switch that does nothing, and that is the whole
   * failure this asserts against.
   */
  it('sends every switch to the page on the poll', async () => {
    await mount();

    expect(sent).toMatchObject({
      highlight: true,
      picker: false,
      wrapBox: true,
      axes: 'arrows',
      transform: false,
      pinned: PINS,
      pickDepth: DEFAULT_PICK_DEPTH,
    });
  });

  /**
   * How far a click digs is a setting rather than a number in the page, so it
   * has to leave with the poll like everything else the overlay is told.
   */
  it('sends the picker depth the settings are on', async () => {
    setPickDepth(40);
    await mount();

    expect(sent).toMatchObject({ pickDepth: 40 });
  });
});
