// Network test against IRSA: LIVE=1 npx vitest run src/server/spherexFile.live.test.ts
// Reads pixels from the full files with Range requests and checks them against
// IRSA's own cutout service for the same files.
import { describe, expect, it } from 'vitest'
import { badFlagMask, listHdus, num, pixToSky, readCelestialWcs } from './fits'
import { readWindow } from './spherexFile'

// [url, ra, dec] with the position on that image
const FILES: Record<string, [string, number, number]> = {
  // QR3 (pipeline v27): FLAGS stored RICE_1 tile-compressed
  qr3: ['https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W38_2A/l2b-v27-2026-264/3/level2_2026W38_2A_0020_1D3_spx_l2b-v27-2026-264.fits', 83.8221, -5.3911],
  // QR2 (pipeline v24): FLAGS stored as a plain int32 image
  // QR3 visit whose comparison grid showed an unexplained empty band
  qr3b: ['https://irsa.ipac.caltech.edu/ibe/data/spherex/qr3/level2/2026W37_1A/l2b-v27-2026-255/4/level2_2026W37_1A_0280_2D4_spx_l2b-v27-2026-255.fits', 83.8, -5.5],
  qr2: ['https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2026W12_1A/l2b-v24-2026-082/1/level2_2026W12_1A_0417_1D1_spx_l2b-v24-2026-082.fits', 83.8, -5.5],
}

describe.skipIf(!process.env.LIVE)('readWindow matches the IRSA cutout of the same file', () => {
  for (const [name, [url, RA, DEC]] of Object.entries(FILES)) {
    it(`${name}: same zodi-subtracted, flag-masked pixels`, async () => {
      const res = await fetch(`${url}?center=${RA},${DEC}&size=${process.env.SIZE ?? 0.03}`)
      expect(res.status).toBe(200)
      const buf = new Uint8Array(await res.arrayBuffer())
      const hdus = listHdus(buf)
      const get = (n: string) => hdus.find((h) => h.header.cards.get('EXTNAME') === n)!
      const img = get('IMAGE'), flg = get('FLAGS'), zod = get('ZODI')
      const W = num(img.header, 'NAXIS1')
      // Cutout pixel p ↔ full-detector 1-based pixel p − CRPIXnA + 1 (CRVALnA = 0, 0-based frame A).
      const dx = 1 - num(img.header, 'CRPIX1A')
      const dy = 1 - num(img.header, 'CRPIX2A')
      const dv = new DataView(buf.buffer, buf.byteOffset)
      const at = (h: typeof img, x: number, y: number, int = false) =>
        int ? dv.getInt32(h.dataOffset + ((y - 1) * W + (x - 1)) * 4) : dv.getFloat32(h.dataOffset + ((y - 1) * W + (x - 1)) * 4)

      const [ra, dec] = pixToSky(readCelestialWcs(img.header), W / 2, num(img.header, 'NAXIS2') / 2)
      const win = await readWindow(url, ra, dec, Number(process.env.HALF ?? 3), true)
      const bad = badFlagMask(flg.header)
      let equal = 0
      let masked = 0
      for (let j = 0; j < win.h; j++) {
        for (let i = 0; i < win.w; i++) {
          const cx = win.x0 + i - dx
          const cy = win.y0 + j - dy
          const got = win.image[j * win.w + i]
          if (at(flg, cx, cy, true) & bad) {
            expect(got).toBeNaN()
            masked++
          } else {
            expect(got).toBeCloseTo(at(img, cx, cy) - at(zod, cx, cy), 4)
            equal++
          }
        }
      }
      expect(equal).toBeGreaterThan(10) // the comparison must not pass vacuously
      console.log(`${name}: ${equal} pixels equal, ${masked} masked identically`)
    }, 120_000)
  }
})
