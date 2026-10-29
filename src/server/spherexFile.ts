// Reads small pixel windows out of full SPHEREx L2 files (~65 MB each) with
// HTTP Range requests, so a measurement costs ~100 KB instead of a download.
import {
  BLOCK, badFlagMask, type CelestialWcs, type Header, num, optNum, paddedDataSize, parseHeader, readCelestialWcs,
  readSpectralWcs, readWaveTable, skyToPix, type SpectralWcs, str, type WaveTable,
} from './fits'
import { riceDecompress32 } from './rice'

const URL_RE = /^https:\/\/irsa\.ipac\.caltech\.edu\/ibe\/data\/spherex\/[\w./-]+\.fits$/
export const isSpherexFitsUrl = (u: string) => URL_RE.test(u)

const HEAD_BYTES = 12 * BLOCK // primary + IMAGE header (~9 blocks); retried larger if needed
const TIMEOUT_MS = 30_000
const MAX_CONCURRENT = 12

// ---------- polite concurrency + range fetching ----------

let active = 0
const queue: (() => void)[] = []
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((r) => queue.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    queue.shift()?.()
  }
}

type Range = [start: number, endInclusive: number]

function indexOf(hay: Uint8Array, needle: Uint8Array, from: number): number {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

const enc = new TextEncoder()
const dec = new TextDecoder()

/** Parses a multipart/byteranges body into [start, bytes] parts. */
function parseMultipart(body: Uint8Array, boundary: string): { start: number; bytes: Uint8Array }[] {
  const marker = enc.encode(`--${boundary}`)
  const crlf2 = enc.encode('\r\n\r\n')
  const parts: { start: number; bytes: Uint8Array }[] = []
  let pos = indexOf(body, marker, 0)
  while (pos >= 0) {
    const afterMarker = pos + marker.length
    if (body[afterMarker] === 45 && body[afterMarker + 1] === 45) break // "--" terminator
    const headEnd = indexOf(body, crlf2, afterMarker)
    if (headEnd < 0) break
    const head = dec.decode(body.subarray(afterMarker, headEnd))
    const m = /content-range:\s*bytes\s+(\d+)-(\d+)\//i.exec(head)
    if (!m) throw new Error('Multipart part without Content-Range')
    const start = Number(m[1])
    const len = Number(m[2]) - start + 1
    const bodyStart = headEnd + crlf2.length
    parts.push({ start, bytes: body.subarray(bodyStart, bodyStart + len) })
    pos = indexOf(body, marker, bodyStart + len)
  }
  return parts
}

/** Fetches byte ranges; returns one buffer per requested range plus the total file size. */
async function fetchRanges(url: string, ranges: Range[]): Promise<{ parts: Uint8Array[]; total: number | null }> {
  return withSlot(async () => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        headers: { Range: `bytes=${ranges.map(([a, b]) => `${a}-${b}`).join(',')}` },
        signal: ctrl.signal,
      })
      if (res.status !== 206) {
        await res.body?.cancel()
        throw new Error(`IRSA returned HTTP ${res.status} for a range request`)
      }
      const body = new Uint8Array(await res.arrayBuffer())
      const type = res.headers.get('content-type') ?? ''
      let got: { start: number; bytes: Uint8Array }[]
      let total: number | null = null
      if (type.startsWith('multipart/byteranges')) {
        const boundary = /boundary=("?)([^";]+)\1/.exec(type)?.[2]
        if (!boundary) throw new Error('Multipart response without boundary')
        got = parseMultipart(body, boundary)
      } else {
        const m = /bytes\s+(\d+)-\d+\/(\d+|\*)/.exec(res.headers.get('content-range') ?? '')
        got = [{ start: m ? Number(m[1]) : ranges[0][0], bytes: body }]
        total = m && m[2] !== '*' ? Number(m[2]) : null
      }
      // Servers may merge adjacent ranges; slice each request out of whichever part holds it.
      const parts = ranges.map(([a, b]) => {
        const p = got.find((g) => g.start <= a && g.start + g.bytes.length > b)
        if (!p) throw new Error(`Range ${a}-${b} missing from response`)
        return p.bytes.subarray(a - p.start, b - p.start + 1)
      })
      return { parts, total }
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('IRSA range request timed out')
      throw e
    } finally {
      clearTimeout(timer)
    }
  })
}

// ---------- per-file headers and layout ----------

type FileHead = {
  total: number
  imageHeader: Header
  imageDataStart: number
  dataSize: number
  wcs: CelestialWcs
  spectral: SpectralWcs | null
  width: number
  height: number
  waveKey: string
}

const headCache = new Map<string, Promise<FileHead>>()
const waveCache = new Map<string, WaveTable>()
// Header lengths learned from earlier files. They are constant within a
// pipeline version (e.g. "l2b-v27"), so later files skip the header walk.
type HdrGuess = { flags: number; variance: number; zodi: number }
const hdrGuesses = new Map<string, HdrGuess>()
function guessFor(url: string): HdrGuess {
  const key = /l2b-v\d+/.exec(url)?.[0] ?? 'default'
  let g = hdrGuesses.get(key)
  if (!g) {
    g = { flags: 17280, variance: 11520, zodi: 11520 }
    hdrGuesses.set(key, g)
  }
  return g
}

function remember<K, V>(map: Map<K, V>, key: K, value: V, max = 500) {
  if (map.size >= max) map.delete(map.keys().next().value as K)
  map.set(key, value)
}

async function loadHead(url: string): Promise<FileHead> {
  let { parts, total } = await fetchRanges(url, [[0, HEAD_BYTES - 1]])
  let buf = parts[0]
  const primary = parseHeader(buf, 0)
  if (!primary) throw new Error('Primary header not found')
  let image = parseHeader(buf, primary.length)
  if (!image) {
    ;({ parts, total } = await fetchRanges(url, [[0, 4 * HEAD_BYTES - 1]]))
    buf = parts[0]
    image = parseHeader(buf, primary.length)
  }
  if (!image || image.header.cards.get('EXTNAME') !== 'IMAGE') throw new Error('IMAGE header not found')
  if (total == null) throw new Error('File size unknown')
  const h = image.header
  const calib = h.history.filter((l) => l.includes('spectral_wcs')).at(-1) ?? url
  return {
    total,
    imageHeader: h,
    imageDataStart: primary.length + image.length,
    dataSize: paddedDataSize(h),
    wcs: readCelestialWcs(h),
    spectral: readSpectralWcs(h),
    width: num(h, 'NAXIS1'),
    height: num(h, 'NAXIS2'),
    waveKey: `${h.cards.get('DETECTOR')}|${calib}`,
  }
}

function getHead(url: string): Promise<FileHead> {
  let p = headCache.get(url)
  if (!p) {
    p = loadHead(url)
    p.catch(() => headCache.delete(url))
    remember(headCache, url, p)
  }
  return p
}

// ---------- public: pixel windows ----------

export type PixelWindow = {
  /** 1-based full-image pixel of window element [0, 0] */
  x0: number
  y0: number
  w: number
  h: number
  /** Surface brightness minus the zodiacal-light model, MJy/sr; NaN where flagged or off-detector */
  image: Float32Array
  variance: Float32Array | null
  /** Target position in 1-based full-image pixels */
  target: [number, number]
  /** Distance of the target from the nearest detector edge, pixels */
  edgePx: number
  wcs: CelestialWcs
  spectral: SpectralWcs | null
  waveTable: WaveTable | null
  dateObs: string | null
  obsId: string | null
  detector: number | null
}

export class OffDetectorError extends Error {}

const rowRange = (dataStart: number, width: number, y0: number, y1: number): Range => [
  dataStart + (y0 - 1) * width * 4,
  dataStart + y1 * width * 4 - 1,
]

const HDR_CHUNK = 12 * BLOCK

function expectHeader(buf: Uint8Array, name: string): { header: Header; length: number } {
  const parsed = parseHeader(buf)
  if (!parsed || parsed.header.cards.get('EXTNAME') !== name) throw new Error(`${name} header not found where expected`)
  return parsed
}

/**
 * Reads a (2·half+1)² window centred on (ra, dec) from IMAGE, FLAGS, ZODI and
 * optionally VARIANCE. Three HTTP requests per file in the usual case.
 */
export async function readWindow(url: string, ra: number, dec: number, half: number, wantVariance: boolean): Promise<PixelWindow> {
  if (!isSpherexFitsUrl(url)) throw new Error('Not a SPHEREx archive file URL')
  const head = await getHead(url)
  const target = skyToPix(head.wcs, ra, dec)
  if (!target) throw new OffDetectorError('Position is not on this image')
  const [tx, ty] = target
  const cx = Math.round(tx)
  const cy = Math.round(ty)
  if (cx < 1 || cy < 1 || cx > head.width || cy > head.height) throw new OffDetectorError('Position is not on this image')

  const x0 = cx - half
  const y0 = cy - half
  const size = 2 * half + 1
  const W = head.width
  const D = head.dataSize
  const ry0 = Math.max(1, y0)
  const ry1 = Math.min(head.height, y0 + size - 1)
  const nRows = ry1 - ry0 + 1
  const needWave = head.spectral != null && !waveCache.has(head.waveKey)
  const hdrGuess = guessFor(url)

  // Request 1: IMAGE rows, FLAGS header + row descriptors, (wavelength table).
  const flagsStart = head.imageDataStart + D
  const descRange = (hdrLen: number): Range => [flagsStart + hdrLen + (ry0 - 1) * 8, flagsStart + hdrLen + ry1 * 8 - 1]
  const r1 = await fetchRanges(url, [
    rowRange(head.imageDataStart, W, ry0, ry1),
    [flagsStart, flagsStart + HDR_CHUNK - 1],
    descRange(hdrGuess.flags),
    ...(needWave ? [[head.total - 4 * BLOCK, head.total - 1] as Range] : []),
  ])
  const imgRows = r1.parts[0]
  if (needWave) cacheWave(head.waveKey, r1.parts[3])
  const flags = expectHeader(r1.parts[1], 'FLAGS')
  let descriptors = r1.parts[2]
  if (flags.length !== hdrGuess.flags) {
    hdrGuess.flags = flags.length
    descriptors = (await fetchRanges(url, [descRange(flags.length)])).parts[0]
  }

  // Request 2: FLAGS rows (tile-compressed in newer releases, a plain image in
  // older ones), VARIANCE and ZODI headers + rows.
  const fh = flags.header
  const compressed = fh.cards.get('ZIMAGE') === true
  let flagSource: Range
  let tiles: { n: number; off: number }[] = []
  let heapLo = 0
  if (compressed) {
    if (fh.cards.get('ZCMPTYPE') !== 'RICE_1' || num(fh, 'ZTILE2') !== 1 || num(fh, 'ZTILE1') !== W || num(fh, 'ZBITPIX') !== 32) {
      throw new Error('Unsupported FLAGS compression layout')
    }
    const tableStart = flagsStart + flags.length
    const heapStart = tableStart + (optNum(fh, 'THEAP') ?? num(fh, 'NAXIS1') * num(fh, 'NAXIS2'))
    const dv = new DataView(descriptors.buffer, descriptors.byteOffset, descriptors.byteLength)
    tiles = Array.from({ length: nRows }, (_, k) => ({ n: dv.getInt32(k * 8), off: dv.getInt32(k * 8 + 4) }))
    heapLo = Math.min(...tiles.map((t) => t.off))
    const heapHi = Math.max(...tiles.map((t) => t.off + t.n))
    flagSource = [heapStart + heapLo, heapStart + heapHi - 1]
  } else {
    if (num(fh, 'BITPIX') !== 32 || num(fh, 'NAXIS1') !== W) throw new Error('Unsupported FLAGS layout')
    flagSource = rowRange(flagsStart + flags.length, W, ry0, ry1)
  }
  const varStart = flagsStart + flags.length + paddedDataSize(fh)

  const plan = (lv: number, lz: number) => {
    const zodiStart = varStart + lv + D
    return [
      flagSource,
      [varStart, varStart + HDR_CHUNK - 1] as Range,
      [zodiStart, zodiStart + HDR_CHUNK - 1] as Range,
      rowRange(zodiStart + lz, W, ry0, ry1),
      ...(wantVariance ? [rowRange(varStart + lv, W, ry0, ry1)] : []),
    ]
  }
  let r2 = await fetchRanges(url, plan(hdrGuess.variance, hdrGuess.zodi))
  const vh = expectHeader(r2.parts[1], 'VARIANCE')
  let zh = parseHeader(r2.parts[2])
  if (vh.length !== hdrGuess.variance || !zh || zh.header.cards.get('EXTNAME') !== 'ZODI' || zh.length !== hdrGuess.zodi) {
    // Layout differs from the learned one: locate ZODI from the real VARIANCE header length and retry once.
    hdrGuess.variance = vh.length
    const zodiStart = varStart + vh.length + D
    zh = expectHeader((await fetchRanges(url, [[zodiStart, zodiStart + HDR_CHUNK - 1]])).parts[0], 'ZODI')
    hdrGuess.zodi = zh.length
    r2 = await fetchRanges(url, plan(vh.length, zh.length))
  }
  const flagBytes = r2.parts[0]
  const zodiRows = r2.parts[3]
  const varRows = wantVariance ? r2.parts[4] : null

  const nblock = optNum(fh, 'ZVAL1') ?? 32
  const flagRows = compressed
    ? tiles.map((t) => riceDecompress32(flagBytes.subarray(t.off - heapLo, t.off - heapLo + t.n), W, nblock))
    : Array.from({ length: nRows }, (_, k) => {
        const dv = new DataView(flagBytes.buffer, flagBytes.byteOffset + k * W * 4, W * 4)
        return Int32Array.from({ length: W }, (_, i) => dv.getInt32(i * 4))
      })

  const bad = badFlagMask(fh)
  const image = new Float32Array(size * size).fill(NaN)
  const variance = wantVariance ? new Float32Array(size * size).fill(NaN) : null
  const view = (u: Uint8Array) => new DataView(u.buffer, u.byteOffset, u.byteLength)
  const img = view(imgRows)
  const zod = view(zodiRows)
  const vr = varRows ? view(varRows) : null
  for (let j = 0; j < size; j++) {
    const y = y0 + j
    if (y < ry0 || y > ry1) continue
    const flagRow = flagRows[y - ry0]
    for (let i = 0; i < size; i++) {
      const x = x0 + i
      if (x < 1 || x > W) continue
      if (flagRow[x - 1] & bad) continue
      const off = ((y - ry0) * W + (x - 1)) * 4
      const v = img.getFloat32(off) - zod.getFloat32(off)
      if (!Number.isFinite(v)) continue
      image[j * size + i] = v
      if (variance && vr) variance[j * size + i] = vr.getFloat32(off)
    }
  }

  return {
    x0,
    y0,
    w: size,
    h: size,
    image,
    variance,
    target,
    edgePx: Math.min(tx - 1, ty - 1, head.width - tx, head.height - ty),
    wcs: head.wcs,
    spectral: head.spectral,
    waveTable: waveCache.get(head.waveKey) ?? null,
    dateObs: str(head.imageHeader, 'DATE-AVG') ?? str(head.imageHeader, 'DATE-OBS') ?? null,
    obsId: str(head.imageHeader, 'OBSID') ?? null,
    detector: (head.imageHeader.cards.get('DETECTOR') as number) ?? null,
  }
}

/** Finds the WCS-WAVE table among the final blocks of the file. */
function cacheWave(key: string, tail: Uint8Array) {
  for (let pos = 0; pos + BLOCK <= tail.length; pos += BLOCK) {
    if (dec.decode(tail.subarray(pos, pos + 8)) !== 'XTENSION') continue
    const parsed = parseHeader(tail, pos)
    if (!parsed || parsed.header.cards.get('EXTNAME') !== 'WCS-WAVE') continue
    const start = pos + parsed.length
    const size = paddedDataSize(parsed.header)
    remember(waveCache, key, readWaveTable(parsed.header, tail.subarray(start, start + size)), 50)
    return
  }
  throw new Error('WCS-WAVE table not found at end of file')
}
