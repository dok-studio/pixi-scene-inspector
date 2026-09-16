import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zip } from './zip.mjs';

/**
 * Packs the built extension into the archive the Chrome Web Store accepts.
 *
 * The store takes a zip, `npm run build:chrome` leaves a directory, and the gap
 * between the two was being closed by hand — which is exactly where a release
 * goes wrong quietly: an archive built from a stale `dist`, or one wrapped in a
 * folder so that `manifest.json` is a level down and the upload is rejected
 * without saying why.
 *
 * So: this script never builds. It reads what is there, refuses anything that
 * does not look like a finished build, and names the file after the version in
 * the manifest — the same number the store counts updates by and the panel
 * shows under its logo. The build is the `npm run package:chrome` script's job,
 * which runs it first.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = resolve(ROOT, 'apps/chrome/dist');
const RELEASE = resolve(ROOT, 'release');

/** Files that must be in the build for it to be the thing we mean to submit. */
const REQUIRED = ['manifest.json', 'LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES'];

/** @returns {string[]} every file under `dist`, as archive paths, sorted. */
function collect() {
  const found = [];

  const walk = (directory) => {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) walk(path);
      else found.push(relative(DIST, path).split(sep).join('/'));
    }
  };

  walk(DIST);

  // Sorted so that two builds of the same commit produce the same archive;
  // `zip` fixes the timestamps for the same reason.
  return found.sort();
}

function build() {
  if (!existsSync(DIST)) {
    throw new Error('apps/chrome/dist does not exist. Run `npm run build:chrome` first.');
  }

  const names = collect();

  for (const required of REQUIRED) {
    if (!names.includes(required)) {
      throw new Error(`${required} is missing from apps/chrome/dist — the build is incomplete.`);
    }
  }

  // A source map in the package would be dead weight at best: nothing reads it
  // from an installed extension, and it carries the sources into a copy that
  // was meant to be the built one. The build emits none, so finding one here
  // means a config changed.
  const maps = names.filter((name) => name.endsWith('.map'));
  if (maps.length > 0) throw new Error(`source maps in the build: ${maps.join(', ')}`);

  const { version } = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));

  return {
    version,
    names,
    archive: zip(names.map((name) => ({ name, contents: readFileSync(join(DIST, name)) }))),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, names, archive } = build();

  mkdirSync(RELEASE, { recursive: true });
  const output = join(RELEASE, `scene-inspector-${version}.zip`);
  writeFileSync(output, archive);

  const size = (archive.length / 1024).toFixed(0);
  process.stdout.write(`${relative(ROOT, output)} — ${names.length} files, ${size} kB.\n`);
}

export { build, collect };
