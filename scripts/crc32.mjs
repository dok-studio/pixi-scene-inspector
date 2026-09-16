/**
 * CRC-32, the one both PNG and ZIP ask for.
 *
 * The same polynomial under two names: PNG calls it the chunk CRC, ZIP calls it
 * the entry CRC, and both mean IEEE 802.3 reflected, started at all ones and
 * inverted at the end. It lives here rather than in either writer because the
 * two would otherwise carry the same table twice, and a checksum that differs
 * between two copies of itself is the kind of bug that surfaces only in the
 * tool that reads the file.
 */

const TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }

  return table;
})();

/**
 * @param {Uint8Array} bytes
 * @returns {number} the checksum, as an unsigned 32-bit integer.
 */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const byte of bytes) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
