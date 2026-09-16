import { deflateSync } from 'node:zlib';

import { crc32 } from '../crc32.mjs';

/**
 * A minimal PNG encoder: 8-bit RGBA, no interlacing, filter type 0.
 *
 * Written rather than installed because the alternative is a native dependency
 * (node-canvas, sharp) in a workspace that otherwise has none, carried for a
 * script that runs a handful of times in the life of the project. The format's
 * own specification is strict enough that there is little room to be subtly
 * wrong, and the result is checked by the first browser that opens it.
 */

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length, 0);

  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);

  return Buffer.concat([head, typed, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba tightly packed, `width * height * 4` bytes.
 * @returns {Buffer}
 */
export function encodePng(width, height, rgba) {
  const expected = width * height * 4;
  if (rgba.length !== expected) {
    throw new Error(`pixel buffer is ${rgba.length} bytes, expected ${expected}`);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: truecolour with alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte per scanline. Filter 0 (none) keeps the encoder honest and
  // costs a little size; these sheets are a few kilobytes either way.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Reads back what `encodePng` writes, far enough to verify it. Used by tests. */
export function readPngHeader(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG: bad signature');

  const chunks = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    const stored = buffer.readUInt32BE(offset + 8 + length);
    const actual = crc32(buffer.subarray(offset + 4, offset + 8 + length));

    if (stored !== actual) throw new Error(`chunk ${type} has a bad CRC`);

    chunks.push({ type, body });
    offset += 12 + length;
  }

  const ihdr = chunks.find((entry) => entry.type === 'IHDR');
  if (ihdr === undefined) throw new Error('no IHDR');

  return {
    width: ihdr.body.readUInt32BE(0),
    height: ihdr.body.readUInt32BE(4),
    bitDepth: ihdr.body[8],
    colorType: ihdr.body[9],
    chunks: chunks.map((entry) => entry.type),
  };
}
