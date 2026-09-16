import { deflateRawSync } from 'node:zlib';

import { crc32 } from './crc32.mjs';

/**
 * A minimal ZIP writer, enough for an extension package.
 *
 * Written rather than installed for the same reason as the PNG encoder beside
 * it: one archive, produced by one script, a handful of times a year. The
 * format is old and small — a header per entry, a directory at the end, and
 * offsets that have to agree — and the reader that matters is strict enough to
 * say so.
 *
 * Two deliberate omissions. **ZIP64** is not implemented: the package is under
 * two megabytes and the store's own limit is 2 GB, so the 32-bit fields are
 * never close to overflowing, and an archive that quietly truncated would be
 * worse than one that refuses. **Timestamps** are fixed at the epoch of the DOS
 * date field rather than taken from the clock, so that building the same commit
 * twice produces the same bytes; nothing downstream reads them.
 */

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

/** Written by a PKZip 2.0-era writer, which is what these headers are. */
const VERSION = 20;

/** 1980-01-01 00:00, the earliest the DOS date field can express. */
const DOS_TIME = 0;
const DOS_DATE = (1 << 5) | 1;

const DEFLATED = 8;
const STORED = 0;

/** Bit 11: the name is UTF-8 rather than the format's original code page. */
const UTF8_NAME = 0x0800;

/**
 * @param {string} name the path inside the archive, with forward slashes.
 * @param {Buffer} contents
 */
function entry(name, contents) {
  const nameBytes = Buffer.from(name, 'utf8');
  const deflated = deflateRawSync(contents, { level: 9 });

  // Storing beats deflating when the input is already compressed — a PNG, or
  // the JavaScript the store will serve compressed anyway. Picking the smaller
  // of the two is one comparison and needs no table of extensions.
  const smaller = deflated.length < contents.length;

  return {
    nameBytes,
    // Only names that need the flag carry it, so an all-ASCII archive is
    // byte-identical to what a writer without the flag would produce.
    flags: nameBytes.equals(Buffer.from(name, 'latin1')) ? 0 : UTF8_NAME,
    method: smaller ? DEFLATED : STORED,
    body: smaller ? deflated : contents,
    crc: crc32(contents),
    size: contents.length,
  };
}

/**
 * Builds an archive from files already in memory.
 *
 * Entries are written in the order given; the caller sorts. `manifest.json`
 * has to sit at the archive's root — Chrome rejects a package wrapped in a
 * directory — which is a property of the names passed in, not of this writer.
 *
 * @param {{ name: string, contents: Buffer }[]} files
 * @returns {Buffer}
 */
export function zip(files) {
  const parts = [];
  const directory = [];
  let offset = 0;

  for (const file of files) {
    const { nameBytes, flags, method, body, crc, size } = entry(file.name, file.contents);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL, 0);
    local.writeUInt16LE(VERSION, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // no extra field

    const header = Buffer.alloc(46);
    header.writeUInt32LE(CENTRAL, 0);
    header.writeUInt16LE(VERSION, 4); // version made by
    header.writeUInt16LE(VERSION, 6); // version needed
    header.writeUInt16LE(flags, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(DOS_TIME, 12);
    header.writeUInt16LE(DOS_DATE, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.length, 20);
    header.writeUInt32LE(size, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt16LE(0, 30); // no extra field
    header.writeUInt16LE(0, 32); // no comment
    header.writeUInt16LE(0, 34); // first and only disk
    header.writeUInt16LE(0, 36); // internal attributes
    header.writeUInt32LE(0, 38); // external attributes
    header.writeUInt32LE(offset, 42);

    parts.push(local, nameBytes, body);
    directory.push(header, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }

  const central = Buffer.concat(directory);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(END, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk the directory starts on
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // no comment

  return Buffer.concat([...parts, central, end]);
}
