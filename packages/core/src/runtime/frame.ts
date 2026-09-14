/**
 * The render hook — installed only while something needs a frame
 * (docs/architecture.md §3.7).
 *
 * Two things in this product run per frame: the overlay, which has to follow a
 * moving scene, and scrubbing a Spine track while the scene is paused.
 * Everything else works by pull, which is exactly why the Scene tab keeps
 * working on a frozen scene that is not rendering at all.
 *
 * So the proxy goes on when the first consumer appears and comes off when the
 * last one leaves. With the inspector open and the overlay off, the inspected
 * application renders through its own function, untouched.
 *
 * In the previous project a handler imposed seven hooks on every module whether
 * it had anything to do or not, and within Scene and Assets almost all of them
 * were empty.
 */

type RenderFn = (...args: unknown[]) => unknown;

interface RendererLike {
  render: RenderFn;
}

/**
 * @param renderMs how long the render that just finished took.
 *
 * Measured here because here is the only place that brackets the call. A
 * consumer with nothing to do with the number ignores it — a zero-argument
 * function is assignable to this, so the overlay needed no change.
 */
export type FrameConsumer = (renderMs: number) => void;

export interface FrameHook {
  /** @returns a function that removes this consumer. Safe to call twice. */
  subscribe(consumer: FrameConsumer): () => void;
  /**
   * Re-checks which renderer is current, moving the proxy if the application
   * was swapped or the page reloaded between polls.
   */
  refresh(): void;
  /** Draws one frame, for a scene that is not rendering on its own. */
  requestFrame(): void;
  /** Whether the proxy is currently installed. Diagnostics only. */
  readonly installed: boolean;
}

/**
 * @param currentRenderer looked up on demand rather than captured, because
 * detection is deliberately not cached and the renderer can be replaced.
 * @param currentStage what to draw when a frame is requested by hand.
 */
export function createFrameHook(
  currentRenderer: () => unknown,
  currentStage: () => unknown = () => undefined,
): FrameHook {
  const consumers = new Set<FrameConsumer>();

  let hooked: RendererLike | null = null;
  let original: RenderFn | null = null;
  /**
   * Whether `render` was the renderer's own property before the hook.
   *
   * A real renderer inherits it from its prototype. Assigning the original back
   * would work, but it would leave an own property shadowing the prototype —
   * the object would no longer be the one the application handed over, and
   * anything looking for the hook could not tell it had gone.
   */
  let wasOwnProperty = false;

  const asRenderer = (value: unknown): RendererLike | null => {
    if (typeof value !== 'object' || value === null) return null;
    return typeof (value as RendererLike).render === 'function' ? (value as RendererLike) : null;
  };

  const uninstall = (): void => {
    if (hooked === null || original === null) return;

    if (wasOwnProperty) hooked.render = original;
    else delete (hooked as Partial<RendererLike>).render;

    hooked = null;
    original = null;
  };

  const install = (): void => {
    const renderer = asRenderer(currentRenderer());
    if (renderer === null || renderer === hooked) return;

    uninstall();

    const own = renderer.render.bind(renderer) as RenderFn;
    hooked = renderer;
    original = renderer.render;
    wasOwnProperty = Object.prototype.hasOwnProperty.call(renderer, 'render');

    renderer.render = function proxied(...args: unknown[]): unknown {
      const at = performance.now();
      const result = own(...args);
      const spent = performance.now() - at;

      for (const consumer of [...consumers]) {
        try {
          consumer(spent);
        } catch {
          // This sits inside the inspected application's render loop. A
          // consumer that throws loses its turn, not the frame.
        }
      }

      return result;
    } as RenderFn;
  };

  const sync = (): void => {
    if (consumers.size === 0) uninstall();
    else install();
  };

  return {
    subscribe(consumer) {
      consumers.add(consumer);
      sync();

      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        consumers.delete(consumer);
        sync();
      };
    },

    refresh: sync,

    requestFrame() {
      const renderer = asRenderer(currentRenderer());
      const stage = currentStage();
      if (renderer === null || stage === undefined) return;

      renderer.render(stage);
    },

    get installed() {
      return hooked !== null;
    },
  };
}
