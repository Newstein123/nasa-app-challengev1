// Client-side helpers for the point analysis: no network, no DOM.
import type { Measurement } from './types'

export type OkMeasurement = Extract<Measurement, { status: 'ok' }>

export const isOk = (m: Measurement): m is OkMeasurement => m.status === 'ok'

export function decodeFloat32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer)
}

/** Two visits see "the same colour" when their wavelengths differ by less than half a channel. */
export function wavelengthsMatch(la: number, ba: number, lb: number, bb: number): boolean {
  return Math.abs(la - lb) <= 0.5 * Math.min(ba, bb)
}

/** Measurements whose channel contains `wavelength` (|λ − λ_sel| ≤ bw/2). */
export function inChannel(ms: OkMeasurement[], wavelength: number): OkMeasurement[] {
  return ms.filter((m) => Math.abs(m.wavelength - wavelength) <= m.bandwidth / 2)
}

const time = (m: OkMeasurement) => (m.dateObs ? Date.parse(m.dateObs) : NaN)

// The comparison grid reaches ~51 px from the point (72 px square, any rotation).
const EDGE_CLEARANCE_PX = 52

export type Pair = { a: OkMeasurement; b: OkMeasurement; matched: boolean }

/**
 * Wavelength-matched pairs, best first: the point well inside both images and
 * the same detector are preferred, then the longest time between visits.
 */
function matchedPairs(ms: OkMeasurement[]): Pair[] {
  const pairs: { pair: Pair; score: number }[] = []
  for (let i = 0; i < ms.length; i++) {
    for (let j = i + 1; j < ms.length; j++) {
      const [a, b] = time(ms[i]) <= time(ms[j]) ? [ms[i], ms[j]] : [ms[j], ms[i]]
      if (!wavelengthsMatch(a.wavelength, a.bandwidth, b.wavelength, b.bandwidth)) continue
      const clear = Math.min(a.edgePx, b.edgePx) >= EDGE_CLEARANCE_PX ? 2 : 0
      const sameDetector = a.detector === b.detector ? 1 : 0
      const years = (time(b) - time(a)) / (365.25 * 86_400_000)
      pairs.push({ pair: { a, b, matched: true }, score: (clear + sameDetector) * 10 + years })
    }
  }
  return pairs.sort((x, y) => y.score - x.score).map((p) => p.pair)
}

/**
 * Picks two visits to compare near a wavelength (see matchedPairs for the
 * ranking); failing a match, the two visits closest to the wavelength,
 * flagged as unmatched so no difference is shown.
 */
export function pickPair(ms: OkMeasurement[], wavelength: number): Pair | null {
  const near = ms.filter((m) => Math.abs(m.wavelength - wavelength) <= m.bandwidth * 1.5)
  const best = matchedPairs(near)[0]
  if (best) return best
  const sorted = [...ms].sort((x, y) => Math.abs(x.wavelength - wavelength) - Math.abs(y.wavelength - wavelength))
  if (sorted.length < 2) return null
  const [p, q] = time(sorted[0]) <= time(sorted[1]) ? [sorted[0], sorted[1]] : [sorted[1], sorted[0]]
  return { a: p, b: q, matched: wavelengthsMatch(p.wavelength, p.bandwidth, q.wavelength, q.bandwidth) }
}

/** A good starting wavelength: that of the best-ranked matched pair. */
export function bestStartingWavelength(ms: OkMeasurement[]): number | null {
  const best = matchedPairs(ms)[0]
  return best ? (best.a.wavelength + best.b.wavelength) / 2 : (ms[0]?.wavelength ?? null)
}

export function percentile(values: Float32Array | number[], q: number): number {
  const v = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b)
  if (v.length === 0) return NaN
  return v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))]
}

/** Shared asinh display stretch so two images are drawn on the same brightness scale. */
export function makeStretch(...images: Float32Array[]): (v: number) => number {
  const all = images.flatMap((im) => Array.from(im))
  const lo = percentile(all, 0.01)
  const hi = percentile(all, 0.995)
  const span = hi - lo || 1
  const soft = 0.1
  const norm = Math.asinh(1 / soft)
  return (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, Math.asinh(Math.max(0, (v - lo) / span) / soft) / norm)) : NaN)
}

/** Diverging map: blue (negative) → neutral gray → orange (positive). t in [−1, 1]. */
export function diverging(t: number): [number, number, number] {
  const mid: [number, number, number] = [72, 76, 86]
  const neg: [number, number, number] = [96, 165, 250]
  const pos: [number, number, number] = [251, 146, 60]
  const end = t < 0 ? neg : pos
  const k = Math.min(1, Math.abs(t))
  return [0, 1, 2].map((c) => Math.round(mid[c] + (end[c] - mid[c]) * k)) as [number, number, number]
}

export const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : 'unknown date')
