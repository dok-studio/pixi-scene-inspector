import type { PropertyDescriptor } from '@scene-inspector/protocol';

/**
 * Descriptors that more than one section offers.
 *
 * Declared once rather than written twice: a caption is written and then
 * placed, so both of these are wanted next to the text as well as under
 * General — and a step tuned in one place must not come out different in the
 * other. They live in a module of their own because the Text schema and the
 * Container schema both need them, and the Container schema already imports the
 * Text one.
 */

export const POSITION: PropertyDescriptor = {
  key: 'position',
  label: 'Position',
  editor: 'vector2',
  options: { wheelStep: 10 },
};

/**
 * Synthetic: reads one axis and writes both, for the common case of scaling a
 * node evenly.
 */
export const SCALE_XY: PropertyDescriptor = {
  key: 'scaleXY',
  label: 'ScaleXY',
  editor: 'number',
  options: { step: 0.01 },
};

/**
 * The application's own classes, which PixiJS knows nothing about: a framework
 * puts them on the node as one spaced string, and a node without one draws no
 * row at all.
 *
 * Under Info like everything else that names a node, and **first on the Text
 * tab** — ahead of the position, ahead of the text itself. A caption is found by
 * what it is for before it is found by what it says, and which classes it
 * carries is the question asked of it first.
 */
export const CLASSES_LIST: PropertyDescriptor = {
  key: 'classesList',
  label: 'Classes List',
  editor: 'textList',
  // Read, not written: these are the framework's, and the framework is what
  // reads them back. See the note beside `id` and `label` in `schema.ts`.
  readOnly: true,
};

/**
 * The transform itself, which General draws as rows and the Object section
 * writes out as source.
 *
 * Two sections rather than one because they answer different questions — "what
 * is this value now" and "what would I write to get this" — and one list of
 * descriptors because they must answer about the same fields. A property added
 * to the rows and forgotten in the snippet is a snippet that quietly lies.
 */

export const SCALE: PropertyDescriptor = {
  key: 'scale',
  label: 'Scale',
  editor: 'vector2',
  options: { step: 0.01 },
};

export const ROTATION: PropertyDescriptor = {
  key: 'rotation',
  label: 'Rotation',
  editor: 'number',
  options: { step: 0.02 },
};

/** Only some types carry one, and the ones that do not draw no row for it. */
export const ANCHOR: PropertyDescriptor = {
  key: 'anchor',
  label: 'Anchor',
  editor: 'vector2',
  options: { step: 0.1 },
};

export const ALPHA: PropertyDescriptor = {
  key: 'alpha',
  label: 'Alpha',
  editor: 'range',
  options: { min: 0, max: 1, step: 0.05 },
};

export const Z_INDEX: PropertyDescriptor = { key: 'zIndex', label: 'Z Index', editor: 'number' };
