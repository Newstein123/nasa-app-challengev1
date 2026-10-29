import { useEffect, useMemo, useRef, useState } from 'react'
import type { VisitImage } from '../lib/types'
import { decodeFloat32, diverging, fmtDate, makeStretch, type Pair, percentile } from '../lib/analysis'
import { DataStatusBadge } from './DataStatusBadge'

const GRID = 72
const SCALE_ARCSEC = 6.15

type Loaded = { image: VisitImage; pixels: Float32Array; waves: Float32Array }
type Mode = 'side' | 'blink' | 'diff'

function useVisit(url: string | null, ra: number, dec: number) {
  const [state, setState] = useState<{ status: 'idle' | 'loading' | 'ok' | 'error'; data?: Loaded; message?: string }>({ status: 'idle' })
  useEffect(() => {
    if (!url) return setState({ status: 'idle' })
    const ctrl = new AbortController()
    setState({ status: 'loading' })
    const qs = new URLSearchParams({ url, ra: String(ra), dec: String(dec), n: String(GRID), scale: String(SCALE_ARCSEC) })
    fetch(`/api/visit?${qs}`, { signal: ctrl.signal })
      .then(async (r) => {
        const body = await r.json()
        if (body.status !== 'ok') return setState({ status: 'error', message: body.message })
        const image = body.image as VisitImage
        setState({ status: 'ok', data: { image, pixels: decodeFloat32(image.pixels), waves: decodeFloat32(image.wavelengths) } })
      })
      .catch((e) => e.name !== 'AbortError' && setState({ status: 'error', message: 'Could not load this image' }))
    return () => ctrl.abort()
  }, [url, ra, dec])
  return state
}

/** Draws an n×n field with per-pixel colours, plus orientation markers. */
function Field({ n, color, label, sub, markers }: {
  n: number
  color: (k: number) => [number, number, number] | null
  label: React.ReactNode
  sub?: React.ReactNode
  markers: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const img = ctx.createImageData(n, n)
    for (let k = 0; k < n * n; k++) {
      const c = color(k)
      // No data: dark hatch so it is never mistaken for black sky.
      const x = k % n, y = Math.floor(k / n)
      const rgb = c ?? (((x + y) & 3) === 0 ? [58, 62, 74] : [22, 26, 38])
      img.data.set([rgb[0], rgb[1], rgb[2], 255], k * 4)
    }
    ctx.putImageData(img, 0, 0)
  }, [n, color])
  const bar = 60 / SCALE_ARCSEC // pixels per arcminute
  return (
    <figure className="field">
      <figcaption>
        {label}
        {sub && <span className="muted small">{sub}</span>}
      </figcaption>
      <div className="field-frame">
        <canvas ref={ref} width={n} height={n} />
        {markers && (
          <svg viewBox={`0 0 ${n} ${n}`} aria-hidden>
            <circle cx={n / 2} cy={n / 2} r={3} className="mk-target" />
            <g className="mk-axes" transform={`translate(${n - 6}, ${n - 6})`}>
              <line x1={0} y1={0} x2={0} y2={-9} />
              <line x1={0} y1={0} x2={-9} y2={0} />
              <text x={0} y={-10.5} textAnchor="middle">N</text>
              <text x={-12.5} y={1.5} textAnchor="middle">E</text>
            </g>
            <g className="mk-bar" transform={`translate(4, ${n - 4})`}>
              <line x1={0} y1={0} x2={bar} y2={0} />
              <text x={bar / 2} y={-2} textAnchor="middle">1′</text>
            </g>
          </svg>
        )}
      </div>
    </figure>
  )
}

export function CompareViewer({ pair, ra, dec }: { pair: Pair; ra: number; dec: number }) {
  const [mode, setMode] = useState<Mode>('side')
  const [markers, setMarkers] = useState(true)
  const [blinkB, setBlinkB] = useState(false)
  const [playing, setPlaying] = useState(true)
  const A = useVisit(pair.a.url, ra, dec)
  const B = useVisit(pair.b.url, ra, dec)

  useEffect(() => {
    if (mode !== 'blink' || !playing) return
    const t = setInterval(() => setBlinkB((v) => !v), 700)
    return () => clearInterval(t)
  }, [mode, playing])

  const a = A.data
  const b = B.data
  const stretch = useMemo(() => (a && b ? makeStretch(a.pixels, b.pixels) : null), [a, b])
  const gray = (src: Float32Array | undefined) => (k: number): [number, number, number] | null => {
    if (!src || !stretch) return null
    const t = stretch(src[k])
    if (Number.isNaN(t)) return null
    const g = Math.round(t * 255)
    return [g, g, g]
  }

  // Difference only where both images saw the same wavelength at that pixel.
  const diff = useMemo(() => {
    if (!a || !b) return null
    const halfChannel = 0.5 * Math.min(a.image.bandwidthAtCenter, b.image.bandwidthAtCenter)
    const out = new Float32Array(GRID * GRID).fill(NaN)
    for (let k = 0; k < out.length; k++) {
      if (Math.abs(a.waves[k] - b.waves[k]) <= halfChannel) out[k] = b.pixels[k] - a.pixels[k]
    }
    const limit = percentile(out.map(Math.abs), 0.99) || 1
    const usable = out.filter(Number.isFinite).length / out.length
    return { out, limit, usable }
  }, [a, b])

  const loading = A.status === 'loading' || B.status === 'loading'
  const failed = A.status === 'error' ? A.message : B.status === 'error' ? B.message : null
  const visitLabel = (which: 'A' | 'B') => {
    const m = which === 'A' ? pair.a : pair.b
    return (
      <span>
        <span className={`dot dot-${which}`} /> Visit {which} · {fmtDate(m.dateObs)}
      </span>
    )
  }
  const usable = (px: Float32Array | undefined) => (px ? px.filter(Number.isFinite).length / px.length : 0)
  const visitSub = (which: 'A' | 'B') => {
    const m = which === 'A' ? pair.a : pair.b
    const pct = Math.round(usable((which === 'A' ? a : b)?.pixels) * 100)
    return `${m.wavelength.toFixed(3)} µm · D${m.detector ?? '?'} · ${m.release} · ${pct}% usable`
  }

  return (
    <div className="compare">
      <div className="mode-bar" role="toolbar" aria-label="Comparison mode">
        <button aria-pressed={mode === 'side'} onClick={() => setMode('side')}>Side by side</button>
        <button aria-pressed={mode === 'blink'} onClick={() => setMode('blink')}>Blink</button>
        <button
          aria-pressed={mode === 'diff'}
          onClick={() => setMode('diff')}
          disabled={!pair.matched}
          title={pair.matched ? undefined : 'Only available when both visits saw the same wavelength'}
        >
          Difference
        </button>
        <label className="toggle">
          <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} /> Markers
        </label>
      </div>

      {failed && <p className="state error">Could not load a visit image: {failed}</p>}
      {loading && <p className="state muted">Reading SPHEREx pixels from the archive…</p>}

      {a && b && !loading && (
        <div className={`fields fields-${mode === 'diff' ? 3 : mode === 'blink' ? 1 : 2}`}>
          {mode === 'side' && (
            <>
              <Field n={GRID} color={gray(a.pixels)} label={visitLabel('A')} sub={visitSub('A')} markers={markers} />
              <Field n={GRID} color={gray(b.pixels)} label={visitLabel('B')} sub={visitSub('B')} markers={markers} />
            </>
          )}
          {mode === 'blink' && (
            <Field
              n={GRID}
              color={gray(blinkB ? b.pixels : a.pixels)}
              label={visitLabel(blinkB ? 'B' : 'A')}
              sub={
                <button className="link" onClick={() => setPlaying((p) => !p)}>
                  {playing ? 'Pause' : 'Play'}
                </button>
              }
              markers={markers}
            />
          )}
          {mode === 'diff' && diff && (
            <>
              <Field n={GRID} color={gray(a.pixels)} label={visitLabel('A')} sub={visitSub('A')} markers={markers} />
              <Field n={GRID} color={gray(b.pixels)} label={visitLabel('B')} sub={visitSub('B')} markers={markers} />
              <Field
                n={GRID}
                color={(k) => (Number.isFinite(diff.out[k]) ? diverging(diff.out[k] / diff.limit) : null)}
                label={<>B − A</>}
                sub={`±${diff.limit.toFixed(2)} MJy/sr · ${(diff.usable * 100).toFixed(0)}% comparable`}
                markers={markers}
              />
            </>
          )}
        </div>
      )}

      {a && b && !loading && (
        <div className="compare-notes">
          <p className={pair.matched ? 'match ok' : 'match warn'}>
            {pair.matched ? '✓ Same colour' : '⚠ Different colours'}: Visit A saw {pair.a.wavelength.toFixed(3)} µm and Visit B saw{' '}
            {pair.b.wavelength.toFixed(3)} µm at the target (difference {Math.abs(pair.a.wavelength - pair.b.wavelength).toFixed(3)} µm; half a
            channel is {(0.5 * Math.min(pair.a.bandwidth, pair.b.bandwidth)).toFixed(3)} µm).
            {!pair.matched && ' Brightness differences here would mostly reflect colour, not change, so Difference is off.'}
          </p>
          {pair.a.release !== pair.b.release && (
            <p className="match warn">
              ⚠ Different data releases: Visit A is from {pair.a.release} and Visit B from {pair.b.release}. They were processed with different
              pipeline versions, so part of any brightness difference may be calibration rather than change.
            </p>
          )}
          <p className="muted small">
            <DataStatusBadge status="archive" /> pixels from the SPHEREx Level-2 images, zodiacal-light model subtracted. Hatched areas have no
            usable data: off the detector, or flagged by the SPHEREx pipeline (for example optical ghosts and blooming from a bright nearby
            source, cosmic-ray hits, persistence). Pick other visits on the left if a lot is hatched.{' '}
            <DataStatusBadge status="derived" /> resampled by this app onto a common north-up grid ({GRID}×{GRID} px at {SCALE_ARCSEC}″) and shown with one
            shared brightness scale. {mode === 'diff' && 'Hatched areas in B − A saw different wavelengths and are left out. '}
            Differences can come from noise, artifacts, asteroids or real changes. This app does not decide which.
          </p>
        </div>
      )}
    </div>
  )
}
