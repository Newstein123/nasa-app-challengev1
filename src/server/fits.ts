// Minimal FITS support for SPHEREx Level-2 spectral images: header parsing,
// one-row binary tables, TAN-SIP celestial WCS and the WAVE-TAB wavelength
// lookup. Only what this app needs; not a general FITS library.

export const BLOCK = 2880
const CARD = 80

export type HeaderValue = string | number | boolean
export type Header = { cards: Map<string, HeaderValue>; history: string[] }

const decoder = new TextDecoder('ascii')

function parseValue(raw: string): HeaderValue {
  const s = raw.trimStart()
  if (s.startsWith("'")) {
    let out = ''
    for (let i = 1; i < s.length; i++) {
      if (s[i] === "'") {
        if (s[i + 1] === "'") {
          out += "'"
          i++
          continue
        }
        break
      }
      out += s[i]
    }
    return out.trimEnd()
  }
  const v = s.split('/')[0].trim()
  if (v === 'T') return true
  if (v === 'F') return false
  const n = Number(v.replace(/D/i, 'E'))
  return Number.isFinite(n) && v !== '' ? n : v
}

/**
 * Parses a header starting at `offset`. Returns null if END is not inside the
 * buffer (caller should fetch more bytes). `length` includes block padding.
 */
export function parseHeader(buf: Uint8Array, offset = 0): { header: Header; length: number } | null {
  const cards = new Map<string, HeaderValue>()
  const history: string[] = []
  for (let pos = offset; pos + CARD <= buf.length; pos += CARD) {
    const card = decoder.decode(buf.subarray(pos, pos + CARD))
    const key = card.slice(0, 8).trim()
    if (key === 'END') {
      const used = pos + CARD - offset
      return { header: { cards, history }, length: Math.ceil(used / BLOCK) * BLOCK }
    }
    if (key === 'HISTORY') history.push(card.slice(8).trim())
    else if (card.slice(8, 10) === '= ') cards.set(key, parseValue(card.slice(10)))
  }
  return null
}

export function num(h: Header, key: string): number {
  const v = h.cards.get(key)
  if (typeof v !== 'number') throw new Error(`FITS header missing numeric ${key}`)
  return v
}

export function optNum(h: Header, key: string): number | undefined {
  const v = h.cards.get(key)
  return typeof v === 'number' ? v : undefined
}

export function str(h: Header, key: string): string | undefined {
  const v = h.cards.get(key)
  return typeof v === 'string' ? v : undefined
}

/** Size of the HDU data section in bytes, including block padding. */
export function paddedDataSize(h: Header): number {
  const naxis = num(h, 'NAXIS')
  if (naxis === 0) return 0
  let n = 1
  for (let i = 1; i <= naxis; i++) n *= num(h, `NAXIS${i}`)
  const bytes = (Math.abs(num(h, 'BITPIX')) / 8) * (optNum(h, 'GCOUNT') ?? 1) * ((optNum(h, 'PCOUNT') ?? 0) + n)
  return Math.ceil(bytes / BLOCK) * BLOCK
}

// ---------- binary tables (single row, big-endian) ----------

const TFORM_BYTES: Record<string, number> = { L: 1, B: 1, I: 2, J: 4, K: 8, E: 4, D: 8, A: 1 }

/** Reads row 1 of a BINTABLE as typed arrays keyed by TTYPE. */
export function readTableRow(h: Header, data: Uint8Array): Record<string, number[]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const out: Record<string, number[]> = {}
  let pos = 0
  for (let i = 1; i <= num(h, 'TFIELDS'); i++) {
    const name = str(h, `TTYPE${i}`) ?? `COL${i}`
    const m = /^(\d*)([A-Z])/.exec(str(h, `TFORM${i}`) ?? '')
    if (!m) throw new Error(`Unsupported TFORM for ${name}`)
    const count = m[1] ? Number(m[1]) : 1
    const code = m[2]
    const vals: number[] = []
    for (let k = 0; k < count; k++) {
      const p = pos + k * TFORM_BYTES[code]
      if (code === 'J') vals.push(view.getInt32(p))
      else if (code === 'E') vals.push(view.getFloat32(p))
      else if (code === 'D') vals.push(view.getFloat64(p))
      else if (code === 'I') vals.push(view.getInt16(p))
      else if (code === 'K') vals.push(Number(view.getBigInt64(p)))
      else vals.push(view.getUint8(p))
    }
    out[name] = vals
    pos += count * TFORM_BYTES[code]
  }
  return out
}

// ---------- celestial WCS: TAN with SIP distortion ----------

type Poly = { order: number; c: number[][] } // c[i][j] multiplies u^i v^j

export type CelestialWcs = {
  crpix: [number, number]
  crval: [number, number]
  cd: [[number, number], [number, number]]
  cdInv: [[number, number], [number, number]]
  a: Poly | null
  b: Poly | null
  ap: Poly | null
  bp: Poly | null
}

function readPoly(h: Header, name: string): Poly | null {
  const order = optNum(h, `${name}_ORDER`)
  if (order == null) return null
  const c = Array.from({ length: order + 1 }, (_, i) =>
    Array.from({ length: order + 1 }, (_, j) => (i + j <= order ? optNum(h, `${name}_${i}_${j}`) ?? 0 : 0)),
  )
  return { order, c }
}

function evalPoly(p: Poly | null, u: number, v: number): number {
  if (!p) return 0
  let sum = 0
  for (let i = 0; i <= p.order; i++) {
    const ui = u ** i
    for (let j = 0; j + i <= p.order; j++) if (p.c[i][j] !== 0) sum += p.c[i][j] * ui * v ** j
  }
  return sum
}

export function readCelestialWcs(h: Header): CelestialWcs {
  const ctype1 = str(h, 'CTYPE1') ?? ''
  if (!ctype1.startsWith('RA---TAN')) throw new Error(`Unsupported projection ${ctype1}`)
  const cdelt1 = optNum(h, 'CDELT1') ?? 1
  const cdelt2 = optNum(h, 'CDELT2') ?? 1
  const cd: CelestialWcs['cd'] =
    optNum(h, 'CD1_1') != null
      ? [
          [num(h, 'CD1_1'), optNum(h, 'CD1_2') ?? 0],
          [optNum(h, 'CD2_1') ?? 0, num(h, 'CD2_2')],
        ]
      : [
          [cdelt1 * (optNum(h, 'PC1_1') ?? 1), cdelt1 * (optNum(h, 'PC1_2') ?? 0)],
          [cdelt2 * (optNum(h, 'PC2_1') ?? 0), cdelt2 * (optNum(h, 'PC2_2') ?? 1)],
        ]
  const det = cd[0][0] * cd[1][1] - cd[0][1] * cd[1][0]
  const cdInv: CelestialWcs['cdInv'] = [
    [cd[1][1] / det, -cd[0][1] / det],
    [-cd[1][0] / det, cd[0][0] / det],
  ]
  const sip = ctype1.endsWith('-SIP')
  return {
    crpix: [num(h, 'CRPIX1'), num(h, 'CRPIX2')],
    crval: [num(h, 'CRVAL1'), num(h, 'CRVAL2')],
    cd,
    cdInv,
    a: sip ? readPoly(h, 'A') : null,
    b: sip ? readPoly(h, 'B') : null,
    ap: sip ? readPoly(h, 'AP') : null,
    bp: sip ? readPoly(h, 'BP') : null,
  }
}

const D2R = Math.PI / 180

/** Gnomonic projection of (ra, dec) about (ra0, dec0); returns intermediate coords in degrees, or null if behind the plane. */
export function tanProject(ra: number, dec: number, ra0: number, dec0: number): [number, number] | null {
  const d = dec * D2R
  const d0 = dec0 * D2R
  const dra = (ra - ra0) * D2R
  const cosc = Math.sin(d0) * Math.sin(d) + Math.cos(d0) * Math.cos(d) * Math.cos(dra)
  if (cosc <= 0) return null
  const xi = (Math.cos(d) * Math.sin(dra)) / cosc
  const eta = (Math.cos(d0) * Math.sin(d) - Math.sin(d0) * Math.cos(d) * Math.cos(dra)) / cosc
  return [xi / D2R, eta / D2R]
}

/** Inverse gnomonic projection; intermediate coords in degrees. */
export function tanDeproject(xiDeg: number, etaDeg: number, ra0: number, dec0: number): [number, number] {
  const xi = xiDeg * D2R
  const eta = etaDeg * D2R
  const d0 = dec0 * D2R
  const denom = Math.cos(d0) - eta * Math.sin(d0)
  const ra = ra0 + Math.atan2(xi, denom) / D2R
  const dec = Math.atan2(Math.sin(d0) + eta * Math.cos(d0), Math.hypot(xi, denom)) / D2R
  return [((ra % 360) + 360) % 360, dec]
}

/** Sky → 1-based FITS pixel coordinates. */
export function skyToPix(w: CelestialWcs, ra: number, dec: number): [number, number] | null {
  const p = tanProject(ra, dec, w.crval[0], w.crval[1])
  if (!p) return null
  const U = w.cdInv[0][0] * p[0] + w.cdInv[0][1] * p[1]
  const V = w.cdInv[1][0] * p[0] + w.cdInv[1][1] * p[1]
  return [U + evalPoly(w.ap, U, V) + w.crpix[0], V + evalPoly(w.bp, U, V) + w.crpix[1]]
}

/** 1-based FITS pixel → sky. */
export function pixToSky(w: CelestialWcs, x: number, y: number): [number, number] {
  const u = x - w.crpix[0]
  const v = y - w.crpix[1]
  const U = u + evalPoly(w.a, u, v)
  const V = v + evalPoly(w.b, u, v)
  const xi = w.cd[0][0] * U + w.cd[0][1] * V
  const eta = w.cd[1][0] * U + w.cd[1][1] * V
  return tanDeproject(xi, eta, w.crval[0], w.crval[1])
}

// ---------- spectral WCS: WAVE-TAB bilinear lookup (FITS Paper III §6.1) ----------

export type WaveTable = { x: number[]; y: number[]; values: number[] }

export type SpectralWcs = {
  /** Converts this file's 1-based pixel to the lookup table's index coordinate. */
  crpix: [number, number]
  crval: [number, number]
  cdelt: [number, number]
}

export function readSpectralWcs(h: Header): SpectralWcs | null {
  if (str(h, 'CTYPE1W') !== 'WAVE-TAB') return null
  return {
    crpix: [num(h, 'CRPIX1W'), num(h, 'CRPIX2W')],
    crval: [num(h, 'CRVAL1W'), num(h, 'CRVAL2W')],
    cdelt: [optNum(h, 'CDELT1W') ?? 1, optNum(h, 'CDELT2W') ?? 1],
  }
}

/** Fractional index of `v` in the monotonic control-point vector `pts`, clamped to its ends. */
function fracIndex(pts: number[], v: number): number {
  if (v <= pts[0]) return 0
  const last = pts.length - 1
  if (v >= pts[last]) return last
  let i = 0
  while (pts[i + 1] < v) i++
  const span = pts[i + 1] - pts[i]
  return i + (span === 0 ? 0 : (v - pts[i]) / span)
}

/** Central wavelength and bandwidth (µm) at a 1-based pixel of the file the spectral WCS came from. */
export function waveAt(sw: SpectralWcs, t: WaveTable, x: number, y: number): { wavelength: number; bandwidth: number } {
  const cx = sw.crval[0] + sw.cdelt[0] * (x - sw.crpix[0])
  const cy = sw.crval[1] + sw.cdelt[1] * (y - sw.crpix[1])
  const fi = fracIndex(t.x, cx)
  const fj = fracIndex(t.y, cy)
  const i0 = Math.min(Math.floor(fi), t.x.length - 2)
  const j0 = Math.min(Math.floor(fj), t.y.length - 2)
  const di = fi - i0
  const dj = fj - j0
  const nx = t.x.length
  // VALUES has FITS dims (2, nx, ny): component varies fastest.
  const at = (k: number, i: number, j: number) => t.values[k + 2 * (i + nx * j)]
  const lerp2 = (k: number) =>
    at(k, i0, j0) * (1 - di) * (1 - dj) +
    at(k, i0 + 1, j0) * di * (1 - dj) +
    at(k, i0, j0 + 1) * (1 - di) * dj +
    at(k, i0 + 1, j0 + 1) * di * dj
  return { wavelength: lerp2(0), bandwidth: lerp2(1) }
}

export function readWaveTable(h: Header, data: Uint8Array): WaveTable {
  const row = readTableRow(h, data)
  if (!row.X || !row.Y || !row.VALUES) throw new Error('WCS-WAVE table missing X/Y/VALUES columns')
  return { x: row.X, y: row.Y, values: row.VALUES }
}

// ---------- quality flags ----------

// Mask planes that make a pixel unusable for a quick-look measurement. Planes
// are looked up by name in each FLAGS header (MSKNnnnn / MSKMnnnn). DICHROIC
// (reduced but calibrated efficiency) and SOURCE are informational, not bad.
const BAD_PLANES = new Set([
  'TRANSIENT', 'OVERFLOW', 'SUR_ERROR', 'NONFUNC', 'MISSING_DATA', 'HOT', 'COLD',
  'NONLINEAR', 'PERSIST', 'OUTLIER', 'GHOST', 'GHOST_FPA', 'GHOST_EXT', 'STREAK', 'BLOOM', 'SNOWBALL', 'HALO',
])

export function badFlagMask(flagsHeader: Header): number {
  let mask = 0
  for (const [key, value] of flagsHeader.cards) {
    if (!key.startsWith('MSKN') || typeof value !== 'string') continue
    const bits = flagsHeader.cards.get(`MSKM${key.slice(4)}`)
    if (typeof bits === 'number' && BAD_PLANES.has(value.trim())) mask |= bits
  }
  return mask
}

// ---------- whole-file parsing (used for small files and tests) ----------

export type Hdu = { header: Header; dataOffset: number; dataSize: number }

export function listHdus(buf: Uint8Array): Hdu[] {
  const out: Hdu[] = []
  let pos = 0
  while (pos < buf.length) {
    const parsed = parseHeader(buf, pos)
    if (!parsed) break
    const dataOffset = pos + parsed.length
    const dataSize = paddedDataSize(parsed.header)
    out.push({ header: parsed.header, dataOffset, dataSize })
    pos = dataOffset + dataSize
  }
  return out
}

export function readFloatImage(buf: Uint8Array, hdu: Hdu): Float32Array {
  const w = num(hdu.header, 'NAXIS1')
  const h = num(hdu.header, 'NAXIS2')
  const view = new DataView(buf.buffer, buf.byteOffset + hdu.dataOffset, w * h * 4)
  const out = new Float32Array(w * h)
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat32(i * 4)
  return out
}
