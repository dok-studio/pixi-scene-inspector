import type { T } from '../../../i18n/index.js';
import type { DiagramId, ImageId } from '../content/types.js';
import { AssetsDiagram, ASSETS_CALLOUTS } from './AssetsDiagram.js';
import { BookmarksDiagram } from './BookmarksDiagram.js';
import { CountsDiagram } from './CountsDiagram.js';
import { CustomDiagram, CUSTOM_CALLOUTS } from './CustomDiagram.js';
import { SceneDiagram, SCENE_CALLOUTS } from './SceneDiagram.js';
import { StatsDiagram, STATS_CALLOUTS } from './StatsDiagram.js';
import { TreeRowDiagram } from './TreeRowDiagram.js';
import { UnderCursorDiagram } from './UnderCursorDiagram.js';

type Diagram = (props: { title: string; t: T }) => React.ReactElement;

/**
 * Every schematic the document draws, `diagram` blocks and `image` blocks
 * together — the two differ only in whether a legend follows the picture.
 */
export const DIAGRAMS: Record<DiagramId | ImageId, Diagram> = {
  scene: SceneDiagram,
  assets: AssetsDiagram,
  stats: StatsDiagram,
  custom: CustomDiagram,
  treeRow: TreeRowDiagram,
  underCursor: UnderCursorDiagram,
  bookmarks: BookmarksDiagram,
  counts: CountsDiagram,
};

/**
 * The badges each `diagram` block's picture actually draws.
 *
 * Declared here rather than counted off the legend because the picture is what
 * has to be true: a legend can name a badge nobody drew, and nothing on screen
 * would say so. `content/coverage.test.ts` compares the two in both languages.
 * `image` blocks carry no legend, so they have no entry here.
 */
export const DIAGRAM_CALLOUTS: Record<DiagramId, readonly number[]> = {
  scene: SCENE_CALLOUTS,
  assets: ASSETS_CALLOUTS,
  stats: STATS_CALLOUTS,
  custom: CUSTOM_CALLOUTS,
};
