import { baseName } from '../../../../lib/textureName.js';

/**
 * The names to offer when picking a texture.
 *
 * The page reports the names it caches a texture under, which are paths
 * (`assets/img/chars/hero.png`) as often as they are bare frame names. A menu
 * of paths is unreadable, and — since a game names its textures by the file —
 * the path is not what a `textureId` is spelled with either, so the last
 * segment is both what is shown and what is written.
 *
 * Shortening merges: two folders holding a `hero.png` answer one line. That is
 * honest rather than lossy, because picking either one writes the same string.
 * Sorted because the menu is read rather than scanned — a game has dozens.
 */
export function textureChoices(names: readonly string[] | null): string[] {
  const choices = new Set<string>();

  for (const name of names ?? []) {
    const short = baseName(name);
    if (short !== '') choices.add(short);
  }

  return [...choices].sort((left, right) => left.localeCompare(right));
}
