import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { drawDragon } from './dragon.mjs';
import { drawLogo } from './logo.mjs';
import { buildLogoSkeleton } from './logoSkeleton.mjs';
import { encodePng } from './png.mjs';
import { atlasText, COIL, DRAGON, FRAME, SHEET, sheetManifest, TILE } from './regions.mjs';
import { drawFrame, drawSheet, drawTile } from './sheet.mjs';
import { buildSkeleton } from './skeleton.mjs';

/**
 * Draws every asset the playground ships and writes it into `public/`.
 *
 * Run rarely and on purpose — `npm run assets:playground` — with the output
 * committed. The art is generated rather than drawn in a tool for two reasons:
 * it is reproducible, and it is unambiguously ours, which the assets a stand
 * borrows from someone else's examples repository are not.
 */

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', '..', 'apps', 'playground', 'public');

function writePng(dir, file, size, pixels) {
  const path = join(dir, file);
  writeFileSync(path, encodePng(size, size, pixels));
  return path;
}

function writeText(dir, file, text) {
  const path = join(dir, file);
  writeFileSync(path, text);
  return path;
}

export function generate() {
  const gameDir = join(publicDir, 'game');
  const dragonDir = join(publicDir, 'dragon');
  const logoDir = join(publicDir, 'logo');

  mkdirSync(gameDir, { recursive: true });
  mkdirSync(dragonDir, { recursive: true });
  mkdirSync(logoDir, { recursive: true });

  const written = [
    writePng(gameDir, SHEET.file, SHEET.size, drawSheet()),
    writeText(gameDir, 'sheet.json', `${JSON.stringify(sheetManifest(SHEET), null, 2)}\n`),
    writePng(gameDir, TILE.file, TILE.size, drawTile()),
    writePng(gameDir, FRAME.file, FRAME.size, drawFrame()),
    writePng(dragonDir, DRAGON.file, DRAGON.size, drawDragon()),
    writeText(dragonDir, 'dragon.atlas', atlasText(DRAGON)),
    writeText(dragonDir, 'dragon.json', `${JSON.stringify(buildSkeleton(), null, 2)}\n`),
    writePng(logoDir, COIL.file, COIL.size, drawLogo()),
    writeText(logoDir, 'coil.atlas', atlasText(COIL)),
    writeText(logoDir, 'coil.json', `${JSON.stringify(buildLogoSkeleton(), null, 2)}\n`),
  ];

  return written;
}

// `node scripts/playground-assets/generate.mjs`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const path of generate()) console.log(`wrote ${path}`);
}
