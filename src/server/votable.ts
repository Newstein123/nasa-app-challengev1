import { XMLParser } from 'fast-xml-parser'
import type { Observation } from '../lib/types'

export type ParsedVOTable = {
  queryStatus: 'OK' | 'OVERFLOW' | 'ERROR' | null
  statusMessage: string | null
  rows: Record<string, string>[]
}

export class VOTableParseError extends Error {}

const ARRAY_TAGS = new Set(['RESOURCE', 'INFO', 'FIELD', 'TR', 'TD'])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
})

function text(node: unknown): string {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'object' && '#text' in node) return String((node as Record<string, unknown>)['#text'])
  return ''
}

/** Parses an SIA2 VOTable response into status + rows keyed by FIELD name. */
export function parseVOTable(xml: string): ParsedVOTable {
  let doc: any
  try {
    doc = parser.parse(xml)
  } catch (e) {
    throw new VOTableParseError(`Archive returned invalid XML: ${(e as Error).message}`)
  }
  const votable = doc?.VOTABLE
  if (!votable) throw new VOTableParseError('Archive response is not a VOTable')

  const resources: any[] = votable.RESOURCE ?? []
  const results = resources.find((r) => r['@type'] === 'results')
  if (!results) throw new VOTableParseError('VOTable has no results resource')

  const status = (results.INFO ?? []).find((i: any) => i['@name'] === 'QUERY_STATUS')
  const queryStatus = status ? (String(status['@value']).toUpperCase() as ParsedVOTable['queryStatus']) : null
  const statusMessage = status ? text(status) || null : null

  const table = results.TABLE
  if (!table) return { queryStatus, statusMessage, rows: [] }

  const fields: string[] = (table.FIELD ?? []).map((f: any) => String(f['@name']))
  const trs: any[] = table.DATA?.TABLEDATA?.TR ?? []
  const rows = trs.map((tr) => {
    const tds: unknown[] = tr.TD ?? []
    const row: Record<string, string> = {}
    fields.forEach((name, i) => {
      row[name] = text(tds[i])
    })
    return row
  })
  return { queryStatus, statusMessage, rows }
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const MJD_UNIX_EPOCH = 40587

export function mjdToIso(mjd: number | null): string | null {
  if (mjd == null) return null
  return new Date((mjd - MJD_UNIX_EPOCH) * 86_400_000).toISOString()
}

/** Parses an STC-S "POLYGON ICRS ra1 dec1 ra2 dec2 ..." string. */
export function parsePolygon(sRegion: string | undefined): [number, number][] {
  if (!sRegion) return []
  const tokens = sRegion.trim().split(/\s+/)
  if (tokens[0]?.toUpperCase() !== 'POLYGON') return []
  const coords = tokens.slice(1).filter((t) => !/^[a-z]/i.test(t)).map(Number)
  if (coords.some((n) => !Number.isFinite(n))) return []
  const points: [number, number][] = []
  for (let i = 0; i + 1 < coords.length; i += 2) points.push([coords[i], coords[i + 1]])
  return points
}

/** Maps one ObsCore row to our Observation; returns null if required ids are missing. */
export function toObservation(row: Record<string, string>): Observation | null {
  const did = row.obs_publisher_did
  const fitsUrl = row.access_url
  if (!did || !fitsUrl) return null
  const emMin = num(row.em_min)
  const emMax = num(row.em_max)
  const sizeKb = num(row.access_estsize)
  return {
    did,
    obsId: row.obs_id ?? '',
    collection: row.obs_collection ?? '',
    band: row.energy_bandpassname ?? '',
    wavelengthMinUm: emMin == null ? null : emMin * 1e6,
    wavelengthMaxUm: emMax == null ? null : emMax * 1e6,
    spectralResolvingPower: num(row.em_res_power),
    dateStart: mjdToIso(num(row.t_min)),
    dateEnd: mjdToIso(num(row.t_max)),
    exposureS: num(row.t_exptime),
    centerRa: num(row.s_ra),
    centerDec: num(row.s_dec),
    footprint: parsePolygon(row.s_region),
    fovDeg: num(row.s_fov),
    pixelScaleArcsec: num(row.s_pixel_scale),
    calibLevel: num(row.calib_level),
    fitsUrl,
    sizeMB: sizeKb == null ? null : sizeKb / 1024,
    releaseDate: row.obs_release_date || null,
    surveyName: row.proposal_title || null,
  }
}
