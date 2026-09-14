import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { build, collect } from './licenses.mjs';

/**
 * `THIRD_PARTY_LICENSES` is generated, and a generated file that is committed
 * has one failure mode: it stops matching what generates it. A dependency
 * added, removed or bumped changes the closure, nothing regenerates the file,
 * and the extension ships a notice for a set of packages it no longer carries.
 *
 * The rest of these are about the walk itself, and they exist because both of
 * its edges have already been got wrong by hand: too shallow, and a licence
 * four levels down goes unmentioned; started too high, and the playground's
 * PixiJS is attributed as though the extension bundled it.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const normalise = (text) => text.replace(/\r\n/g, '\n');

describe('THIRD_PARTY_LICENSES', () => {
  it('is what the generator produces now', () => {
    const committed = normalise(readFileSync(resolve(ROOT, 'THIRD_PARTY_LICENSES'), 'utf8'));

    expect(committed, 'out of date — run `npm run licenses`').toBe(build());
  });

  it('names every package in the closure', () => {
    const document = normalise(readFileSync(resolve(ROOT, 'THIRD_PARTY_LICENSES'), 'utf8'));

    for (const pkg of collect()) {
      expect(document, pkg.name).toContain(`\n${pkg.name} ${pkg.version}\n`);
    }
  });
});

describe('the dependency closure', () => {
  const packages = collect();
  const names = packages.map((pkg) => pkg.name);

  /**
   * `hoist-non-react-statics` is four levels down — react-arborist, react-dnd,
   * and then it — and it is the only BSD-3-Clause thing in the bundle. No
   * manifest in this repository mentions it, which is exactly why a list
   * written by hand did not have it.
   */
  it('reaches past the dependencies this project declares', () => {
    expect(names).toContain('hoist-non-react-statics');
  });

  /**
   * PixiJS is a dependency of the playground, not of the extension, and npm
   * hoists it to the same `node_modules` as everything else. Walking from the
   * repository root would pick it up and attribute a library the product does
   * not ship.
   */
  it('leaves out what only the playground depends on', () => {
    expect(names).not.toContain('pixi.js');
  });

  it('leaves out the workspace’s own packages', () => {
    expect(names.filter((name) => name.startsWith('@scene-inspector/'))).toEqual([]);
  });

  it('gives every package a licence to be under', () => {
    for (const pkg of packages) {
      expect(pkg.manifest.license ?? pkg.manifest.licenses, pkg.name).toBeTruthy();
    }
  });
});
