import type { PropertyDescriptor } from '@scene-inspector/protocol';
import { describe, expect, it } from 'vitest';

import type { PropertyCell } from './propertyCells.js';
import { groupCells, isSegmented, splitGroupSwitch } from './propertyCells.js';

/**
 * The arithmetic behind every property grid, which is where it can be checked
 * at all: `happy-dom` lays nothing out, so which group a cell lands in and what
 * kind of control it is has to be decidable without rendering.
 */

const FONT = 'Font';
const FILL = 'Fill';
const STROKE = 'Stroke';
const SHADOW = 'Shadow';

const field = (
  key: string,
  editor: PropertyDescriptor['editor'],
  group?: string,
): PropertyDescriptor => ({
  key,
  label: key,
  editor,
  ...(group === undefined ? {} : { group }),
});

const cellOf = (descriptor: PropertyDescriptor): PropertyCell => ({
  descriptor,
  value: undefined,
  onChange: () => undefined,
});

describe('isSegmented', () => {
  /** The same property is spelled differently on a tag and on a node. */
  it('knows the choices with a drawing, however they are spelled', () => {
    expect(isSegmented(field('align', 'select'))).toBe(true);
    expect(isSegmented(field('style.align', 'select'))).toBe(true);
    expect(isSegmented(field('style.fontStyle', 'select'))).toBe(true);
    expect(isSegmented(field('lineJoin', 'select'))).toBe(true);
    expect(isSegmented(field('style.stroke.join', 'select'))).toBe(true);
  });

  it('leaves the open-ended choices as selects', () => {
    expect(isSegmented(field('style.fontWeight', 'select'))).toBe(false);
    expect(isSegmented(field('style.textBaseline', 'select'))).toBe(false);
  });
});

describe('groupCells', () => {
  it('keeps the groups in the order they first appear', () => {
    const groups = groupCells(
      [field('stroke', 'color', STROKE), field('fill', 'color', FILL)].map(cellOf),
    );

    expect(groups.map((group) => group.name)).toEqual([STROKE, FILL]);
  });

  /** The declared order carries the meaning, and nothing here overrides it. */
  it('keeps the declared order inside a group', () => {
    const groups = groupCells(
      [
        field('fontSize', 'number', FONT),
        field('fontFamily', 'text', FONT),
        field('lineHeight', 'number', FONT),
      ].map(cellOf),
    );

    expect(groups[0]?.cells.map((cell) => cell.descriptor.key)).toEqual([
      'fontSize',
      'fontFamily',
      'lineHeight',
    ]);
  });

  /**
   * A switch is a row like any other. It used to be lifted to the front of its
   * group; where it belongs is now the schema's answer to give, and the schema
   * declares it first anyway.
   */
  it('leaves a switch where it was declared', () => {
    const groups = groupCells(
      [field('dropShadowBlur', 'number', SHADOW), field('dropShadow', 'boolean', SHADOW)].map(
        cellOf,
      ),
    );

    expect(groups[0]?.cells.map((cell) => cell.descriptor.key)).toEqual([
      'dropShadowBlur',
      'dropShadow',
    ]);
  });

  /** The rows a section draws before its first heading — a text, a position. */
  it('collects what has no group of its own, and names it nothing', () => {
    const groups = groupCells(
      [field('text', 'textMultiLine'), field('fill', 'color', FILL)].map(cellOf),
    );

    expect(groups.map((group) => group.name)).toEqual([undefined, FILL]);
  });

  it('leaves out a group nothing landed in', () => {
    const groups = groupCells([field('fontSize', 'number', FONT)].map(cellOf));

    expect(groups.map((group) => group.name)).toEqual([FONT]);
  });
});

/**
 * The one cell that is drawn in a group's heading instead of under it.
 *
 * Which one that is comes from the schema rather than from a rule here — a
 * boolean is not a switch by virtue of being a boolean, and `wordWrap` is the
 * standing proof of it.
 */
describe('splitGroupSwitch', () => {
  const marked = (key: string, group: string): PropertyDescriptor => ({
    ...field(key, 'boolean', group),
    groupSwitch: true,
  });

  it('takes the marked cell out of the rows', () => {
    const group = groupCells(
      [marked('strokeEnabled', STROKE), field('strokeThickness', 'number', STROKE)].map(cellOf),
    )[0];

    const split = splitGroupSwitch(group!);

    expect(split.switchCell?.descriptor.key).toBe('strokeEnabled');
    expect(split.rows.map((cell) => cell.descriptor.key)).toEqual(['strokeThickness']);
  });

  it('leaves a group with no marked cell exactly as it was', () => {
    const group = groupCells(
      [field('fontSize', 'number', FONT), field('fontFamily', 'text', FONT)].map(cellOf),
    )[0];

    const split = splitGroupSwitch(group!);

    expect(split.switchCell).toBeUndefined();
    expect(split.rows).toEqual(group?.cells);
  });

  /** A boolean is not a switch by being a boolean: the schema says which is. */
  it('leaves an unmarked switch among the rows', () => {
    const group = groupCells(
      [field('wordWrap', 'boolean', 'Layout'), field('wordWrapWidth', 'number', 'Layout')].map(
        cellOf,
      ),
    )[0];

    expect(splitGroupSwitch(group!).switchCell).toBeUndefined();
  });

  /**
   * The cells a section draws before its first heading have no band to be hoisted
   * into, and a control hoisted into one that is not there would disappear.
   */
  it('hoists nothing out of a group that has no heading', () => {
    const group = groupCells([{ ...field('visible', 'boolean'), groupSwitch: true }].map(cellOf))[0];

    const split = splitGroupSwitch(group!);

    expect(split.switchCell).toBeUndefined();
    expect(split.rows).toHaveLength(1);
  });
});
