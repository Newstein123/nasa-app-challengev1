import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  badFlagMask, listHdus, num, parseHeader, pixToSky, readCelestialWcs, readFloatImage,
  readSpectralWcs, readWaveTable, skyToPix, tanDeproject, tanProject, waveAt,
} from './fits'

// Real SPHEREx L2 cutout (2026W38_2A_0020_1, detector 3) around the Orion Nebula,
// with the large EPSF table removed.
const buf = new Uint8Array(readFileSync(new URL('../../fixtures/orion_d3_cutout.fits', import.meta.url)))
const hdus = listHdus(buf)
const byName = (n: string) => hdus.find((h) => h.header.cards.get('EXTNAME') === n)!

describe('FITS structure', () => {
  it('lists the SPHEREx extensions', () => {
    expect(hdus.map((h) => h.header.cards.get('EXTNAME') ?? 'PRIMARY')).toEqual([
      'PRIMARY', 'IMAGE', 'FLAGS', 'VARIANCE', 'ZODI', 'WCS-WAVE',
    ])
  })
  it('returns null when END is not in the buffer', () => {
    expect(parseHeader(buf.subarray(0, 2880 + 800), 2880)).toBeNull()
  })
  it('reads the image', () => {
    const img = readFloatImage(buf, byName('IMAGE'))
    expect(img.length).toBe(58 * 57)
    expect(img.some((v) => Number.isFinite(v) && v !== 0)).toBe(true)
  })
})

describe('celestial WCS (TAN-SIP)', () => {
  const w = readCelestialWcs(byName('IMAGE').header)
  it('puts the cutout centre near the requested position', () => {
    const [x, y] = skyToPix(w, 83.8221, -5.3911)!
    // 58×57 cutout centred on the request → roughly the middle pixel
    expect(x).toBeGreaterThan(26)
    expect(x).toBeLessThan(33)
    expect(y).toBeGreaterThan(26)
    expect(y).toBeLessThan(32)
  })
  it('round-trips sky ↔ pixel to < 0.05 px', () => {
    for (const [x, y] of [[1, 1], [29, 29], [58, 57], [10, 45]]) {
      const [ra, dec] = pixToSky(w, x, y)
      const [x2, y2] = skyToPix(w, ra, dec)!
      expect(Math.hypot(x2 - x, y2 - y)).toBeLessThan(0.05)
    }
  })
  it('has a ~6.15″ pixel scale', () => {
    const [ra1, dec1] = pixToSky(w, 29, 29)
    const [ra2, dec2] = pixToSky(w, 30, 29)
    const sep = Math.hypot((ra2 - ra1) * Math.cos((dec1 * Math.PI) / 180), dec2 - dec1) * 3600
    expect(sep).toBeGreaterThan(6.0)
    expect(sep).toBeLessThan(6.4)
  })
  it('gnomonic project/deproject are inverses', () => {
    const p = tanProject(84.1, -5.0, 83.8, -5.4)!
    const [ra, dec] = tanDeproject(p[0], p[1], 83.8, -5.4)
    expect(ra).toBeCloseTo(84.1, 9)
    expect(dec).toBeCloseTo(-5.0, 9)
  })
})

describe('spectral WCS (WAVE-TAB)', () => {
  const sw = readSpectralWcs(byName('IMAGE').header)!
  const wave = byName('WCS-WAVE')
  const table = readWaveTable(wave.header, buf.subarray(wave.dataOffset, wave.dataOffset + wave.dataSize))
  it('decodes the control grid', () => {
    expect(table.x).toHaveLength(9)
    expect(table.y).toHaveLength(14)
    expect(table.values).toHaveLength(252)
  })
  it('gives a wavelength inside the detector-3 band at the target', () => {
    const { wavelength, bandwidth } = waveAt(sw, table, 29, 29)
    expect(wavelength).toBeGreaterThan(1.63)
    expect(wavelength).toBeLessThan(2.44)
    expect(bandwidth).toBeGreaterThan(0.02)
    expect(bandwidth).toBeLessThan(0.1)
  })
  it('matches a table control point exactly', () => {
    // index coordinate (1, 1) ↔ pixel x = 1 + CRPIX1W - CRVAL1W … i.e. control point (0, 0)
    const x = sw.crpix[0] + (1 - sw.crval[0]) / sw.cdelt[0]
    const y = sw.crpix[1] + (1 - sw.crval[1]) / sw.cdelt[1]
    expect(waveAt(sw, table, x, y).wavelength).toBeCloseTo(table.values[0], 6)
  })
})

describe('flags', () => {
  it('builds a bad-pixel mask from the plane names', () => {
    const mask = badFlagMask(byName('FLAGS').header)
    expect(mask & 1).toBe(1) // TRANSIENT
    expect(mask & 64).toBe(64) // NONFUNC
    expect(mask & 2097152).toBe(0) // SOURCE is not bad
  })
  it('reads header numbers', () => {
    expect(num(byName('IMAGE').header, 'NAXIS1')).toBe(58)
  })
})
