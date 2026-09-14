import { NECK_AT, TAIL_AT } from './coilGeometry.mjs';
import { COIL, regionOf } from './regions.mjs';

/**
 * The logo snake's skeleton.
 *
 * The same two rules as the board's — see `skeleton.mjs` — and for the same
 * reasons: no syntax newer than 4.1, and every attachment at the origin with
 * the composition laid out by bones in the setup pose.
 *
 * Smaller than the head's, because it has less to do: the coil sits still and
 * breathes, the neck sways, the head nods with it, the eye blinks and the
 * tongue flicks. What it is really for is being a *second* skeleton on the
 * page — so the panel's skeleton chooser has something to choose between and
 * the tree holds two Spine nodes keeping different time.
 */

/** One decimal is plenty here, and it keeps the exported file readable. */
const round = (value) => Math.round(value * 10) / 10;

const BONES = [
  { name: 'root' },
  { name: 'coil', parent: 'root' },
  /*
   * On the thick end of the coil, where the body stops — see the sweep in
   * `logo.mjs`. Put anywhere else, the head reads as a separate object hovering
   * next to a ring.
   */
  { name: 'neck', parent: 'coil', x: round(NECK_AT.x), y: round(NECK_AT.y) },
  { name: 'head', parent: 'neck', x: 13, y: 9, rotation: -8 },
  // Its own bone on the far side of the coil, so the second track can wave it
  // without touching anything the first track is posing.
  { name: 'tail', parent: 'coil', x: round(TAIL_AT.x), y: round(TAIL_AT.y) },
  { name: 'eye', parent: 'head', x: 6, y: 3 },
  { name: 'tongue', parent: 'head', x: 21, y: -2 },
];

/** Back to front: the coil, then the head rising out of it, then its details. */
const SLOTS = [
  { name: 'tail', bone: 'tail', attachment: 'tail' },
  { name: 'coil', bone: 'coil', attachment: 'coil' },
  { name: 'tongue', bone: 'tongue', attachment: 'tongue' },
  { name: 'head', bone: 'head', attachment: 'head' },
  { name: 'eye', bone: 'eye', attachment: 'eye' },
];

function attachment(regionName) {
  const region = regionOf(COIL, regionName);

  return { type: 'region', path: region.name, width: region.w, height: region.h };
}

/**
 * Breathing, a sway, a blink and a flick of the tongue.
 *
 * Every timeline closes on the value it opened with, so the loop has no seam —
 * the test beside this file checks it, because a logo that twitches once every
 * three seconds is exactly the kind of thing that survives review and then ruins
 * a screenshot.
 */
const IDLE = {
  bones: {
    coil: {
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 1.5, x: 1.03, y: 0.98 },
        { time: 3, x: 1, y: 1 },
      ],
    },
    neck: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.9, value: 5 },
        { time: 2.1, value: -4 },
        { time: 3, value: 0 },
      ],
    },
    head: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.9, value: -3 },
        { time: 2.1, value: 4 },
        { time: 3, value: 0 },
      ],
    },
    eye: {
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 1.7, x: 1, y: 1 },
        { time: 1.78, x: 1, y: 0.1 },
        { time: 1.86, x: 1, y: 1 },
        { time: 3, x: 1, y: 1 },
      ],
    },
    tongue: {
      scale: [
        { time: 0, x: 0.2, y: 1 },
        { time: 0.5, x: 0.2, y: 1 },
        { time: 0.62, x: 1, y: 1 },
        { time: 0.8, x: 0.2, y: 1 },
        { time: 2.4, x: 0.2, y: 1 },
        { time: 2.52, x: 1, y: 1 },
        { time: 2.7, x: 0.2, y: 1 },
        { time: 3, x: 0.2, y: 1 },
      ],
    },
  },
  events: [
    { time: 0.62, name: 'flick', int: 1, string: '' },
    { time: 2.52, name: 'flick', int: 2, string: '' },
  ],
};

/**
 * The tail, waving — and **nothing else**.
 *
 * This is written to be played on a track of its own, on top of `idle`. Spine
 * mixes tracks per bone, so an animation that keys only `tail` leaves every
 * other bone to the track below it: the coil keeps breathing, the head keeps
 * swaying, and the tail moves to its own timing over the top.
 *
 * Which also makes it the clearest thing the panel's Spine section has to show.
 * Two tracks running at once, each with a different animation and its own time,
 * is the shape of a real game's skeleton — and the scrubber can be dragged
 * along one of them while the other keeps its own place.
 *
 * Its period is deliberately not a factor of `idle`'s three seconds: the two
 * drift against each other instead of locking into one repeating pose.
 */
const TAIL_WAG = {
  bones: {
    tail: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.3, value: 11 },
        { time: 0.9, value: -9 },
        { time: 1.3, value: 0 },
      ],
      scale: [
        { time: 0, x: 1, y: 1 },
        { time: 0.3, x: 1.04, y: 0.96 },
        { time: 0.9, x: 0.97, y: 1.03 },
        { time: 1.3, x: 1, y: 1 },
      ],
    },
  },
};

/** A sharper version of the same pose, for anything that wants to draw the eye. */
const ALERT = {
  bones: {
    neck: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.18, value: -12 },
        { time: 0.5, value: 0 },
      ],
    },
    head: {
      rotate: [
        { time: 0, value: 0 },
        { time: 0.18, value: 10 },
        { time: 0.5, value: 0 },
      ],
    },
    tongue: {
      scale: [
        { time: 0, x: 0.2, y: 1 },
        { time: 0.18, x: 1.2, y: 1 },
        { time: 0.5, x: 0.2, y: 1 },
      ],
    },
  },
  events: [{ time: 0.18, name: 'flick', int: 3, string: 'alert' }],
};

export function buildLogoSkeleton() {
  return {
    skeleton: {
      hash: 'coiledSnakeLogo',
      spine: '4.1.24',
      x: -52,
      y: -40,
      width: 110,
      height: 96,
      images: './',
      audio: '',
    },
    bones: BONES,
    slots: SLOTS,
    events: {
      flick: { int: 0, float: 0, string: '' },
    },
    skins: [
      {
        name: 'default',
        attachments: {
          tail: { tail: attachment('coil-tail') },
          coil: { coil: attachment('coil') },
          tongue: { tongue: attachment('coil-tongue') },
          head: { head: attachment('coil-head') },
          eye: { eye: attachment('coil-eye') },
        },
      },
    ],
    animations: { idle: IDLE, 'tail-wag': TAIL_WAG, alert: ALERT },
  };
}
