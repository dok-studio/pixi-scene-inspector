/**
 * Alt-drag on a number field: an unbounded horizontal scrub.
 *
 * Ported from the previous project essentially unchanged, because the design is
 * the answer to a constraint rather than a preference. Pointer Lock is what
 * makes a scrub unbounded — the cursor disappears and `movementX` keeps
 * arriving even once the mouse is against the edge of the screen. **A DevTools
 * panel does not get it**: the panel is a cross-origin iframe that Chrome does
 * not grant the `pointer-lock` permissions policy (`requestPointerLock`
 * rejects; `document.featurePolicy.allowsFeature('pointer-lock')` is false),
 * and the iframe's attributes are Chrome's, so an extension cannot turn it on.
 *
 * So the unboundedness is built from three layers instead:
 *
 *  1. **pointer lock** where it is granted — the playground, any top-level page;
 *  2. **pointer capture**, so movement is not lost outside the panel;
 *  3. **edge velocity** — once the cursor is against the edge of the screen the
 *     value keeps travelling on its own, the way autoscroll does.
 */

interface ScrubDragOptions {
  /** Accumulated horizontal offset in pixels since the drag started. */
  onMove: (totalDeltaX: number, event: PointerEvent) => void;
  /** `cancelled` when the drag was aborted — Escape, or the lock being lost. */
  onEnd?: (cancelled: boolean) => void;
}

type LockElement = Element & {
  requestPointerLock(options?: { unadjustedMovement?: boolean }): Promise<void> | void;
};

/** Constant travel speed at the screen edge, px/s. Drag modifiers apply here too. */
const EDGE_SPEED = 100;

async function requestPointerLockSafe(target: LockElement): Promise<void> {
  const attempt = async (options?: { unadjustedMovement?: boolean }): Promise<boolean> => {
    try {
      await target.requestPointerLock(options);
    } catch {
      // Denied — expected inside the DevTools panel, see the note above.
    }
    return document.pointerLockElement === target;
  };

  // `unadjustedMovement` switches off the system's mouse acceleration, which is
  // what makes the step even.
  if (await attempt({ unadjustedMovement: true })) return;
  await attempt();
}

/** Screen bounds in CSS pixels, in `screenX` space. */
function screenBounds(): { left: number; right: number } {
  const s = screen as Screen & { availLeft?: number };
  const left = s.availLeft ?? 0;
  return { left, right: left + screen.availWidth };
}

export function startScrubDrag(
  target: Element,
  pointerId: number,
  { onMove, onEnd }: ScrubDragOptions,
): void {
  let totalDeltaX = 0;
  let finished = false;
  let lockAcquired = false;

  let edgeDir: -1 | 0 | 1 = 0;
  let edgeFrame: number | null = null;
  let edgePrevTs = 0;
  let lastEvent: PointerEvent | null = null;

  document.body.dataset['scrubbing'] = 'true';

  try {
    target.setPointerCapture(pointerId);
  } catch {
    // The pointer was already released.
  }

  const stopEdge = (): void => {
    if (edgeFrame !== null) cancelAnimationFrame(edgeFrame);
    edgeFrame = null;
    edgeDir = 0;
  };

  const edgeTick = (ts: number): void => {
    if (finished || edgeDir === 0 || lastEvent === null) return;

    const dt = edgePrevTs === 0 ? 0 : (ts - edgePrevTs) / 1000;
    edgePrevTs = ts;

    totalDeltaX += edgeDir * EDGE_SPEED * dt;
    onMove(totalDeltaX, lastEvent);

    edgeFrame = requestAnimationFrame(edgeTick);
  };

  /**
   * The cursor is against the edge of the screen: the OS stops moving it, so no
   * more `pointermove` arrives and `movementX` sits at zero. Carry on manually.
   */
  const updateEdge = (event: PointerEvent): void => {
    // Under pointer lock there is no cursor, and therefore no edge.
    if (document.pointerLockElement === target) {
      stopEdge();
      return;
    }

    const { left, right } = screenBounds();
    const dir: -1 | 0 | 1 =
      event.screenX <= left + 1 ? -1 : event.screenX >= right - 2 ? 1 : 0;

    if (dir === edgeDir) return;

    stopEdge();
    if (dir === 0) return;

    edgeDir = dir;
    edgePrevTs = 0;
    edgeFrame = requestAnimationFrame(edgeTick);
  };

  const finish = (cancelled: boolean): void => {
    if (finished) return;
    finished = true;

    stopEdge();

    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    window.removeEventListener('pointercancel', handleUp);
    document.removeEventListener('pointerlockchange', handleLockChange);

    delete document.body.dataset['scrubbing'];

    try {
      target.releasePointerCapture(pointerId);
    } catch {
      // Capture was already released.
    }

    if (document.pointerLockElement === target) document.exitPointerLock();

    onEnd?.(cancelled);
  };

  const handleMove = (event: PointerEvent): void => {
    lastEvent = event;
    totalDeltaX += event.movementX;
    updateEdge(event);
    onMove(totalDeltaX, event);
  };

  const handleUp = (): void => {
    finish(false);
  };

  const handleLockChange = (): void => {
    if (document.pointerLockElement === target) {
      lockAcquired = true;
      stopEdge();
      return;
    }

    // The lock was held and is gone — Escape, or a tab switch. Cancel the drag.
    if (lockAcquired) finish(true);
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', handleUp);
  window.addEventListener('pointercancel', handleUp);
  document.addEventListener('pointerlockchange', handleLockChange);

  void requestPointerLockSafe(target as LockElement).then(() => {
    // The button was released before the lock was granted: drop it again.
    if (finished && document.pointerLockElement === target) document.exitPointerLock();
  });
}
