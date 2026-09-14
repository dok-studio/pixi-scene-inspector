// @vitest-environment happy-dom
import { OVERLAY_STYLE_DEFAULTS } from '@scene-inspector/protocol';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { OverlayStyleControls } from './overlayStyle.js';
import { useOverlayStyle } from './overlayStyle.js';

/**
 * How the overlay is painted, as the panel remembers it.
 *
 * Two things are worth holding still here and neither is about colour: that a
 * setting survives the panel being closed, and that a stored object written
 * before a setting existed does not leave that setting undefined — which is not
 * an error anywhere, only a frame that quietly stops being drawn.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let container: HTMLDivElement;
let root: Root;
let controls: OverlayStyleControls | null = null;

function Probe() {
  controls = useOverlayStyle();
  return null;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  controls = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  localStorage.clear();
});

async function mount(): Promise<void> {
  await act(async () => {
    root.render(<Probe />);
  });
}

/** A fresh panel over the same browser, which is what a reopened drawer is. */
async function remount(): Promise<void> {
  await act(async () => {
    root.unmount();
  });
  root = createRoot(container);
  await mount();
}

describe('useOverlayStyle', () => {
  it('starts at the defaults the page draws with when the panel says nothing', async () => {
    await mount();

    expect(controls?.style).toEqual(OVERLAY_STYLE_DEFAULTS);
  });

  it('writes one field without disturbing the rest of its group', async () => {
    await mount();
    await act(async () => {
      controls?.set('selected.fill', '#123456');
    });

    expect(controls?.style.selected.fill).toBe('#123456');
    expect(controls?.style.selected.fillOpacity).toBe(OVERLAY_STYLE_DEFAULTS.selected.fillOpacity);
    expect(controls?.style.hover).toEqual(OVERLAY_STYLE_DEFAULTS.hover);
  });

  it('carries a colour over to the next run', async () => {
    await mount();
    await act(async () => {
      controls?.set('wrapBox.strokeWidth', 9);
    });

    await remount();

    expect(controls?.style.wrapBox.strokeWidth).toBe(9);
  });

  it('goes back to the defaults, and stays there', async () => {
    await mount();
    await act(async () => {
      controls?.set('selected.fill', '#123456');
      controls?.reset();
    });

    expect(controls?.style).toEqual(OVERLAY_STYLE_DEFAULTS);

    await remount();
    expect(controls?.style).toEqual(OVERLAY_STYLE_DEFAULTS);
  });

  /**
   * The reason the stored object is spread over the defaults rather than
   * trusted: settings gain fields, and what is in storage was written on the
   * day it was written.
   */
  it('fills in a setting the stored object was written before', async () => {
    localStorage.setItem(
      'scene.overlay.style',
      JSON.stringify({ selected: { fill: '#123456' }, hover: {}, wrapBox: {} }),
    );

    await mount();

    expect(controls?.style.selected.fill).toBe('#123456');
    expect(controls?.style.selected.strokeWidth).toBe(OVERLAY_STYLE_DEFAULTS.selected.strokeWidth);
    expect(controls?.style.wrapBox).toEqual(OVERLAY_STYLE_DEFAULTS.wrapBox);
  });

  /** Nothing may put a string where a width goes and leave the overlay undrawable. */
  it('drops a write that names no setting, and one of the wrong shape', async () => {
    await mount();
    await act(async () => {
      controls?.set('selected.nonsense', '#123456');
      controls?.set('nonsense.fill', '#123456');
      controls?.set('selected.strokeWidth', true);
    });

    expect(controls?.style).toEqual(OVERLAY_STYLE_DEFAULTS);
  });
});
