import { describe, expect, it } from 'vitest';

import type { NodeRef, RefFactory } from './registry.js';
import { createRegistry } from './registry.js';

/**
 * The registry is the only thing that knows which node an id refers to. Two
 * properties matter, and both are easy to lose:
 *
 *  - an id stays with its node for as long as the node lives, so the panel's
 *    selection and expansion survive a poll;
 *  - holding an id does **not** keep the node alive, so an inspector left open
 *    on a page that churns nodes is not a leak.
 */
describe('registry', () => {
  it('gives a node the same id every time', () => {
    const registry = createRegistry();
    const node = {};

    expect(registry.idOf(node)).toBe(registry.idOf(node));
  });

  it('gives different nodes different ids', () => {
    const registry = createRegistry();

    expect(registry.idOf({})).not.toBe(registry.idOf({}));
  });

  /** `0` means "no node" in the protocol — the stage reports it as its parent. */
  it('never hands out 0', () => {
    const registry = createRegistry();

    expect(registry.idOf({})).toBeGreaterThan(0);
  });

  it('resolves an id back to the node it was taken from', () => {
    const registry = createRegistry();
    const node = {};
    const id = registry.idOf(node);

    expect(registry.resolve(id)).toBe(node);
  });

  it('resolves an id it never issued to null', () => {
    expect(createRegistry().resolve(999)).toBeNull();
  });

  it('starts from scratch: two registries do not share a counter', () => {
    expect(createRegistry().idOf({})).toBe(createRegistry().idOf({}));
  });

  /**
   * Garbage collection cannot be forced from a test, so the weak reference is
   * injected instead. `release()` leaves exactly what the registry sees after a
   * real collection: an entry whose `deref()` returns nothing.
   */
  describe('collected nodes', () => {
    function releasableRefs(): { factory: RefFactory; releaseAll: () => void } {
      const released: Array<() => void> = [];

      const factory: RefFactory = (node) => {
        let held: object | undefined = node;
        released.push(() => {
          held = undefined;
        });
        return { deref: () => held } satisfies NodeRef;
      };

      return { factory, releaseAll: () => released.forEach((release) => release()) };
    }

    it('resolves to null once the node is gone', () => {
      const { factory, releaseAll } = releasableRefs();
      const registry = createRegistry(factory);
      const id = registry.idOf({});

      releaseAll();

      expect(registry.resolve(id)).toBeNull();
    });

    it('drops the dead entry rather than keeping it forever', () => {
      const { factory, releaseAll } = releasableRefs();
      const registry = createRegistry(factory);
      registry.idOf({});
      releaseAll();

      registry.sweep();

      expect(registry.size).toBe(0);
    });

    it('keeps live entries when sweeping', () => {
      const { factory } = releasableRefs();
      const registry = createRegistry(factory);
      const alive = {};
      const id = registry.idOf(alive);

      registry.sweep();

      expect(registry.size).toBe(1);
      expect(registry.resolve(id)).toBe(alive);
    });
  });
});
