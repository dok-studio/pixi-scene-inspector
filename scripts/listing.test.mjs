import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The store listing is written here and typed into a form by hand, which is
 * exactly the arrangement that drifts: the manifest's description changes, the
 * listing keeps the old sentence, and the two disagree in public. So the parts
 * that exist twice are compared, and the parts the store measures — field
 * lengths, image dimensions — are measured here rather than discovered by a
 * rejected upload.
 *
 * What is not checked is how many screenshots there are. The submission form
 * will not accept an item without one, and a second place saying so would only
 * be a second place to update.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = resolve(HERE, '../store');

const LISTING = readFileSync(join(STORE, 'listing.md'), 'utf8');
const MANIFEST = JSON.parse(
  readFileSync(resolve(HERE, '../apps/chrome/public/manifest.json'), 'utf8'),
);

/** The fenced block that follows a heading line, e.g. `**Name** (75)`. */
function field(label) {
  const at = LISTING.indexOf(`**${label}**`);
  expect(at, `${label} is missing from listing.md`).toBeGreaterThan(-1);

  const open = LISTING.indexOf('```', at);
  const close = LISTING.indexOf('```', open + 3);

  return LISTING.slice(LISTING.indexOf('\n', open) + 1, close).trim();
}

/** @returns {[number, number]} the dimensions in a PNG's IHDR. */
function size(path) {
  const png = readFileSync(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('store listing', () => {
  it('names the extension the way the manifest does', () => {
    expect(field('Name')).toBe(MANIFEST.name);
    expect(MANIFEST.name.length).toBeLessThanOrEqual(75);
  });

  it('carries the manifest description as the short description', () => {
    expect(field('Short description')).toBe(MANIFEST.description);
    expect(MANIFEST.description.length).toBeLessThanOrEqual(132);
  });

  it(`keeps the detailed description inside the store's limit`, () => {
    expect(field('Detailed description').length).toBeLessThanOrEqual(16000);
  });

  it('says the extension is not affiliated with PixiJS', () => {
    // The name carries someone else's trademark. The NOTICE that ships inside
    // the extension says so; the public listing has to say so too.
    expect(field('Detailed description')).toMatch(/not affiliated with/i);
  });

  it('points the privacy policy at a file that exists', () => {
    expect(field('Privacy policy URL')).toContain('PRIVACY.md');
    expect(existsSync(resolve(HERE, '../PRIVACY.md'))).toBe(true);
  });
});

describe('store images', () => {
  it('has a 128x128 icon', () => {
    expect(size(join(STORE, 'icon-128.png'))).toEqual([128, 128]);
  });

  it('has a 440x280 promotional tile', () => {
    expect(size(join(STORE, 'tile-440x280.png'))).toEqual([440, 280]);
  });

  it('has screenshots at the only size the store takes', () => {
    const directory = join(STORE, 'screenshots');
    const shots = existsSync(directory)
      ? readdirSync(directory).filter((name) => name.endsWith('.png'))
      : [];

    for (const shot of shots) {
      // 640x400 is allowed too, but mixing the two in one listing looks like
      // an accident, and 1280x800 is what the panel is composed for.
      expect([shot, size(join(directory, shot))]).toEqual([shot, [1280, 800]]);
    }
  });
});
