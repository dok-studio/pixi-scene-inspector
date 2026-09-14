import { describe, expect, it } from 'vitest';

import { METRICS } from '../features/stats/metrics.js';
import { en } from './en.js';
import { MESSAGES } from './messages.js';
import type { MessageKey } from './messages.js';

/**
 * The net under the half `tsc` cannot reach.
 *
 * `Messages` already makes a missing key a build failure, so nothing here
 * checks for one. What it cannot see is what is *inside* a value: a slot the
 * translator dropped, an entry left empty, a metric naming a message that does
 * not exist.
 */

const SLOT = /\{(\w+)\}/g;

const slotsOf = (template: string): string[] =>
  [...template.matchAll(SLOT)].map((match) => match[1] ?? '').sort();

const KEYS = Object.keys(en) as MessageKey[];

describe('every locale', () => {
  it('says something for every key', () => {
    for (const [language, messages] of Object.entries(MESSAGES)) {
      for (const key of KEYS) {
        expect(messages[key], `${language}: ${key}`).not.toBe('');
      }
    }
  });

  /**
   * The one a translation gets wrong silently.
   *
   * A dropped `{name}` builds, types, and renders — as a sentence with a hole
   * where the node's name should be. Nothing else in the project would notice.
   */
  it('keeps the slots the English one names', () => {
    for (const [language, messages] of Object.entries(MESSAGES)) {
      for (const key of KEYS) {
        expect(slotsOf(messages[key]), `${language}: ${key}`).toEqual(slotsOf(en[key]));
      }
    }
  });
});

describe('the charts', () => {
  it('name a message that exists, where they name one at all', () => {
    for (const metric of METRICS) {
      if (metric.aboutKey === undefined) continue;
      expect(Object.hasOwn(en, metric.aboutKey), metric.key).toBe(true);
    }
  });
});
