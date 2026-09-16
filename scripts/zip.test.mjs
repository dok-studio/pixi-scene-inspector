import { randomBytes } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { crc32 } from './crc32.mjs';
import { zip } from './zip.mjs';

/**
 * The archive is the thing that gets submitted, and nothing between here and
 * the store's uploader will say what is wrong with it — a bad offset, a
 * checksum over the compressed bytes instead of the original, a count that
 * disagrees with the directory, and the answer is the same unhelpful refusal.
 *
 * So the tests read the bytes back the way a reader does: from the end of
 * central directory backwards, following each offset to its local header, and
 * inflating what is there. Nothing here trusts the writer's own idea of where
 * it put things.
 */

const END = 0x06054b50;
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;

/** Reads an archive the way a reader does: directory first, then the entries. */
function read(archive) {
  const end = archive.length - 22;
  expect(archive.readUInt32LE(end)).toBe(END);

  const count = archive.readUInt16LE(end + 10);
  const entries = [];
  let cursor = archive.readUInt32LE(end + 16);

  for (let i = 0; i < count; i += 1) {
    expect(archive.readUInt32LE(cursor)).toBe(CENTRAL);

    const method = archive.readUInt16LE(cursor + 10);
    const crc = archive.readUInt32LE(cursor + 16);
    const compressed = archive.readUInt32LE(cursor + 20);
    const size = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const offset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);

    expect(archive.readUInt32LE(offset)).toBe(LOCAL);
    const localName = archive.readUInt16LE(offset + 26);
    const localExtra = archive.readUInt16LE(offset + 28);
    const body = archive.subarray(
      offset + 30 + localName + localExtra,
      offset + 30 + localName + localExtra + compressed,
    );

    entries.push({ name, method, crc, size, contents: method === 0 ? body : inflateRawSync(body) });
    cursor += 46 + nameLength;
  }

  // The directory ends exactly where the end record begins: a stray byte here
  // means a length field disagrees with what was written.
  expect(cursor).toBe(end);

  return entries;
}

describe('zip', () => {
  it('gives back the bytes it was handed', () => {
    const files = [
      { name: 'manifest.json', contents: Buffer.from('{"manifest_version":3}') },
      { name: 'assets/panel.js', contents: Buffer.from('x'.repeat(4096)) },
    ];

    const entries = read(zip(files));

    expect(entries.map((entry) => entry.name)).toEqual(['manifest.json', 'assets/panel.js']);
    expect(entries[0].contents.toString()).toBe('{"manifest_version":3}');
    expect(entries[1].contents.toString()).toBe('x'.repeat(4096));
  });

  it('records the checksum and length of the original, not of the compressed copy', () => {
    const contents = Buffer.from('a'.repeat(1000));
    const [entry] = read(zip([{ name: 'a.txt', contents }]));

    expect(entry.crc).toBe(crc32(contents));
    expect(entry.size).toBe(1000);
  });

  it('deflates what compresses and stores what does not', () => {
    const repetitive = Buffer.from('a'.repeat(1000));
    // Deflate cannot win on noise — it comes back longer than it went in,
    // and the writer is expected to notice and store the original instead.
    const random = randomBytes(1000);

    const entries = read(
      zip([
        { name: 'repetitive', contents: repetitive },
        { name: 'random', contents: random },
      ]),
    );

    expect(entries[0].method).toBe(8);
    expect(entries[1].method).toBe(0);
    expect(entries[1].contents).toEqual(random);
  });

  it('keeps the names it was given, slashes and all', () => {
    const entries = read(
      zip([
        { name: 'icons/icon16.png', contents: Buffer.from('a') },
        { name: 'THIRD_PARTY_LICENSES', contents: Buffer.from('b') },
      ]),
    );

    expect(entries.map((entry) => entry.name)).toEqual([
      'icons/icon16.png',
      'THIRD_PARTY_LICENSES',
    ]);
  });

  it('is the same archive twice over', () => {
    const files = [{ name: 'manifest.json', contents: Buffer.from('{}') }];

    expect(zip(files)).toEqual(zip(files));
  });

  it('writes an empty archive rather than refusing one', () => {
    expect(read(zip([]))).toEqual([]);
  });
});
