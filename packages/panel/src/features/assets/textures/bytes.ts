import { formatNumber } from '../../../lib/formatNumber.js';

/**
 * Bytes as megabytes, in the unit the previous project used and in one place
 * rather than three: the tile, the details pane and the strip under the grid
 * all report the same figure, and they should not be able to disagree about
 * how it is rounded.
 */
export function megabytes(bytes: number | null): string {
  return bytes === null ? 'unknown' : `${formatNumber(bytes / (1024 * 1024), 3)} MB`;
}
