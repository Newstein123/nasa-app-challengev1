import { useEffect, useState } from 'react'
import type { Collection, Measurement, Observation, ObservationsResult } from '../lib/types'
import { MAX_MEASURE_PER_REQUEST, releaseFamily } from '../lib/types'

// First pass: a time-spread sample that gives a spectrum and a comparison in ~15 s.
const FIRST_PASS = 48
// Second pass (background): more visits, for better same-colour matches across seasons.
const MAX_ANALYZED = 192
const PARALLEL_BATCHES = 3
// Images "containing the point" = footprints intersecting this tiny circle.
const POINT_RADIUS_DEG = 0.002

export type AnalysisState =
  | { phase: 'idle' }
  | { phase: 'finding' }
  | {
      phase: 'measuring' | 'done'
      /** The point these measurements belong to */
      point: { ra: number; dec: number }
      /** Images that will be measured in total (both passes) */
      total: number
      /** Images in the archive that contain the point */
      available: number
      releases: string[]
      measurements: Measurement[]
      /** Measurements frozen at the end of each pass, so the chosen comparison does not jump around */
      snapshot: Measurement[]
      refining: boolean
    }
  | { phase: 'error'; message: string }

/** Evenly spaced subset, so a sample still spans the whole time range. */
function spread<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items
  return Array.from({ length: max }, (_, k) => items[Math.round((k * (items.length - 1)) / (max - 1))])
}

async function findImages(ra: number, dec: number, collection: Collection, signal: AbortSignal) {
  const results = await Promise.all(
    releaseFamily(collection).map(async (c) => {
      const qs = new URLSearchParams({ ra: String(ra), dec: String(dec), radius: String(POINT_RADIUS_DEG), collection: c })
      return (await (await fetch(`/api/observations?${qs}`, { signal })).json()) as ObservationsResult
    }),
  )
  const failed = results.find((r) => r.status === 'error')
  if (failed && failed.status === 'error' && results.every((r) => r.status === 'error')) throw new Error(failed.message)
  const items: Observation[] = results.flatMap((r) => (r.status === 'ok' ? r.items : []))
  return items.sort((a, b) => (a.dateStart ?? '').localeCompare(b.dateStart ?? ''))
}

export function usePointAnalysis(point: { ra: number; dec: number } | null, collection: Collection, enabled: boolean) {
  const [state, setState] = useState<AnalysisState>({ phase: 'idle' })
  const ra = point?.ra
  const dec = point?.dec

  useEffect(() => {
    if (ra == null || dec == null || !enabled) {
      setState({ phase: 'idle' })
      return
    }
    const ctrl = new AbortController()
    const signal = ctrl.signal
    // Drop the previous point's results at once so nothing renders them against the new point.
    setState({ phase: 'finding' })
    // Let quick successive clicks settle before starting a large job.
    const timer = setTimeout(async () => {
      try {
        setState({ phase: 'finding' })
        const items = await findImages(ra, dec, collection, signal)
        const all = spread(items, MAX_ANALYZED).map((o) => o.fitsUrl)
        const first = spread(all, FIRST_PASS)
        const firstSet = new Set(first)
        const rest = all.filter((u) => !firstSet.has(u))
        const releases = [...new Set(items.map((o) => o.collection.replace('spherex_', '').replace('_deep', '').toUpperCase()))].sort()

        const measurements: Measurement[] = []
        let snapshot: Measurement[] = []
        let phase: 'measuring' | 'done' = all.length === 0 ? 'done' : 'measuring'
        let refining = false
        const publish = () =>
          setState({ phase, point: { ra, dec }, total: all.length, available: items.length, releases, measurements: [...measurements], snapshot, refining })
        publish()

        const run = async (urls: string[]) => {
          const batches: string[][] = []
          for (let i = 0; i < urls.length; i += MAX_MEASURE_PER_REQUEST) batches.push(urls.slice(i, i + MAX_MEASURE_PER_REQUEST))
          let next = 0
          const worker = async () => {
            while (next < batches.length && !signal.aborted) {
              const batch = batches[next++]
              try {
                const r = await fetch('/api/measure', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ ra, dec, urls: batch }),
                  signal,
                })
                const body = await r.json()
                measurements.push(
                  ...(r.ok
                    ? (body.measurements as Measurement[])
                    : batch.map((url) => ({ status: 'error' as const, url, message: body.message ?? `HTTP ${r.status}` }))),
                )
              } catch (e) {
                if ((e as Error).name === 'AbortError') return
                measurements.push(...batch.map((url) => ({ status: 'error' as const, url, message: 'Request failed' })))
              }
              if (!signal.aborted) publish()
            }
          }
          await Promise.all(Array.from({ length: PARALLEL_BATCHES }, worker))
        }

        await run(first)
        if (signal.aborted) return
        phase = 'done'
        refining = rest.length > 0
        snapshot = [...measurements]
        publish()
        if (!refining) return
        await run(rest)
        if (signal.aborted) return
        refining = false
        snapshot = [...measurements]
        publish()
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setState({ phase: 'error', message: (e as Error).message || 'Could not reach the app server.' })
      }
    }, 600)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [ra, dec, collection, enabled])

  return state
}
