// @vitest-environment happy-dom
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Textarea } from './textarea.js';

/**
 * The box grows to its content, and the question every test here asks is the
 * same one: **is every line it holds inside the part that can be seen?**
 *
 * That is not the same as "is the box as tall as the text". The height being
 * set is a border box, while `scrollHeight` measures the content and its
 * padding — and on a box that does not wrap, the browser lays a horizontal
 * scrollbar inside that border box too. Both come off the visible area, and
 * the last line is what falls out of it.
 *
 * A document with no layout reports zero for all of it, so the geometry is
 * faked below: one line is 16px, the padding 4, the border 2, and the
 * scrollbar 10 — the numbers this panel actually measures in a drawer.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const LINE = 16;
const PADDING = 4;
const BORDER = 2;
/** What the panel's own scrollbar costs: 10px against a 16px line. */
const BAR = 10;
/** A line longer than this does not fit across the box, so a bar appears. */
const WIDE = 20;

const lines = (el: HTMLTextAreaElement): string[] => el.value.split('\n');
const scrolls = (el: HTMLTextAreaElement): boolean =>
  el.getAttribute('wrap') === 'off' && lines(el).some((line) => line.length > WIDE);

/**
 * The border box. `height: auto` is what the component resets to before
 * measuring, and there the browser falls back to the `rows` attribute.
 */
const box = (el: HTMLTextAreaElement): number => {
  const set = Number.parseFloat(el.style.height);
  return Number.isNaN(set) ? Number(el.rows) * LINE + PADDING + BORDER : set;
};

const stubLayout = (): void => {
  const define = (name: string, get: (el: HTMLTextAreaElement) => number): void => {
    Object.defineProperty(HTMLTextAreaElement.prototype, name, {
      configurable: true,
      get(this: HTMLTextAreaElement) {
        return get(this);
      },
    });
  };

  define('offsetHeight', (el) => box(el));
  define('clientHeight', (el) => box(el) - BORDER - (scrolls(el) ? BAR : 0));
  define('scrollHeight', (el) =>
    Math.max(lines(el).length * LINE + PADDING, box(el) - BORDER - (scrolls(el) ? BAR : 0)),
  );
};

describe('Textarea', () => {
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    stubLayout();
    // The component reads the line height off the computed style, and a
    // document with no layout answers `normal` — which is not a number.
    vi.stubGlobal('getComputedStyle', () => ({ lineHeight: `${String(LINE)}px` }));
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  const show = (value: string, wrap?: 'off'): HTMLTextAreaElement => {
    act(() => {
      root.render(<Textarea readOnly value={value} wrap={wrap} minRows={1} maxRows={12} />);
    });

    const found = container.querySelector('textarea');
    if (found === null) throw new Error('no box');
    return found;
  };

  it('shows every line it was given', () => {
    const el = show('hud\ncaption\nmuted');

    expect(el.clientHeight).toBeGreaterThanOrEqual(el.scrollHeight);
  });

  /**
   * The list of classes, read as a column. `wrap="off"` is what keeps one item
   * from reading as two, and it is also what draws a bar across the bottom of
   * the box — over the last entry, which had nowhere else to go.
   */
  it('keeps the last line clear of the scrollbar its own long line draws', () => {
    const el = show(
      'hud\ncaption\nmuted\na-deliberately-long-class-name-that-will-not-fit\ntail',
      'off',
    );

    expect(scrolls(el)).toBe(true);
    expect(el.clientHeight).toBeGreaterThanOrEqual(el.scrollHeight);
  });

  it('stops growing at maxRows and scrolls from there', () => {
    const many = Array.from({ length: 40 }, (_, index) => `item-${String(index)}`).join('\n');
    const el = show(many);

    expect(el.style.overflowY).toBe('auto');
    expect(box(el)).toBeLessThan(40 * LINE);
  });
});
