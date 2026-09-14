import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Builds `THIRD_PARTY_LICENSES`.
 *
 * The document has two halves and they are maintained differently.
 *
 * The hand-written half is `scripts/licenses/preamble.txt`: what this project
 * inherited from PixiJS DevTools, the shadcn/ui components it carries rather
 * than installs, and the icon artwork. That last one is the reason the halves
 * cannot be merged — `react-icons` is MIT and its manifest says so, but the
 * glyphs inside it are Font Awesome under CC BY 4.0 and Lucide under ISC, and
 * nothing in a dependency tree will ever say that. A generator cannot know it
 * and a person has to write it down.
 *
 * The generated half is everything the build bundles. It is generated because
 * a hand-written list of dependencies is wrong the moment it is written: the
 * extension's own `package.json` files name a dozen packages, and the closure
 * behind them is eighty-odd — including one under BSD-3-Clause, which arrives
 * four levels down through `react-arborist` and asks for its notice to be
 * reproduced like everything else.
 *
 * Run it with `npm run licenses`. `--check` regenerates and compares instead of
 * writing, which is what the test does, so the committed file cannot fall
 * behind `package-lock.json` without something saying so.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

/**
 * The walk starts at the extension and follows `dependencies` from there.
 *
 * Not from the repository root, and not from the workspace list: `pixi.js` is
 * hoisted into the root `node_modules` for the playground, and the playground
 * is not the product. What the extension bundles is what is reachable from
 * `apps/chrome`, so that is what is asked.
 */
const ENTRY = resolve(ROOT, 'apps/chrome');

/** The workspace's own packages: descended into, never listed. */
const OWN = '@scene-inspector/';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/**
 * Node's own resolution, minus the parts that do not apply here: walk up from
 * the dependent looking for `node_modules/<name>`. npm hoists almost
 * everything to the root, but a version conflict leaves a nested copy behind,
 * and that copy is the one its dependent actually loads.
 */
function locate(name, from) {
  let dir = from;

  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;

    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** `license`, as the field has been spelled over the years. */
function spdxOf(manifest) {
  const { license, licenses } = manifest;

  if (typeof license === 'string') return license;
  if (license && typeof license === 'object' && 'type' in license) return String(license.type);
  if (Array.isArray(licenses)) return licenses.map((entry) => entry.type ?? entry).join(' OR ');
  if (licenses && typeof licenses === 'object') return String(licenses.type ?? '');

  return '';
}

/**
 * `LICENSE`, `LICENCE`, `LICENSE.md`, `LICENSE-MIT`, `COPYING` — the file is
 * conventional rather than specified, so the convention is matched broadly.
 */
const LICENCE_FILE = /^(licen[cs]e|copying)([.-].*)?$/i;

function licenceTextOf(dir) {
  const names = readdirSync(dir)
    .filter((name) => LICENCE_FILE.test(name))
    .sort();

  if (names.length === 0) return null;

  return names
    .map((name) => readFileSync(join(dir, name), 'utf8'))
    .join('\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/\s+$/, '');
}

/**
 * Every package the extension carries, deduplicated by name and version.
 *
 * A package reached twice at the same version is one package; reached at two
 * versions it is two, and both are listed, because the two ship separately and
 * their notices may differ.
 */
export function collect(entry = ENTRY) {
  const packages = new Map();

  const visit = (name, from) => {
    const dir = locate(name, from);
    if (dir === null) throw new Error(`${name} is required by ${from} but is not installed`);

    const manifest = readJson(join(dir, 'package.json'));
    const own = manifest.name.startsWith(OWN);
    const id = `${manifest.name}@${manifest.version}`;

    if (!own && packages.has(id)) return;
    if (!own) packages.set(id, { name: manifest.name, version: manifest.version, dir, manifest });

    for (const dependency of Object.keys(manifest.dependencies ?? {})) visit(dependency, dir);
  };

  for (const dependency of Object.keys(readJson(join(entry, 'package.json')).dependencies ?? {})) {
    visit(dependency, entry);
  }

  return [...packages.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

const RULE = '='.repeat(70);
const THIN = '-'.repeat(70);

/** One entry: what it is, under what, and then its own words. */
function render(pkg) {
  const spdx = spdxOf(pkg.manifest) || 'no licence declared';
  const text = licenceTextOf(pkg.dir);

  const head = [
    THIN,
    `${pkg.name} ${pkg.version}`,
    spdx,
    `https://www.npmjs.com/package/${pkg.name}`,
    THIN,
  ].join('\n');

  // Said outright rather than passed over. A package that ships no licence
  // file has been read and found not to have one, and the reader can see that
  // the manifest is all there is.
  const body =
    text ??
    `This package declares ${spdx} in its manifest and ships no licence file.\nThe declaration above is the whole of what it states.`;

  return `${head}\n\n${body}\n`;
}

export function build(entry = ENTRY) {
  const preamble = readFileSync(join(HERE, 'licenses', 'preamble.txt'), 'utf8').replace(
    /\r\n/g,
    '\n',
  );

  const packages = collect(entry);
  const families = new Map();

  for (const pkg of packages) {
    const spdx = spdxOf(pkg.manifest) || 'no licence declared';
    families.set(spdx, (families.get(spdx) ?? 0) + 1);
  }

  const summary = [...families]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([spdx, count]) => `  ${String(count).padStart(3)}  ${spdx}`)
    .join('\n');

  const contents = packages
    .map((pkg) => `  ${pkg.name} ${pkg.version}`)
    .join('\n');

  const section = [
    RULE,
    '5. BUNDLED NPM PACKAGES',
    RULE,
    '',
    'The extension is one bundle: every package below is compiled into it and',
    'is distributed with it. The list is the dependency closure of',
    'apps/chrome, so it includes packages no manifest of this project names —',
    'they arrive through the ones that do.',
    '',
    `${packages.length} packages, under:`,
    '',
    summary,
    '',
    'Each is reproduced below under its own licence file, verbatim. Where a',
    'package ships no such file, its manifest declaration is given instead and',
    'is said to be all there is.',
    '',
    '',
    'CONTENTS',
    '',
    contents,
    '',
    '',
    packages.map(render).join('\n'),
  ].join('\n');

  return `${preamble.replace(/\s+$/, '')}\n\n\n${section.replace(/\s+$/, '')}\n`;
}

const OUTPUT = resolve(ROOT, 'THIRD_PARTY_LICENSES');
const normalise = (text) => text.replace(/\r\n/g, '\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wanted = build();

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT) ? normalise(readFileSync(OUTPUT, 'utf8')) : '';

    if (current !== wanted) {
      process.stderr.write('THIRD_PARTY_LICENSES is out of date. Run `npm run licenses`.\n');
      process.exit(1);
    }

    process.stdout.write('THIRD_PARTY_LICENSES is up to date.\n');
  } else {
    writeFileSync(OUTPUT, wanted);
    process.stdout.write(`THIRD_PARTY_LICENSES written, ${collect().length} packages.\n`);
  }
}
