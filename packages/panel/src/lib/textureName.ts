/**
 * The last segment of a texture's name.
 *
 * Names arrive as paths (`assets/atlas/hero.png`), as cache keys, or as bare
 * frame names, and the last segment is what tells two of them apart at a
 * glance — as it did in the previous project. Shared because two places need
 * the same answer for different reasons: the Assets grid shows it while
 * keeping the full label beside it, and the Sprite picker both shows it *and*
 * writes it, since a game names its textures by the file rather than by the
 * folder it was served from.
 */
export function baseName(label: string): string {
  return label.split('/').pop() ?? '';
}
