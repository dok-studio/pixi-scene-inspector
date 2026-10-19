// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { breakableName, splitTail } from './breakableName.js';

describe('breakableName', () => {
  it('offers a break after every separator and nowhere inside a word', () => {
    const markup = renderToStaticMarkup(<>{breakableName('collect/lvl_4/win-in.x')}</>);

    expect(markup).toBe('collect/<wbr/>lvl_<wbr/>4/<wbr/>win-<wbr/>in.<wbr/>x');
  });

  it('leaves a name without separators as it is', () => {
    expect(renderToStaticMarkup(<>{breakableName('idle')}</>)).toBe('idle');
  });
});

describe('splitTail', () => {
  it('keeps the slash with the last segment', () => {
    expect(splitTail('collector/collect/lvl_4/win/loop')).toEqual({
      head: 'collector/collect/lvl_4/win',
      tail: '/loop',
    });
  });

  it('treats a name with no slash, or ending in one, as all tail', () => {
    expect(splitTail('idle')).toEqual({ head: '', tail: 'idle' });
    expect(splitTail('idle/')).toEqual({ head: '', tail: 'idle/' });
    expect(splitTail('/idle')).toEqual({ head: '', tail: '/idle' });
  });
});
