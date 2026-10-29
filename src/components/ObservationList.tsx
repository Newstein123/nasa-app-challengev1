import { useEffect, useMemo, useState } from 'react'
import type { Observation, ObservationsResult } from '../lib/types'
import { fmtDay, fmtUm } from '../lib/format'
import { DataStatusBadge } from './DataStatusBadge'

type Props = {
  result: ObservationsResult | null
  loading: boolean
  selectedDid: string | null
  onSelect: (o: Observation) => void
  onRetry: () => void
}

const PAGE = 40

export function ObservationList({ result, loading, selectedDid, onSelect, onRetry }: Props) {
  const [shown, setShown] = useState(PAGE)
  const items = result?.status === 'ok' ? result.items : []
  const byDay = useMemo(() => {
    const groups = new Map<string, Observation[]>()
    for (const o of items.slice(0, shown)) {
      const day = fmtDay(o.dateStart)
      groups.set(day, [...(groups.get(day) ?? []), o])
    }
    return [...groups]
  }, [items, shown])
  const distinctDays = useMemo(() => new Set(items.map((o) => fmtDay(o.dateStart))).size, [items])

  // A product picked on the map may be beyond the visible page: reveal it and scroll to it.
  useEffect(() => {
    if (!selectedDid) return
    const idx = items.findIndex((o) => o.did === selectedDid)
    if (idx >= shown) setShown(Math.ceil((idx + 1) / PAGE) * PAGE)
    requestAnimationFrame(() =>
      document.querySelector('.obs.selected')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDid])

  return (
    <section className="card" aria-live="polite">
      <header className="card-head">
        <h2>SPHEREx observations</h2>
        {result?.status === 'ok' && (
          <span className="count">
            {items.length}
            {result.truncated ? '+' : ''} products
          </span>
        )}
      </header>

      {loading && <p className="state">Querying the IRSA SPHEREx archive…</p>}

      {!loading && !result && (
        <p className="state muted">Pick a region to check whether SPHEREx has observed it.</p>
      )}

      {!loading && result?.status === 'error' && (
        <div className="state error">
          <strong>{result.kind === 'timeout' ? 'The archive took too long to respond.' : 'The archive query failed.'}</strong>
          <p>{result.message}</p>
          <p className="muted">No data is shown because none was received. Nothing here is guessed.</p>
          {result.retryable && <button onClick={onRetry}>Retry</button>}
        </div>
      )}

      {!loading && result?.status === 'no-results' && (
        <div className="state">
          <strong>No SPHEREx products found here.</strong>
          <p>
            The archive answered, and this release has no images covering this circle. That is a real result, not
            an error. Try a larger radius, another release, or one of the popular regions.
          </p>
          <DataStatusBadge status={result.provenance.source.includes('cached') ? 'cached' : 'archive'} />
        </div>
      )}

      {!loading && result?.status === 'ok' && (
        <>
          <p className="summary">
            <DataStatusBadge status={result.provenance.source.includes('cached') ? 'cached' : 'archive'} />
            <span>
              Coverage confirmed by the archive: {items.length}
              {result.truncated ? '+' : ''} images over {distinctDays} observing day{distinctDays === 1 ? '' : 's'}.
            </span>
          </p>
          {result.truncated && (
            <p className="muted small">
              The archive capped this result. Shrink the radius to see every product.
            </p>
          )}
          <div className="obs-list">
            {byDay.map(([day, obs]) => (
              <div key={day}>
                <h4 className="day">{day}</h4>
                <ul>
                  {obs.map((o) => (
                    <li key={o.did}>
                      <button
                        className={`obs ${o.did === selectedDid ? 'selected' : ''}`}
                        onClick={() => onSelect(o)}
                        aria-pressed={o.did === selectedDid}
                      >
                        <span className="band">{o.band.replace('SPHEREx-', '')}</span>
                        <span className="obs-main">
                          <span className="mono">{o.obsId}</span>
                          <span className="muted small">
                            {fmtUm(o.wavelengthMinUm)} – {fmtUm(o.wavelengthMaxUm)}
                          </span>
                        </span>
                        <span className="muted small">{o.dateStart?.slice(11, 16)} UTC</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {items.length > shown && (
            <button className="link" onClick={() => setShown((s) => s + PAGE)}>
              Show more ({items.length - shown} remaining)
            </button>
          )}
        </>
      )}
    </section>
  )
}
