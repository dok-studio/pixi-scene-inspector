import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * The manifest's version is the one people see.
 *
 * It is not only what the Web Store counts updates by: the panel reads it back
 * with `chrome.runtime.getManifest()` and shows it under the logo, and the help
 * page prints it at the end. Nothing generates the manifest — it is a static
 * file copied out of `public/` — so a release that bumps the repository and
 * forgets this one ships a build that misreports itself, in two places, and
 * says nothing about it.
 *
 * Hence this test rather than a build step: the two numbers are written by
 * hand, and the only thing worth mechanising is noticing when they disagree.
 */
const read = (relative: string): { version: string } =>
  JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')) as {
    version: string;
  };

describe('manifest version', () => {
  it('matches the version in the repository root', () => {
    expect(read('../public/manifest.json').version).toBe(read('../../../package.json').version);
  });

  it('is a release version rather than the placeholder', () => {
    expect(read('../public/manifest.json').version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(read('../public/manifest.json').version).not.toBe('0.0.0');
  });
});
