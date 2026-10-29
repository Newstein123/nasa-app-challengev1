import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mjdToIso, parsePolygon, parseVOTable, toObservation, VOTableParseError } from './votable'

const fixture = readFileSync(new URL('../../fixtures/orion_qr3.xml', import.meta.url), 'utf8')

describe('parseVOTable', () => {
  it('parses the real Orion qr3 response', () => {
    const t = parseVOTable(fixture)
    expect(t.queryStatus).toBe('OVERFLOW')
    expect(t.rows).toHaveLength(40)
    expect(t.rows[0].obs_collection).toBe('spherex_qr3')
    expect(t.rows[0].obs_publisher_did).toMatch(/^ivo:\/\/irsa\.ipac\/spherex_qr3\?/)
    // XML entities in cloud_access are decoded
    expect(t.rows[0].cloud_access).toContain('"bucket_name"')
  })

  it('maps rows to observations', () => {
    const obs = parseVOTable(fixture).rows.map(toObservation)
    expect(obs.every((o) => o !== null)).toBe(true)
    const o = obs[0]!
    expect(o.band).toMatch(/^SPHEREx-D[1-6]$/)
    expect(o.wavelengthMinUm).toBeGreaterThan(0.7)
    expect(o.wavelengthMaxUm).toBeLessThan(5.1)
    expect(o.footprint.length).toBeGreaterThanOrEqual(4)
    expect(o.fitsUrl).toMatch(/^https:\/\/irsa\.ipac\.caltech\.edu\/.*\.fits$/)
    expect(o.dateStart).toMatch(/^20\d\d-\d\d-\d\dT/)
  })

  it('reports archive usage errors', () => {
    const xml = `<?xml version="1.0"?><VOTABLE><RESOURCE type="results"><INFO name="QUERY_STATUS" value="ERROR">UsageFault: BAD_REQUEST: dec value -95 lies outside valid interval [-90, 90]</INFO></RESOURCE></VOTABLE>`
    const t = parseVOTable(xml)
    expect(t.queryStatus).toBe('ERROR')
    expect(t.statusMessage).toContain('dec value -95')
    expect(t.rows).toEqual([])
  })

  it('treats an empty table as zero rows', () => {
    const xml = `<VOTABLE><RESOURCE type="results"><INFO name="QUERY_STATUS" value="OK"/><TABLE><FIELD name="obs_id"/><DATA><TABLEDATA></TABLEDATA></DATA></TABLE></RESOURCE></VOTABLE>`
    expect(parseVOTable(xml).rows).toEqual([])
  })

  it('throws a parse error on non-VOTable input', () => {
    expect(() => parseVOTable('<html><body>Service unavailable</body></html>')).toThrow(VOTableParseError)
  })
})

describe('helpers', () => {
  it('converts MJD to ISO', () => {
    expect(mjdToIso(40587)).toBe('1970-01-01T00:00:00.000Z')
    expect(mjdToIso(61041)).toBe('2026-01-01T00:00:00.000Z')
    expect(mjdToIso(61287.5)?.slice(0, 10)).toBe('2026-09-04')
    expect(mjdToIso(null)).toBeNull()
  })

  it('parses STC-S polygons', () => {
    expect(parsePolygon('POLYGON ICRS 1 2 3 4 5 6')).toEqual([[1, 2], [3, 4], [5, 6]])
    expect(parsePolygon('CIRCLE ICRS 1 2 3')).toEqual([])
    expect(parsePolygon('')).toEqual([])
  })
})
