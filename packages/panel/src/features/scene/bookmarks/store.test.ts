import { describe, expect, it } from 'vitest';

import type { NodePath } from './path.js';
import type { Bookmarks } from './store.js';
import { add, has, parse, remove, rewrite, trim } from './store.js';

const path = (name: string): NodePath => [
  { name: 'stage', type: 'Container', index: 0, siblings: 1 },
  { name, type: 'Sprite', index: 0, siblings: 1 },
];

/** Bookmarks put on in the order they are named. */
function bookmarked(...names: string[]): Bookmarks {
  return names.reduce<Bookmarks>((list, name) => add(list, path(name), 99), []);
}

const namesOf = (list: Bookmarks): string[] => list.map((entry) => entry.path[1]?.name ?? '');

describe('add', () => {
  it('numbers each bookmark after the highest already stored', () => {
    expect(bookmarked('hero', 'coin', 'chest').map((entry) => entry.seq)).toEqual([1, 2, 3]);
  });

  it('keeps the list in the order the bookmarks were put on', () => {
    expect(namesOf(bookmarked('hero', 'coin', 'chest'))).toEqual(['hero', 'coin', 'chest']);
  });

  it('does nothing to a node that is already bookmarked', () => {
    const once = bookmarked('hero');
    expect(add(once, path('hero'), 99)).toBe(once);
  });
});

describe('trim', () => {
  it('drops the oldest when a new bookmark passes the ceiling', () => {
    expect(namesOf(add(bookmarked('hero', 'coin', 'chest'), path('door'), 3))).toEqual([
      'coin',
      'chest',
      'door',
    ]);
  });

  it('cuts what is already stored when the ceiling is lowered', () => {
    expect(namesOf(trim(bookmarked('hero', 'coin', 'chest', 'door'), 2))).toEqual([
      'chest',
      'door',
    ]);
  });

  /** Storage is editable, so the order in the array cannot be trusted. */
  it('evicts by the number rather than by position', () => {
    const jumbled: Bookmarks = [
      { path: path('newest'), seq: 9 },
      { path: path('oldest'), seq: 1 },
    ];

    expect(namesOf(trim(jumbled, 1))).toEqual(['newest']);
  });

  it('leaves a list that fits exactly as it was', () => {
    const list = bookmarked('hero', 'coin');
    expect(trim(list, 30)).toBe(list);
  });

  it('empties the list at a ceiling of nothing', () => {
    expect(trim(bookmarked('hero'), 0)).toEqual([]);
  });
});

describe('remove', () => {
  it('takes one bookmark off and leaves the rest in order', () => {
    expect(namesOf(remove(bookmarked('hero', 'coin', 'chest'), path('coin')))).toEqual([
      'hero',
      'chest',
    ]);
  });

  it('leaves the list alone when it holds no such walk', () => {
    const list = bookmarked('hero');
    expect(remove(list, path('ghost'))).toBe(list);
  });
});

describe('rewrite', () => {
  it('replaces a walk and keeps the number it was put on with', () => {
    const list = bookmarked('hero', 'coin');
    const next = rewrite(list, path('hero'), path('player'));

    expect(namesOf(next)).toEqual(['player', 'coin']);
    expect(next[0]?.seq).toBe(1);
  });

  it('leaves the list alone when it holds no such walk', () => {
    const list = bookmarked('hero');
    expect(rewrite(list, path('ghost'), path('player'))).toBe(list);
  });
});

describe('parse', () => {
  it('reads back what was written', () => {
    const list = bookmarked('hero', 'coin');
    expect(parse(JSON.parse(JSON.stringify(list)))).toEqual(list);
  });

  /** Including the shape this used to be stored in: a map keyed by page. */
  it('treats anything that is not a list as nothing stored', () => {
    expect(parse(null)).toEqual([]);
    expect(parse('nonsense')).toEqual([]);
    expect(parse({ 'https://games.test/': [] })).toEqual([]);
  });

  it('drops entries that are not bookmarks', () => {
    expect(parse([{ path: [], seq: 1 }, 7, { seq: 2 }, { path: [] }])).toEqual([
      { path: [], seq: 1 },
    ]);
  });
});

describe('has', () => {
  it('knows a walk it holds from one it does not', () => {
    const list = bookmarked('hero');

    expect(has(list, path('hero'))).toBe(true);
    expect(has(list, path('coin'))).toBe(false);
  });
});
