/**
 * Counting what the renderer submits to the GPU.
 *
 * **The count is taken at the context, not at a PixiJS system**, and that is the
 * whole of the design. `gl.drawElements` and its neighbours *are* the draw call;
 * every layer above them — the batcher, the graphics adaptor, the encoder, the
 * geometry system — is a route to one, and the routes differ by version, by
 * backend, and by what the scene happens to contain. Counting at the bottom
 * makes the question "how many submissions" instead of "which of this release's
 * systems is on the path", and the second question has already been answered
 * wrongly once: a counter on v8's `encoder.draw` never saw a batched sprite,
 * because the batcher goes straight to the geometry system.
 *
 * So: v6, v7 and v8-on-WebGL are all `renderer.gl`, one target and no version in
 * it at all. WebGPU has no context to hook — the encoder system is where a
 * submission is decided there, and it is the only place a version-shaped guess
 * still has to be made.
 *
 * **The count is monotonic.** The previous project read its counter by zeroing
 * it (`captureRenderingData()`), so two pollers stole each other's frames and it
 * only worked because one tab was mounted at a time. Here the total only ever
 * goes up and whoever is watching takes the difference — any number of readers,
 * no coordination.
 *
 * Installed state cannot live on the adapter: `session.adapter()` builds a new
 * one on every call. It lives in the module, keyed by the renderer object, so a
 * second `counterFor` joins the wraps already there rather than doubling them —
 * which is what the previous project's `__devtoolDrawHooked` flag was for.
 */

interface Installed {
  count: number;
  /**
   * What the wraps went on — a GL context, or an encoder system.
   *
   * Remembered so that a context which has been replaced can be noticed. A lost
   * and restored WebGL context is a **new object**, and a counter still holding
   * the old one would go quiet without saying so.
   */
  host: object;
  /** Undoes every wrap this entry put on. */
  restore: () => void;
}

const installed = new WeakMap<object, Installed>();

export interface DrawCounter {
  /** Draw submissions since the wrap went on. Never resets. */
  total(): number;
  /**
   * Puts back the draw functions this counter reads, and stops counting.
   *
   * On the counter rather than only on the renderer, because a caller that has
   * finished with one is rarely still holding the renderer it came from: by the
   * time the panel stops reading, the page may have swapped its renderer or
   * dropped it altogether, and asking the adapter again then either releases
   * the wrong object or answers nothing at all — leaving a wrap on the page's
   * context with nobody reading the count.
   *
   * Releasing twice, or after the host was replaced, does nothing.
   */
  release(): void;
}

/**
 * Every way a WebGL context is asked to draw.
 *
 * Instanced draws are separate entry points rather than a flag, so they have to
 * be named. On a WebGL1 context that reaches them through the ANGLE extension
 * they live on the extension object instead and are not counted — a known edge,
 * and a narrow one: PixiJS asks for a WebGL2 context first.
 */
const GL_DRAWS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'];

/**
 * Replaces a method, remembering enough to put the object back exactly as it
 * was — by value if the method was the object's own, by `delete` if it came
 * from the prototype.
 *
 * The distinction is the same one `runtime/frame.ts` makes, and for the same
 * reason: assigning a prototype method back leaves an own property shadowing
 * it, so the object is no longer the one the application handed over. A context
 * method is always inherited, so the `delete` branch is the ordinary case here.
 *
 * @returns a function that puts it back, or null if there was nothing to wrap.
 */
function wrap(host: object, key: string, onCall: () => void): (() => void) | null {
  const target = host as Record<string, unknown>;
  const original = target[key];
  if (typeof original !== 'function') return null;

  const own = Object.prototype.hasOwnProperty.call(host, key);
  const call = original as (...args: unknown[]) => unknown;

  target[key] = function counted(this: unknown, ...args: unknown[]): unknown {
    onCall();
    // Called on the receiver rather than on a bound copy: a context method
    // refuses to run against anything but its own context.
    return call.apply(this, args);
  };

  return () => {
    if (own) target[key] = original;
    else delete target[key];
  };
}

/** Where this renderer submits, and by which names. */
function drawHost(renderer: Record<string, unknown>): { object: object; keys: string[] } | null {
  const gl = renderer['gl'];
  if (typeof gl === 'object' && gl !== null) {
    const context = gl as Record<string, unknown>;
    const keys = GL_DRAWS.filter((key) => typeof context[key] === 'function');

    if (keys.length > 0) return { object: gl as object, keys };
  }

  // WebGPU. `GpuEncoderSystem.draw` is where the `drawIndexed` is issued, and
  // there is no context underneath it to count at instead.
  const encoder = renderer['encoder'];
  if (typeof encoder === 'object' && encoder !== null) {
    if (typeof (encoder as Record<string, unknown>)['draw'] === 'function') {
      return { object: encoder as object, keys: ['draw'] };
    }
  }

  return null;
}

/**
 * The counter for this renderer, wrapping its draw path if nothing has yet.
 *
 * @returns null on a renderer with neither a context nor an encoder — a canvas
 * renderer, say. The panel is told so and reports no reading rather than a
 * flat zero, which would be a claim that the scene draws nothing.
 */
export function counterFor(renderer: unknown): DrawCounter | null {
  if (typeof renderer !== 'object' || renderer === null) return null;

  const found = drawHost(renderer as Record<string, unknown>);
  const existing = installed.get(renderer);

  if (existing !== undefined) {
    if (found !== null && existing.host === found.object) {
      return {
        total: () => existing.count,
        release: () => {
          drop(renderer, existing);
        },
      };
    }

    // The context was replaced — lost and restored, or a backend swapped. What
    // is wrapped is an object nothing calls any more, so it comes off and the
    // new one is wrapped instead, rather than the count quietly stopping.
    existing.restore();
    installed.delete(renderer);
  }

  if (found === null) return null;

  const entry: Installed = { count: 0, host: found.object, restore: () => undefined };

  const undo = found.keys
    .map((key) =>
      wrap(found.object, key, () => {
        entry.count += 1;
      }),
    )
    .filter((one): one is () => void => one !== null);

  if (undo.length === 0) return null;

  entry.restore = () => {
    for (const one of undo.reverse()) one();
  };
  installed.set(renderer, entry);

  return {
    total: () => entry.count,
    release: () => {
      drop(renderer, entry);
    },
  };
}

/**
 * Takes one entry off, if it is still the one that is on.
 *
 * The check is what makes a release idempotent: a counter whose host was
 * replaced has already been restored by `counterFor`, and undoing a wrap twice
 * would put back a method the newer entry is counting through.
 */
function drop(renderer: object, entry: Installed): void {
  if (installed.get(renderer) !== entry) return;

  entry.restore();
  installed.delete(renderer);
}

/** Puts this renderer's draw functions back, if they were ever wrapped. */
export function releaseCounter(renderer: unknown): void {
  if (typeof renderer !== 'object' || renderer === null) return;

  const entry = installed.get(renderer);
  if (entry === undefined) return;

  drop(renderer, entry);
}
