import { type Measurement, releaseOf, type VisitImage } from '../lib/types'
import { skyToPix, tanDeproject, waveAt } from './fits'
import { OffDetectorError, readWindow } from './spherexFile'

const MIN_GOOD_PIXELS = 5
const measureCache = new Map<string, Measurement>()

/**
 * Quick-look surface brightness at (ra, dec) in one SPHEREx exposure: mean of
 * the unflagged pixels in a 3×3 box, after subtracting the pipeline's
 * zodiacal-light model. Not aperture photometry.
 */
export async function measurePoint(url: string, ra: number, dec: number): Promise<Measurement> {
  const key = `${url}|${ra.toFixed(5)}|${dec.toFixed(5)}`
  const cached = measureCache.get(key)
  if (cached) return cached
  let result: Measurement
  try {
    const win = await readWindow(url, ra, dec, 1, true)
    let sum = 0
    let varSum = 0
    let n = 0
    for (let k = 0; k < win.image.length; k++) {
      const v = win.image[k]
      const vv = win.variance?.[k] ?? NaN
      if (!Number.isFinite(v) || !Number.isFinite(vv)) continue
      sum += v
      varSum += vv
      n++
    }
    if (!win.spectral || !win.waveTable) {
      result = { status: 'error', url, message: 'No spectral WCS in this file' }
    } else if (n < MIN_GOOD_PIXELS) {
      result = { status: 'flagged', url, message: `Only ${n} of 9 pixels usable (quality flags)` }
    } else {
      const { wavelength, bandwidth } = waveAt(win.spectral, win.waveTable, win.target[0], win.target[1])
      result = {
        status: 'ok',
        url,
        release: releaseOf(url),
        obsId: win.obsId,
        detector: win.detector,
        dateObs: win.dateObs,
        wavelength,
        bandwidth,
        surfaceBrightness: sum / n,
        uncertainty: Math.sqrt(varSum) / n,
        goodPixels: n,
        edgePx: win.edgePx,
      }
    }
  } catch (e) {
    if (e instanceof OffDetectorError) result = { status: 'off-image', url, message: e.message }
    else return { status: 'error', url, message: (e as Error).message } // not cached: may be transient
  }
  if (measureCache.size > 5000) measureCache.clear()
  measureCache.set(key, result)
  return result
}

function toBase64(a: Float32Array): string {
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
}

/**
 * Resamples one exposure onto a common north-up grid centred on (ra, dec), so
 * two visits can be shown side by side, blinked or differenced pixel-for-pixel.
 */
const visitCache = new Map<string, Promise<VisitImage>>()

export function visitImage(url: string, ra: number, dec: number, n: number, scaleArcsec: number): Promise<VisitImage> {
  const key = `${url}|${ra.toFixed(5)}|${dec.toFixed(5)}|${n}|${scaleArcsec}`
  let p = visitCache.get(key)
  if (!p) {
    p = buildVisitImage(url, ra, dec, n, scaleArcsec)
    p.catch(() => visitCache.delete(key))
    if (visitCache.size > 200) visitCache.delete(visitCache.keys().next().value as string)
    visitCache.set(key, p)
  }
  return p
}

async function buildVisitImage(url: string, ra: number, dec: number, n: number, scaleArcsec: number): Promise<VisitImage> {
  // Large enough to cover the rotated output grid.
  const half = Math.ceil((n / 2) * Math.SQRT2 * (scaleArcsec / 6.15)) + 3
  const win = await readWindow(url, ra, dec, half, false)
  if (!win.spectral || !win.waveTable) throw new Error('No spectral WCS in this file')

  const pixels = new Float32Array(n * n).fill(NaN)
  const wavelengths = new Float32Array(n * n).fill(NaN)
  const scaleDeg = scaleArcsec / 3600
  const sample = (fx: number, fy: number): number => {
    // fx, fy: 0-based window coordinates
    const ix = Math.floor(fx)
    const iy = Math.floor(fy)
    if (ix < 0 || iy < 0 || ix + 1 >= win.w || iy + 1 >= win.h) return NaN
    const dx = fx - ix
    const dy = fy - iy
    const at = (i: number, j: number) => win.image[j * win.w + i]
    const v00 = at(ix, iy), v10 = at(ix + 1, iy), v01 = at(ix, iy + 1), v11 = at(ix + 1, iy + 1)
    if ([v00, v10, v01, v11].some((v) => !Number.isFinite(v))) {
      // fall back to nearest pixel so isolated flags do not punch large holes
      return at(Math.round(fx), Math.round(fy))
    }
    return v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy
  }

  for (let j = 0; j < n; j++) {
    const eta = (n / 2 - j - 0.5) * scaleDeg // row 0 = north
    for (let i = 0; i < n; i++) {
      const xi = (n / 2 - i - 0.5) * scaleDeg // column 0 = east
      const [pra, pdec] = tanDeproject(xi, eta, ra, dec)
      const p = skyToPix(win.wcs, pra, pdec)
      if (!p) continue
      const k = j * n + i
      pixels[k] = sample(p[0] - win.x0, p[1] - win.y0)
      wavelengths[k] = waveAt(win.spectral, win.waveTable, p[0], p[1]).wavelength
    }
  }
  const centre = waveAt(win.spectral, win.waveTable, win.target[0], win.target[1])
  return {
    url,
    obsId: win.obsId,
    detector: win.detector,
    dateObs: win.dateObs,
    n,
    scaleArcsec,
    pixels: toBase64(pixels),
    wavelengths: toBase64(wavelengths),
    waveAtCenter: centre.wavelength,
    bandwidthAtCenter: centre.bandwidth,
  }
}

