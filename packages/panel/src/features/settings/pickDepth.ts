import { DEFAULT_PICK_DEPTH, MAX_PICK_DEPTH } from '@scene-inspector/protocol';
import { useSyncExternalStore } from 'react';

/**
 * How far one picker click digs.
 *
 * The picker takes the whole stack under a point by asking the page's hit test,
 * switching off what came back and asking again — and what is not drawn there
 * is dug past rather than reported (`adapters/picking.ts`). So this is a budget
 * on **questions**: a node behind three hidden layers costs four of them, and a
 * screen built over a stack of dead UI can cost a great many more.
 *
 * It is a setting rather than a number in the source because only the game
 * knows how deep its own stack is, and the cost is real: every ask walks the
 * scene once, synchronously, inside the page's own click handler. The default
 * reaches anything a hand-built screen puts under a pixel; raising it is for
 * the screen that turned out to have more, and the ceiling is there because
 * this runs in someone else's frame.
 *
 * **A module rather than a prop**, for the same reason as `pollRate.ts`: it is
 * read by the overlay's own poll, deep in the Scene tab, and edited by the gear
 * in the navbar, and neither is above the other in any useful sense.
 */

const KEY = 'panel.pickDepth';

export function clampDepth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PICK_DEPTH;
  return Math.min(MAX_PICK_DEPTH, Math.max(1, Math.round(value)));
}

function stored(): number {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return typeof saved === 'number' && Number.isFinite(saved)
      ? clampDepth(saved)
      : DEFAULT_PICK_DEPTH;
  } catch {
    // Unreadable, not JSON, or no storage at all: treated as unset rather than
    // as a reason to fail to render.
    return DEFAULT_PICK_DEPTH;
  }
}

let depth: number = stored();

const listeners = new Set<() => void>();

export function pickDepth(): number {
  return depth;
}

export function setPickDepth(next: number): void {
  const clamped = clampDepth(next);
  if (clamped === depth) return;

  depth = clamped;
  try {
    localStorage.setItem(KEY, JSON.stringify(clamped));
  } catch {
    // A browser that refuses storage still gets the setting for this session.
  }

  for (const notify of [...listeners]) notify();
}

export function resetPickDepth(): void {
  setPickDepth(DEFAULT_PICK_DEPTH);
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);

  return () => {
    listeners.delete(notify);
  };
}

export function usePickDepth(): number {
  return useSyncExternalStore(subscribe, pickDepth, pickDepth);
}
