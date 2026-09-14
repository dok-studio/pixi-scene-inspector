import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { readPngHeader } from './png.mjs';
import { buildLogoSkeleton } from './logoSkeleton.mjs';
import { COIL, DRAGON, FRAME, SHEET, TILE } from './regions.mjs';
import { buildSkeleton } from './skeleton.mjs';

/**
 * The playground's art is generated and committed, and a hand-written Spine
 * export has a handful of ways to be quietly wrong that no type checker sees.
 * These are those ways.
 *
 * The point of checking them here rather than in the browser is that the
 * browser's answer to all of them is the same: nothing draws. A failing
 * assertion names which of the five it was.
 */

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'playground', 'public');

const png = (...parts) => readPngHeader(readFileSync(join(PUBLIC, ...parts)));

describe('the generated pages', () => {
  it.each([
    ['game', SHEET.file, SHEET.size],
    ['game', TILE.file, TILE.size],
    ['game', FRAME.file, FRAME.size],
    ['dragon', DRAGON.file, DRAGON.size],
    ['logo', COIL.file, COIL.size],
  ])('%s/%s decodes as 8-bit RGBA at its declared size', (dir, file, size) => {
    // `readPngHeader` verifies every chunk's CRC as it walks, so a truncated or
    // corrupted write fails here rather than in a renderer.
    const header = png(dir, file);

    expect(header).toMatchObject({ width: size, height: size, bitDepth: 8, colorType: 6 });
    expect(header.chunks).toEqual(['IHDR', 'IDAT', 'IEND']);
  });
});

describe.each([
  ['sheet', SHEET],
  ['dragon', DRAGON],
  ['coil', COIL],
])('%s regions', (_name, page) => {
  it('fit inside the page', () => {
    for (const { name, x, y, w, h } of page.regions) {
      expect(x + w, name).toBeLessThanOrEqual(page.size);
      expect(y + h, name).toBeLessThanOrEqual(page.size);
    }
  });

  it('do not overlap', () => {
    for (const a of page.regions) {
      for (const b of page.regions) {
        if (a === b) continue;

        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;

        expect(apart, `${a.name} overlaps ${b.name}`).toBe(true);
      }
    }
  });
});

describe.each([
  ['dragon', buildSkeleton, ['dragon', 'dragon.atlas']],
  ['coil', buildLogoSkeleton, ['logo', 'coil.atlas']],
])('the %s skeleton', (_name, build, atlasPath) => {
  const skeleton = build();
  const atlas = readFileSync(join(PUBLIC, ...atlasPath), 'utf8');
  const boneNames = new Set(skeleton.bones.map((bone) => bone.name));
  const slotNames = new Set(skeleton.slots.map((slot) => slot.name));

  it('points every attachment at a region the atlas has', () => {
    for (const skin of skeleton.skins) {
      for (const [slot, attachments] of Object.entries(skin.attachments)) {
        expect(slotNames, `skin ${skin.name} dresses unknown slot ${slot}`).toContain(slot);

        for (const attachment of Object.values(attachments)) {
          expect(atlas, `${skin.name}/${slot}`).toContain(`\n${attachment.path}\n`);
          expect(atlas).toContain(`  size: ${attachment.width}, ${attachment.height}\n`);
        }
      }
    }
  });

  it('dresses the same slots in every skin', () => {
    // A skin that leaves a slot out does not fall back — switching to it simply
    // makes that piece vanish, which reads as a broken export rather than as a
    // skin.
    const [first, ...rest] = skeleton.skins.map((skin) => Object.keys(skin.attachments).sort());

    for (const other of rest) expect(other).toEqual(first);
  });

  it('gives every bone a parent that exists', () => {
    for (const bone of skeleton.bones) {
      if (bone.parent === undefined) continue;

      expect(boneNames, bone.name).toContain(bone.parent);
    }
  });

  it('keys only bones, slots and events it declares', () => {
    for (const [name, animation] of Object.entries(skeleton.animations)) {
      for (const bone of Object.keys(animation.bones ?? {})) {
        expect(boneNames, `${name} keys unknown bone ${bone}`).toContain(bone);
      }

      for (const slot of Object.keys(animation.slots ?? {})) {
        expect(slotNames, `${name} keys unknown slot ${slot}`).toContain(slot);
      }

      for (const event of animation.events ?? []) {
        expect(skeleton.events, `${name} fires unknown event ${event.name}`).toHaveProperty(
          event.name,
        );
      }
    }
  });

  it('closes the idle loop on every timeline', () => {
    // A looping animation whose first and last keys differ jumps once a cycle.
    for (const [bone, timelines] of Object.entries(skeleton.animations.idle.bones)) {
      for (const [property, keys] of Object.entries(timelines)) {
        const withoutTime = (key) =>
          Object.fromEntries(Object.entries(key).filter(([field]) => field !== 'time'));

        expect(withoutTime(keys[keys.length - 1]), `idle/${bone}/${property}`).toEqual(
          withoutTime(keys[0]),
        );
      }
    }
  });
});
