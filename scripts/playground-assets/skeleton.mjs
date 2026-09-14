import { DRAGON, regionOf } from './regions.mjs';

/**
 * The dragon's skeleton, written by hand.
 *
 * Two rules keep this file safe, and both are deliberate restraint rather than
 * ignorance of the format:
 *
 *  1. **No syntax newer than 4.1.** No curve arrays, no `inherit` on a bone.
 *     The subset used here reads identically on the 4.1, 4.2 and 4.3 lines of
 *     the runtime, which means the file cannot be broken by a dependency bump.
 *     Linear keys look a little mechanical; at this size nobody can tell.
 *  2. **Every attachment sits at the origin**, and the composition is laid out
 *     by *bones* in the setup pose. The page is Y-down and a skeleton is Y-up,
 *     and mixing the two is how hand-written exports end up subtly mirrored.
 *     One coordinate system, one place to think about it.
 *
 * The shape follows the example that is known to load
 * (`pixi-scene-inspector-dev/apps/playground/public/circle/circle.json`).
 */

/** Where each bone sits, in the skeleton's own space. Y is up; the head faces +X. */
const BONES = [
  { name: 'root' },
  { name: 'head', parent: 'root' },
  { name: 'jaw-upper', parent: 'head', x: 16, y: 5 },
  { name: 'jaw-lower', parent: 'head', x: 16, y: -5 },
  { name: 'tongue', parent: 'jaw-lower', x: 22, y: 2, rotation: -90 },
  { name: 'eye-l', parent: 'head', x: -2, y: 12 },
  { name: 'eye-r', parent: 'head', x: -2, y: -12 },
  { name: 'brow-l', parent: 'head', x: -6, y: 17, rotation: 12 },
  { name: 'brow-r', parent: 'head', x: -6, y: -17, rotation: -12, scaleY: -1 },
];

/**
 * Draw order, back to front.
 *
 * Horns first so they sit behind the skull, the lower jaw under the head, and
 * the eyes last so nothing covers them.
 */
const SLOTS = [
  { name: 'jaw-lower', bone: 'jaw-lower', attachment: 'jaw-lower' },
  { name: 'tongue', bone: 'tongue', attachment: 'tongue' },
  { name: 'head', bone: 'head', attachment: 'head' },
  { name: 'jaw-upper', bone: 'jaw-upper', attachment: 'jaw-upper' },
  { name: 'brow-l', bone: 'brow-l', attachment: 'brow' },
  { name: 'brow-r', bone: 'brow-r', attachment: 'brow' },
  { name: 'eye-l', bone: 'eye-l', attachment: 'eye' },
  { name: 'eye-r', bone: 'eye-r', attachment: 'eye' },
];

/**
 * One attachment, sized from the region table so the two can never disagree.
 *
 * `path` is what ties it to the atlas; the attachment's own key is what the
 * slot asks for. They differ on purpose in the `ember` skin — the same
 * attachment name pointing at a different region is exactly what a skin is.
 */
function attachment(regionName, extra = {}) {
  const region = regionOf(DRAGON, regionName);

  return { type: 'region', path: region.name, width: region.w, height: region.h, ...extra };
}

function skin(name, { head, eye }) {
  return {
    name,
    attachments: {
      'brow-l': { brow: attachment('brow') },
      'brow-r': { brow: attachment('brow') },
      'jaw-lower': { 'jaw-lower': attachment('jaw-lower') },
      tongue: { tongue: attachment('tongue') },
      head: { head: attachment(head) },
      'jaw-upper': { 'jaw-upper': attachment('jaw-upper') },
      'eye-l': { eye: attachment(eye) },
      'eye-r': { eye: attachment(eye) },
    },
  };
}

/**
 * Breathing, a blink and two footfalls.
 *
 * The first and last key of every timeline hold the same value, so the loop
 * closes without a jump — the test beside this file checks it, because a
 * skeleton that twitches once a cycle is the kind of thing nobody notices while
 * writing it and everybody notices on a screenshot.
 */
const IDLE = {
  bones: {
    head: {
      translate: [
        { time: 0, x: 0, y: 0 },
        { time: 1, x: 2.5, y: 0 },
        { time: 2, x: 0, y: 0 },
      ],
      rotate: [
        { time: 0, value: 0 },
        { time: 0.5, value: 1.8 },
        { time: 1.5, value: -1.8 },
        { time: 2, value: 0 },
      ],
    },
    'brow-l': {
      rotate: [
        { time: 0, value: 0 },
        { time: 1, value: 3 },
        { time: 2, value: 0 },
      ],
    },
    'brow-r': {
      rotate: [
        { time: 0, value: 0 },
        { time: 1, value: -3 },
        { time: 2, value: 0 },
      ],
    },
    'eye-l': {
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 1.2, x: 1, y: 1 },
        { time: 1.28, x: 1, y: 0.1 },
        { time: 1.36, x: 1, y: 1 },
        { time: 2, x: 1, y: 1 },
      ],
    },
    'eye-r': {
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 1.2, x: 1, y: 1 },
        { time: 1.28, x: 1, y: 0.1 },
        { time: 1.36, x: 1, y: 1 },
        { time: 2, x: 1, y: 1 },
      ],
    },
  },
  events: [
    { time: 0.5, name: 'step', int: 1, string: 'left' },
    { time: 1.5, name: 'step', int: 2, string: 'right' },
  ],
};

/** The chomp. Short, and the only thing on track 1 while it runs. */
const BITE = {
  bones: {
    'jaw-lower': {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.12, value: -26 },
        { time: 0.34, value: 0 },
      ],
    },
    'jaw-upper': {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.12, value: 12 },
        { time: 0.34, value: 0 },
      ],
    },
    tongue: {
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 0.12, x: 1, y: 1.5 },
        { time: 0.34, x: 1, y: 1 },
      ],
    },
  },
  events: [{ time: 0.12, name: 'bite', int: 0, string: 'chomp' }],
};

/** The end: the head rolls, swells and fades. Track 0 holds the last pose. */
const DIE = {
  bones: {
    head: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.4, value: -14 },
        { time: 1.2, value: 28 },
      ],
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 0.3, x: 1.18, y: 1.18 },
        { time: 1.2, x: 0.86, y: 0.86 },
      ],
    },
    'jaw-lower': {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.3, value: -34 },
        { time: 1.2, value: -22 },
      ],
    },
  },
  slots: {
    head: {
      rgba: [
        { time: 0, color: 'ffffffff' },
        { time: 0.3, color: 'ffd6d6ff' },
        { time: 1.2, color: '8a8a8aff' },
      ],
    },
  },
  events: [{ time: 0.7, name: 'death', int: 0, string: '' }],
};

export function buildSkeleton() {
  return {
    skeleton: {
      hash: 'dragonHeadTopDown',
      // Written for the 4.1 reader on purpose — see the note at the top.
      spine: '4.1.24',
      x: -60,
      y: -52,
      width: 130,
      height: 104,
      images: './',
      audio: '',
    },
    bones: BONES,
    slots: SLOTS,
    events: {
      bite: { int: 0, float: 0, string: '' },
      step: { int: 0, float: 0, string: '' },
      death: { int: 0, float: 0, string: '' },
    },
    skins: [
      skin('default', { head: 'head', eye: 'eye' }),
      skin('ember', { head: 'head-ember', eye: 'eye-ember' }),
    ],
    animations: { idle: IDLE, bite: BITE, die: DIE },
  };
}
