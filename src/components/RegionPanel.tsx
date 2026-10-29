import { useState } from 'react'
import type { Collection } from '../lib/types'
import { COLLECTIONS } from '../lib/types'
import { SURVEYS } from '../lib/surveys'
import { MAX_RADIUS_DEG } from '../lib/types'

export type Preset = { name: string; sub: string; ra: number; dec: number; collection: Collection }

// Coordinates from SIMBAD. SPHEREx coverage for each was confirmed against IRSA
// on 2026-10-27; the app still re-queries live and shows whatever comes back.
export const PRESETS: Preset[] = [
  // Just south of the Trapezium: the core itself saturates SPHEREx and is flagged in every image.
  { name: 'Orion Nebula', sub: 'M42 · demo region', ra: 83.8, dec: -5.5, collection: 'spherex_qr3' },
  { name: 'Andromeda Galaxy', sub: 'M31', ra: 10.6847, dec: 41.2687, collection: 'spherex_qr3' },
  { name: 'Pleiades', sub: 'M45', ra: 56.75, dec: 24.1167, collection: 'spherex_qr3' },
  { name: 'Galactic Center', sub: 'Sgr A*', ra: 266.4168, dec: -29.0078, collection: 'spherex_qr3' },
  { name: 'North Ecliptic Pole', sub: 'SPHEREx deep field', ra: 270.0, dec: 66.5607, collection: 'spherex_qr3_deep' },
]

const COLLECTION_LABELS: Record<Collection, string> = {
  spherex_qr3: 'Quick Release 3 (all-sky)',
  spherex_qr2: 'Quick Release 2 (all-sky)',
  spherex_qr3_deep: 'Quick Release 3 (deep fields)',
  spherex_qr2_deep: 'Quick Release 2 (deep fields)',
}

type Props = {
  radius: number
  collection: Collection
  surveyId: string
  busy: boolean
  onSearchName: (name: string) => Promise<void>
  onCoordinates: (ra: number, dec: number) => void
  onPreset: (p: Preset) => void
  onRadius: (r: number) => void
  onCollection: (c: Collection) => void
  onSurvey: (id: string) => void
  /** Rendered between region selection and the search settings */
  children?: React.ReactNode
}

export function RegionPanel(p: Props) {
  const [tab, setTab] = useState<'search' | 'coords'>('search')
  const [name, setName] = useState('')
  const [ra, setRa] = useState('')
  const [dec, setDec] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submitName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      await p.onSearchName(name.trim())
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function submitCoords(e: React.FormEvent) {
    e.preventDefault()
    const r = Number(ra)
    const d = Number(dec)
    if (!Number.isFinite(r) || r < 0 || r >= 360) return setError('RA must be a number of degrees in [0, 360)')
    if (!Number.isFinite(d) || d < -90 || d > 90) return setError('Dec must be a number of degrees in [−90, 90]')
    setError(null)
    p.onCoordinates(r, d)
  }

  return (
    <aside className="panel left">
      <h2>1. Choose a region</h2>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'search'} onClick={() => setTab('search')}>
          Search
        </button>
        <button role="tab" aria-selected={tab === 'coords'} onClick={() => setTab('coords')}>
          Coordinates
        </button>
      </div>
      {tab === 'search' ? (
        <form onSubmit={submitName} className="field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Object name, e.g. M42, NGC 7000"
            aria-label="Object name"
          />
          <button type="submit" disabled={p.busy}>
            Go
          </button>
        </form>
      ) : (
        <form onSubmit={submitCoords} className="field coords">
          <input value={ra} onChange={(e) => setRa(e.target.value)} placeholder="RA (deg)" aria-label="Right ascension in degrees" inputMode="decimal" />
          <input value={dec} onChange={(e) => setDec(e.target.value)} placeholder="Dec (deg)" aria-label="Declination in degrees" inputMode="decimal" />
          <button type="submit" disabled={p.busy}>
            Go
          </button>
        </form>
      )}
      <p className="hint">…or click anywhere on the sky atlas.</p>
      {error && <p className="inline-error">{error}</p>}

      <h3>Popular regions</h3>
      <div className="presets">
        {PRESETS.map((x) => (
          <button key={x.name} className="preset" onClick={() => p.onPreset(x)} disabled={p.busy}>
            <strong>{x.name}</strong>
            <span>{x.sub}</span>
          </button>
        ))}
      </div>

      {p.children}

      <h2>3. Search settings</h2>
      <label className="setting">
        <span>Search radius: {p.radius.toFixed(2)}°</span>
        <input
          type="range"
          min={0.01}
          max={MAX_RADIUS_DEG}
          step={0.01}
          value={p.radius}
          onChange={(e) => p.onRadius(Number(e.target.value))}
        />
      </label>
      <label className="setting">
        <span>SPHEREx release</span>
        <select value={p.collection} onChange={(e) => p.onCollection(e.target.value as Collection)}>
          {COLLECTIONS.map((c) => (
            <option key={c} value={c}>
              {COLLECTION_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="setting">
        <span>Background survey imagery</span>
        <select value={p.surveyId} onChange={(e) => p.onSurvey(e.target.value)}>
          {SURVEYS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.wavelength}
            </option>
          ))}
        </select>
      </label>
    </aside>
  )
}
