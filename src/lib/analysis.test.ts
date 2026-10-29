import { describe, expect, it } from 'vitest'
import { bestStartingWavelength, diverging, inChannel, makeStretch, type OkMeasurement, pickPair, wavelengthsMatch } from './analysis'

const m = (wavelength: number, dateObs: string, bandwidth = 0.05): OkMeasurement => ({
  status: 'ok', url: `u-${wavelength}-${dateObs}`, release: 'QR3', obsId: null, detector: 3, dateObs, wavelength, bandwidth,
  surfaceBrightness: 1, uncertainty: 0.1, goodPixels: 9, edgePx: 500,
})

describe('pair selection', () => {
  const ms = [m(2.1, '2026-03-01'), m(2.11, '2026-09-01'), m(2.105, '2026-06-01'), m(3.0, '2026-04-01')]
  it('matches wavelengths within half a channel', () => {
    expect(wavelengthsMatch(2.1, 0.05, 2.12, 0.05)).toBe(true)
    expect(wavelengthsMatch(2.1, 0.05, 2.13, 0.05)).toBe(false)
  })
  it('prefers the matched pair with the longest time baseline', () => {
    const p = pickPair(ms, 2.1)!
    expect(p.matched).toBe(true)
    expect(p.a.dateObs).toBe('2026-03-01')
    expect(p.b.dateObs).toBe('2026-09-01')
  })
  it('falls back to an unmatched pair rather than inventing one', () => {
    const p = pickPair([m(2.1, '2026-03-01'), m(3.0, '2026-04-01')], 3.0)!
    expect(p.matched).toBe(false)
  })
  it('returns null with fewer than two visits', () => {
    expect(pickPair([m(2.1, '2026-03-01')], 2.1)).toBeNull()
  })
  it('prefers a pair with the point well inside both images', () => {
    const edge = { ...m(2.1, '2025-09-01'), edgePx: 10 }
    const p = pickPair([edge, m(2.1, '2026-03-01'), m(2.11, '2026-09-01')], 2.1)!
    expect(p.a.dateObs).toBe('2026-03-01')
  })
  it('starts at the wavelength of the longest matched baseline', () => {
    expect(bestStartingWavelength(ms)).toBeCloseTo(2.105, 3)
  })
  it('selects measurements inside the channel', () => {
    expect(inChannel(ms, 2.1).map((x) => x.wavelength)).toEqual([2.1, 2.11, 2.105])
  })
})

describe('display', () => {
  it('stretch maps to [0, 1] and keeps NaN', () => {
    const s = makeStretch(new Float32Array([0, 1, 2, 3, 100]))
    expect(s(-5)).toBe(0)
    expect(s(1000)).toBe(1)
    expect(s(NaN)).toBeNaN()
  })
  it('diverging map is gray at zero', () => {
    const [r, g, b] = diverging(0)
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(20)
  })
})
