import type { Node } from './types.js';

/**
 * What kind of Pixi object a node is.
 *
 * The answer is duck-typed, not read off `constructor.name`: production bundles
 * are minified (`class t extends e`), and an application subclass reports its
 * own name, which would then have to be matched against a property schema that
 * knows nothing about it.
 *
 * Two families of markers are used, and the same function handles both:
 *
 *  - v8 nodes carry `renderPipeId` — as close to a declared type as Pixi gets;
 *  - v6/v7 nodes have no such field, so they are recognised by properties that
 *    exist on exactly one class.
 *
 * Keeping both in one place rather than in each adapter is deliberate: the
 * checks overlap heavily, and the version tells you nothing extra here — a v8
 * page can hold a node built by an older library copy.
 *
 * The result is the schema key for the property model (§3.4), so the set of
 * strings is a contract, not a display label.
 */

const has = (node: Node, key: string): boolean => key in node;

function pipeId(node: Node): string | null {
  const id = (node as { renderPipeId?: unknown }).renderPipeId;
  return typeof id === 'string' ? id : null;
}

/*
 * There is **no** test for named styles here, and that is the point.
 *
 * There are two multi-style texts and only one of them is a class. On the older
 * line an application installs `MultiStyleText` over `Text`, and a node of it is
 * that class and nothing else — so it has a type. On PixiJS 8 there is no such
 * class: the game folds the same feature into its own `Text`, which reads its
 * markup when the **style** it was given carries sub-styles. Such a node is a
 * `Text`, and the tree used to name a class the page does not contain.
 *
 * So multi-styleness is not a kind of node on that line; it is something a Text
 * may be doing, the way `flexFont` is. What follows from that is where its
 * section comes from: `properties/schema.ts` offers the tags to every `Text`,
 * and the panel drops the section for a node whose style holds none.
 */

/**
 * Order matters: a subclass carries all of its parent's markers, so the more
 * specific test has to come first. AnimatedSprite before Sprite, every text
 * flavour before Text, everything before Container.
 */
const TESTS: ReadonlyArray<readonly [type: string, test: (node: Node) => boolean]> = [
  [
    'BitmapText',
    (n) => ['bitmapText', 'BitmapText', 'BitmapText2'].includes(pipeId(n) ?? '') || has(n, '_activePagesMeshData'),
  ],
  ['HTMLText', (n) => pipeId(n) === 'htmlText' || (has(n, '_foreignObject') && has(n, '_svgRoot'))],
  // Not part of PixiJS either: `MultiStyleText` is a class applications install
  // over `Text`, so it carries every marker below and has to be tested first.
  // Its own marks are the styles it keeps beside the node and the method it
  // writes them through — see the note above for the line that has no such
  // class, and is therefore not tested for here.
  ['MultiStyleText', (n) => has(n, '_textStyles') && has(n, 'setTagStyle')],
  [
    'Text',
    (n) =>
      pipeId(n) === 'text' ||
      pipeId(n) === 'text2' ||
      (has(n, 'updateText') && has(n, 'drawLetterSpacing') && has(n, '_render')),
  ],
  [
    'AnimatedSprite',
    (n) => has(n, 'gotoAndPlay') && has(n, 'play') && has(n, 'stop') && has(n, '_isConnectedToTicker'),
  ],
  [
    'NineSliceSprite',
    (n) =>
      pipeId(n) === 'nineSliceSprite' ||
      (has(n, '_leftWidth') && has(n, '_rightWidth') && has(n, '_topHeight') && has(n, '_bottomHeight')),
  ],
  [
    'TilingSprite',
    (n) =>
      pipeId(n) === 'tilingSprite' ||
      (has(n, 'tileTransform') && has(n, 'uvRespectAnchor') && has(n, 'uvMatrix')),
  ],
  [
    'ParticleContainer',
    (n) =>
      pipeId(n) === 'particle' ||
      has(n, 'particleChildren') ||
      (has(n, '_maxSize') && has(n, '_batchSize') && has(n, '_bufferUpdateIDs')),
  ],
  // Not part of PixiJS: the Spine runtime is installed separately and may be
  // absent entirely, so the skeleton's own fields are the only marker.
  ['Spine', (n) => pipeId(n) === 'spine' || has(n, 'spineData')],
  [
    'Mesh',
    (n) =>
      pipeId(n) === 'mesh' ||
      (has(n, '_geometry') && has(n, 'drawMode') && has(n, 'vertexData') && has(n, 'batchUvs')),
  ],
  ['Graphics', (n) => pipeId(n) === 'graphics' || (has(n, 'drawRect') && has(n, 'drawPolygon'))],
  ['Sprite', (n) => pipeId(n) === 'sprite' || (has(n, 'vertexTrimmedData') && has(n, 'indices'))],
  [
    'Container',
    (n) =>
      (has(n, 'includeInBuild') && has(n, 'measurable') && has(n, '_didLocalTransformChangeId')) ||
      (has(n, '_maskRefCount') && has(n, '_render') && has(n, '_tempDisplayObjectParent')),
  ],
];

/** @returns 'Unknown' when nothing matched — never throws, never guesses. */
export function nodeType(node: Node): string {
  for (const [type, test] of TESTS) {
    if (test(node)) return type;
  }
  return 'Unknown';
}
