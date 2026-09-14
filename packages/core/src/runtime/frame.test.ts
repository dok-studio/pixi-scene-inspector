import { describe, expect, it, vi } from 'vitest';

import { createFrameHook } from './frame.js';

/**
 * The render hook, and the counter that decides whether it exists at all
 * (docs/architecture.md §3.7).
 *
 * Only two things in this product need to run per frame — the overlay, and
 * scrubbing a Spine track while the scene is paused. Everything else works by
 * pull, which is why the Scene tab keeps working on a frozen scene. So the
 * proxy is installed when the first consumer appears and taken off when the
 * last one leaves; a page with the inspector open and the overlay off runs
 * exactly as it did without it.
 *
 * In the previous project seven hooks were imposed on every module whether they
 * had anything to do or not, and most of them were empty.
 */

function fakeRenderer() {
  const rendered: string[] = [];
  return {
    rendered,
    renderer: {
      render(what: string) {
        rendered.push(what);
      },
    },
  };
}

describe('frame hook', () => {
  it('leaves the renderer alone while nobody is watching', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;

    createFrameHook(() => renderer);

    expect(renderer.render).toBe(original);
  });

  it('wraps the renderer once a consumer appears', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;
    const hook = createFrameHook(() => renderer);

    hook.subscribe(() => {});

    expect(renderer.render).not.toBe(original);
  });

  it('calls the consumer after each render', () => {
    const { renderer } = fakeRenderer();
    const hook = createFrameHook(() => renderer);
    const seen = vi.fn();
    hook.subscribe(seen);

    renderer.render('a');
    renderer.render('b');

    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('still renders what it was asked to', () => {
    const { renderer, rendered } = fakeRenderer();
    const hook = createFrameHook(() => renderer);
    hook.subscribe(() => {});

    renderer.render('stage');

    expect(rendered).toEqual(['stage']);
  });

  it('puts the renderer back when the last consumer leaves', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;
    const hook = createFrameHook(() => renderer);

    const stop = hook.subscribe(() => {});
    stop();

    expect(renderer.render).toBe(original);
  });

  /**
   * A real renderer inherits `render` from its prototype. Assigning the
   * original back would leave an own property shadowing it — the function
   * behaves correctly, but the object no longer looks the way it was found,
   * and anything checking for the hook cannot tell it is gone.
   */
  it('leaves no own property behind on a renderer that inherited render', () => {
    class Renderer {
      render(): void {
        // the application's own
      }
    }
    const renderer = new Renderer();
    const hook = createFrameHook(() => renderer);

    const stop = hook.subscribe(() => {});
    stop();

    expect(Object.prototype.hasOwnProperty.call(renderer, 'render')).toBe(false);
    expect(hook.installed).toBe(false);
  });

  it('restores an own render that was there to begin with', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;
    const hook = createFrameHook(() => renderer);

    const stop = hook.subscribe(() => {});
    stop();

    expect(Object.prototype.hasOwnProperty.call(renderer, 'render')).toBe(true);
    expect(renderer.render).toBe(original);
  });

  it('keeps the proxy while another consumer is still there', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;
    const hook = createFrameHook(() => renderer);

    const first = hook.subscribe(() => {});
    hook.subscribe(() => {});
    first();

    expect(renderer.render).not.toBe(original);
  });

  it('serves every consumer', () => {
    const { renderer } = fakeRenderer();
    const hook = createFrameHook(() => renderer);
    const a = vi.fn();
    const b = vi.fn();
    hook.subscribe(a);
    hook.subscribe(b);

    renderer.render('stage');

    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('stops calling a consumer that left', () => {
    const { renderer } = fakeRenderer();
    const hook = createFrameHook(() => renderer);
    const gone = vi.fn();
    const stop = hook.subscribe(gone);
    hook.subscribe(() => {});

    stop();
    renderer.render('stage');

    expect(gone).not.toHaveBeenCalled();
  });

  it('ignores a consumer that unsubscribes twice', () => {
    const { renderer } = fakeRenderer();
    const original = renderer.render;
    const hook = createFrameHook(() => renderer);

    const stop = hook.subscribe(() => {});
    hook.subscribe(() => {});
    stop();
    stop();

    expect(renderer.render).not.toBe(original);
  });

  /**
   * A consumer that throws must not take the frame down with it: this proxy
   * sits in the middle of the inspected application's render loop.
   */
  it('renders the frame even when a consumer throws', () => {
    const { renderer, rendered } = fakeRenderer();
    const hook = createFrameHook(() => renderer);
    hook.subscribe(() => {
      throw new Error('overlay blew up');
    });
    const after = vi.fn();
    hook.subscribe(after);

    expect(() => {
      renderer.render('stage');
    }).not.toThrow();
    expect(rendered).toEqual(['stage']);
    expect(after).toHaveBeenCalledOnce();
  });

  /**
   * The page can be reloaded or the application swapped between two polls, so
   * the renderer the hook was installed on may no longer be the current one.
   */
  it('moves to a new renderer when the application is replaced', () => {
    const first = fakeRenderer();
    const second = fakeRenderer();
    let current = first.renderer;

    const hook = createFrameHook(() => current);
    const seen = vi.fn();
    hook.subscribe(seen);

    current = second.renderer;
    hook.refresh();

    second.renderer.render('stage');
    expect(seen).toHaveBeenCalledOnce();
  });

  it('leaves the replaced renderer as it found it', () => {
    const first = fakeRenderer();
    const second = fakeRenderer();
    const original = first.renderer.render;
    let current = first.renderer;

    const hook = createFrameHook(() => current);
    hook.subscribe(() => {});

    current = second.renderer;
    hook.refresh();

    expect(first.renderer.render).toBe(original);
  });

  it('survives having no renderer at all', () => {
    const hook = createFrameHook(() => null);

    expect(() => hook.subscribe(() => {})()).not.toThrow();
  });

  /**
   * How long the render took is measured here because here is the only place
   * that brackets the call. Beside the frame time it is what separates the
   * drawing from everything else in the frame.
   */
  it('tells a consumer how long the render it just watched took', () => {
    const spent: number[] = [];
    const renderer = {
      render() {
        // A render that takes a measurable amount of time.
        const until = performance.now() + 2;
        while (performance.now() < until) {
          /* busy */
        }
      },
    };

    const hook = createFrameHook(() => renderer);
    hook.subscribe((renderMs) => spent.push(renderMs));

    renderer.render();

    expect(spent).toHaveLength(1);
    expect(spent[0]).toBeGreaterThan(0);
  });

  /** The picker and the Spine scrub both need to force a frame on a still scene. */
  it('asks for a frame on demand', () => {
    const { renderer, rendered } = fakeRenderer();
    const hook = createFrameHook(() => renderer, () => 'stage');

    hook.requestFrame();

    expect(rendered).toEqual(['stage']);
  });
});
