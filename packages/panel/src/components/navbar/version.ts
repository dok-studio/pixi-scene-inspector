import type { PixiMajor } from '@scene-inspector/protocol';

/**
 * What the navbar tooltip says about the inspected page's PixiJS.
 *
 * A version string is only ever there when the page gave one: either `PIXI`
 * is on the window, or PixiJS 8.2+ passed it to the init hook. Neither holds
 * for a bundled v6/v7 application — the hooks did not exist before 8.2, and
 * nothing on the application or renderer carries the version — so on the old
 * lines the major from duck-typing is all detection can know.
 *
 * Saying `6.x` reports that honestly. The core keeps `version: null` there
 * rather than inventing a string, because the protocol's `version` means "what
 * the page said", and this is the panel's wording for "we worked it out".
 */
export function pixiVersionLabel(version?: string | null, major?: PixiMajor | null): string {
  if (version !== null && version !== undefined && version !== '') return version;
  if (major !== null && major !== undefined) return `${String(major)}.x`;
  return 'unknown';
}
