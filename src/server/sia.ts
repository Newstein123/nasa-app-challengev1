import type { Observation, ObservationQuery, ObservationsResult, Provenance } from '../lib/types'
import { siaIdUrl, siaRegionUrl } from '../lib/links'
import { parseVOTable, toObservation, VOTableParseError } from './votable'
import fixtureXml from '../../fixtures/orion_qr3.xml?raw'

const TIMEOUT_MS = 20_000
const MAXREC = 200

// Real archive response saved on 2026-10-27 for the demo region; served only
// in offline mode and only for queries that match it.
const FIXTURE = {
  query: { ra: 83.8, dec: -5.5, radius: 0.05, collection: 'spherex_qr3' },
  retrievedAt: '2026-10-27',
  url: siaRegionUrl(83.8, -5.5, 0.05, 'spherex_qr3', 40),
}

const offline = () => process.env.CTM_OFFLINE === '1'

type Fetched = { ok: true; xml: string } | { ok: false; kind: 'timeout' | 'upstream'; message: string }

async function fetchXml(url: string): Promise<Fetched> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/x-votable+xml, text/xml' } })
    const xml = await res.text()
    // IRSA reports usage errors as a VOTable with QUERY_STATUS=ERROR, sometimes on a non-200.
    if (!res.ok && !xml.includes('QUERY_STATUS')) {
      return { ok: false, kind: 'upstream', message: `IRSA responded with HTTP ${res.status}` }
    }
    return { ok: true, xml }
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: `IRSA did not respond within ${TIMEOUT_MS / 1000} s` }
    }
    return { ok: false, kind: 'upstream', message: `Could not reach IRSA: ${(e as Error).message}` }
  } finally {
    clearTimeout(timer)
  }
}

function parseObservations(xml: string):
  | { ok: true; items: Observation[]; truncated: boolean }
  | { ok: false; kind: 'upstream' | 'parse'; message: string } {
  try {
    const t = parseVOTable(xml)
    if (t.queryStatus === 'ERROR') {
      return { ok: false, kind: 'upstream', message: t.statusMessage ?? 'Archive reported an error' }
    }
    const items = t.rows
      .map(toObservation)
      .filter((o): o is Observation => o !== null)
      .sort((a, b) => (b.dateStart ?? '').localeCompare(a.dateStart ?? '') || a.band.localeCompare(b.band))
    return { ok: true, items, truncated: t.queryStatus === 'OVERFLOW' }
  } catch (e) {
    if (e instanceof VOTableParseError) return { ok: false, kind: 'parse', message: e.message }
    throw e
  }
}

function matchesFixture(q: ObservationQuery) {
  const f = FIXTURE.query
  return (
    q.collection === f.collection &&
    Math.abs(q.ra - f.ra) < 1e-3 &&
    Math.abs(q.dec - f.dec) < 1e-3 &&
    q.radius <= f.radius
  )
}

export async function searchObservations(query: ObservationQuery): Promise<ObservationsResult> {
  let xml: string
  let provenance: Provenance

  if (offline()) {
    if (!matchesFixture(query)) {
      return {
        status: 'error',
        kind: 'upstream',
        message: 'Offline demo mode: only the cached Orion Nebula region (83.8, −5.5, r ≤ 0.05°, qr3) is available.',
        retryable: false,
        query,
      }
    }
    xml = fixtureXml
    provenance = { source: 'IRSA SIA2 (cached fixture)', queryUrl: FIXTURE.url, retrievedAt: FIXTURE.retrievedAt }
  } else {
    const queryUrl = siaRegionUrl(query.ra, query.dec, query.radius, query.collection, MAXREC)
    const fetched = await fetchXml(queryUrl)
    if (!fetched.ok) return { status: 'error', kind: fetched.kind, message: fetched.message, retryable: true, query }
    xml = fetched.xml
    provenance = { source: 'IRSA SIA2 (live)', queryUrl, retrievedAt: new Date().toISOString() }
  }

  const parsed = parseObservations(xml)
  if (!parsed.ok) return { status: 'error', kind: parsed.kind, message: parsed.message, retryable: parsed.kind !== 'parse', query }
  if (parsed.items.length === 0) return { status: 'no-results', query, provenance }
  return { status: 'ok', items: parsed.items, truncated: parsed.truncated, query, provenance }
}

export type ObservationDetailResult =
  | { status: 'ok'; item: Observation; provenance: Provenance }
  | { status: 'not-found' }
  | { status: 'error'; kind: 'timeout' | 'upstream' | 'parse'; message: string; retryable: boolean }

export async function getObservation(did: string, collection: string): Promise<ObservationDetailResult> {
  if (offline()) {
    const parsed = parseObservations(fixtureXml)
    const item = parsed.ok ? parsed.items.find((o) => o.did === did) : undefined
    return item
      ? { status: 'ok', item, provenance: { source: 'IRSA SIA2 (cached fixture)', queryUrl: FIXTURE.url, retrievedAt: FIXTURE.retrievedAt } }
      : { status: 'not-found' }
  }
  const queryUrl = siaIdUrl(did, collection)
  const fetched = await fetchXml(queryUrl)
  if (!fetched.ok) return { status: 'error', kind: fetched.kind, message: fetched.message, retryable: true }
  const parsed = parseObservations(fetched.xml)
  if (!parsed.ok) return { status: 'error', kind: parsed.kind, message: parsed.message, retryable: parsed.kind !== 'parse' }
  const item = parsed.items.find((o) => o.did === did)
  if (!item) return { status: 'not-found' }
  return { status: 'ok', item, provenance: { source: 'IRSA SIA2 (live)', queryUrl, retrievedAt: new Date().toISOString() } }
}
