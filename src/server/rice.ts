// RICE_1 decompression for 32-bit integer tiles (FITS tiled image convention),
// ported from CFITSIO's fits_rdecomp. JS bitwise ops are 32-bit signed, so the
// bit buffer is kept as a plain number and shifted with arithmetic.

const FSBITS = 5
const FSMAX = 25
const BBITS = 32

const POW2 = Array.from({ length: 64 }, (_, i) => 2 ** i)

// Number of significant bits in each byte value (0 → 0, 1 → 1, 255 → 8).
const NONZERO_COUNT = Array.from({ length: 256 }, (_, b) => (b === 0 ? 0 : Math.floor(Math.log2(b)) + 1))

const unzigzag = (d: number) => (d % 2 === 0 ? d / 2 : -(d + 1) / 2)

export function riceDecompress32(c: Uint8Array, nx: number, nblock: number): Int32Array {
  const out = new Int32Array(nx)
  if (c.length < 4) throw new Error('Rice tile too short')
  let p = 0
  let lastpix = ((c[0] << 24) | (c[1] << 16) | (c[2] << 8) | c[3]) | 0
  p = 4
  let b = c[p++]
  let nbits = 8
  const next = () => {
    if (p >= c.length) throw new Error('Rice tile truncated')
    return c[p++]
  }

  for (let i = 0; i < nx; ) {
    nbits -= FSBITS
    while (nbits < 0) {
      b = b * 256 + next()
      nbits += 8
    }
    const fs = Math.floor(b / POW2[nbits]) - 1
    b %= POW2[nbits]
    const imax = Math.min(i + nblock, nx)

    if (fs < 0) {
      for (; i < imax; i++) out[i] = lastpix
    } else if (fs === FSMAX) {
      for (; i < imax; i++) {
        let k = BBITS - nbits
        let diff = b * POW2[k]
        for (k -= 8; k >= 0; k -= 8) diff += next() * POW2[k]
        if (nbits > 0) {
          const nb = next()
          diff += Math.floor(nb / POW2[-k])
          b = nb % POW2[nbits]
        } else {
          b = 0
        }
        lastpix = (unzigzag(diff) + lastpix) | 0
        out[i] = lastpix
      }
    } else {
      for (; i < imax; i++) {
        while (b === 0) {
          nbits += 8
          b = next()
        }
        // b < 2^nbits here; count leading zeros of the unary prefix.
        const nzero = nbits - (b >= 256 ? Math.floor(Math.log2(b)) + 1 : NONZERO_COUNT[b])
        nbits -= nzero + 1
        b -= POW2[nbits] // clear the terminating 1 bit
        nbits -= fs
        while (nbits < 0) {
          b = b * 256 + next()
          nbits += 8
        }
        const diff = nzero * POW2[fs] + Math.floor(b / POW2[nbits])
        b %= POW2[nbits]
        lastpix = (unzigzag(diff) + lastpix) | 0
        out[i] = lastpix
      }
    }
  }
  return out
}
