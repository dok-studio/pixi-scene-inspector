import { describe, expect, it } from 'vitest';

import { clampChannel, parseChannel, toRgb, withChannel } from './colorChannels.js';

/**
 * The channel fields hand the same colour back and forth as a hex string, so
 * every one of these has to survive the round trip: what `toRgb` reads, and
 * what `withChannel` writes, are the same six digits the swatch is painted
 * with.
 */

describe('toRgb', () => {
  it('reads the three channels of a six-digit colour', () => {
    expect(toRgb('#3f9ae0')).toEqual({ r: 0x3f, g: 0x9a, b: 0xe0 });
  });

  it('reads past the alpha of an eight-digit one', () => {
    expect(toRgb('#3f9ae080')).toEqual({ r: 0x3f, g: 0x9a, b: 0xe0 });
  });

  it('has nothing to say about a CSS keyword', () => {
    // What PixiJS reports for a text shadow nobody set a colour on.
    expect(toRgb('black')).toBeNull();
  });

  it('has nothing to say about a half-typed colour', () => {
    expect(toRgb('#3f9')).toBeNull();
  });
});

describe('withChannel', () => {
  it('replaces one channel and leaves the others', () => {
    expect(withChannel('#3f9ae0', 'g', 0x11)).toBe('#3f11e0');
  });

  it('keeps the alpha it was given', () => {
    expect(withChannel('#3f9ae080', 'r', 0)).toBe('#009ae080');
  });

  it('pads a colour whose digits fall short of six', () => {
    expect(withChannel('#000000', 'b', 1)).toBe('#000001');
  });

  it('clamps what it is handed', () => {
    expect(withChannel('#000000', 'r', 999)).toBe('#ff0000');
    expect(withChannel('#ffffff', 'r', -5)).toBe('#00ffff');
  });

  it('refuses a colour it cannot read', () => {
    expect(withChannel('black', 'r', 12)).toBeNull();
  });
});

describe('clampChannel', () => {
  it('rounds to a byte', () => {
    expect(clampChannel(127.6)).toBe(128);
  });
});

describe('parseChannel', () => {
  it('takes a number', () => {
    expect(parseChannel(' 128 ')).toBe(128);
  });

  it('clamps one that is out of range', () => {
    expect(parseChannel('300')).toBe(255);
  });

  it('refuses an empty field rather than calling it zero', () => {
    // Backspace over the last digit is not a request to make the channel black.
    expect(parseChannel('')).toBeNull();
  });

  it('refuses anything that is not digits', () => {
    expect(parseChannel('12a')).toBeNull();
    expect(parseChannel('-1')).toBeNull();
  });
});
