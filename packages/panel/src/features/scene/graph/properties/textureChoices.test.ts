import { describe, expect, it } from 'vitest';

import { textureChoices } from './textureChoices.js';

describe('textureChoices', () => {
  it('offers the file rather than the path it was served from', () => {
    expect(textureChoices(['assets/img/chars/hero.png'])).toEqual(['hero.png']);
  });

  it('leaves a frame name alone, since it has no path to drop', () => {
    expect(textureChoices(['hero_idle_01'])).toEqual(['hero_idle_01']);
  });

  it('offers each name once, however many paths lead to it', () => {
    const names = ['ui/hero.png', 'hud/hero.png', 'hero.png'];

    expect(textureChoices(names)).toEqual(['hero.png']);
  });

  it('leaves out what shortens to nothing', () => {
    expect(textureChoices(['', 'assets/', 'hero.png'])).toEqual(['hero.png']);
  });

  it('sorts them, because the menu is read', () => {
    expect(textureChoices(['b/villain.png', 'a/hero.png'])).toEqual(['hero.png', 'villain.png']);
  });

  it('has nothing to offer before the list arrives', () => {
    expect(textureChoices(null)).toEqual([]);
  });
});
