import type { Json } from '@scene-inspector/protocol';

/**
 * The rolling fingerprint behind every revision (docs/architecture.md §3.2).
 *
 * FNV-1a, 32-bit: cheap, allocation-free over integers, and adequate for "has
 * this changed". It is folded **in traversal order** rather than combined
 * commutatively — reordering siblings changes nothing else about a tree, and a
 * sum or an XOR would report it as unchanged.
 */

export const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Integers only — see `hashJson` for values that may be fractional. */
export function hashNumber(hash: number, value: number): number {
  let next = hash;
  for (let shift = 0; shift < 32; shift += 8) {
    next = Math.imul(next ^ ((value >>> shift) & 0xff), FNV_PRIME);
  }
  return next | 0;
}

export function hashString(hash: number, value: string): number {
  let next = hash;
  for (let i = 0; i < value.length; i += 1) {
    next = Math.imul(next ^ value.charCodeAt(i), FNV_PRIME);
  }
  // The length is folded in as well, so that ['ab',''] and ['a','b'] — which
  // produce the same byte stream — do not collide.
  return hashNumber(next, value.length);
}

/**
 * A property value of any shape.
 *
 * Numbers go through their string form on purpose. `hashNumber` reads four
 * bytes of an integer, so every value between 0 and 1 would fold identically —
 * and alpha, scale and rotation are exactly the properties that live there.
 * The allocation is affordable here: this runs over the handful of keys the
 * panel can see, not over every node in the scene.
 */
export function hashJson(hash: number, value: Json | undefined): number {
  if (value === undefined) return hashString(hash, '\u0000undefined');
  if (value === null) return hashString(hash, '\u0000null');

  switch (typeof value) {
    case 'number':
      return hashString(hash, String(value));
    case 'boolean':
      return hashNumber(hash, value ? 1 : 0);
    case 'string':
      return hashString(hash, value);
    default:
      break;
  }

  if (Array.isArray(value)) {
    let next = hashString(hash, '\u0000[');
    for (const item of value) next = hashJson(next, item);
    return next;
  }

  // Keys are folded in with their values: {x: 1} and {y: 1} must differ.
  let next = hashString(hash, '\u0000{');
  for (const [key, item] of Object.entries(value)) {
    next = hashJson(hashString(next, key), item);
  }
  return next;
}
