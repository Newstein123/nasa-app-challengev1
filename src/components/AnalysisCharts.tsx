import { fmtDate, inChannel, type OkMeasurement } from '../lib/analysis'
import { DataStatusBadge } from './DataStatusBadge'
import { ScatterChart } from './ScatterChart'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pointLabel = (m: OkMeasurement) =>
  `${fmtDate(m.dateObs)} · ${m.wavelength.toFixed(3)} µm · ${m.surfaceBrightness.toFixed(3)} ± ${m.uncertainty.toFixed(3)} MJy/sr (D${m.detector ?? '?'}, ${m.release})`

const DAY = 86_400_000

/** Calendar-aligned ticks: days, weeks or months depending on the span. */
function timeTicks(lo: number, hi: number): { ticks: number[]; format: (t: number) => string } {
  const span = hi - lo
  if (span <= 45 * DAY) {
    const step = [1, 2, 7, 14].find((d) => span / (d * DAY) <= 6) ?? 14
    const start = Math.ceil(lo / DAY) * DAY
    const ticks: number[] = []
    for (let t = start; t <= hi; t += step * DAY) ticks.push(t)
    return { ticks, format: (t) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` } }
  }
  const months = [1, 2, 3, 6, 12].find((m) => span / (m * 30.4 * DAY) <= 6) ?? 12
  const d0 = new Date(lo)
  const ticks: number[] = []
  for (let t = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); t.getTime() <= hi; t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + months, 1))) {
    ticks.push(t.getTime())
  }
  return { ticks, format: (t) => { const d = new Date(t); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` } }
}

export function SpectrumChart({ ms, wavelength }: { ms: OkMeasurement[]; wavelength: number }) {
  const channel = new Set(inChannel(ms, wavelength))
  const bw = [...channel][0]?.bandwidth ?? 0.05
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>Spectrum at this point</h2>
        <DataStatusBadge status="derived" />
      </header>
      {ms.length === 0 ? (
        <p className="state muted">No usable measurements yet.</p>
      ) : (
        <ScatterChart
          ariaLabel={`Spectrum: ${ms.length} SPHEREx measurements of surface brightness against wavelength`}
          points={ms.map((m) => ({ x: m.wavelength, y: m.surfaceBrightness, err: m.uncertainty, emphasis: channel.has(m), label: pointLabel(m) }))}
          xDomain={[0.7, 5.05]}
          xTicks={[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]}
          formatX={(x) => String(x)}
          xLabel="Wavelength (µm)"
          yLabel="Surface brightness (MJy/sr)"
          band={[wavelength - bw / 2, wavelength + bw / 2]}
        />
      )}
      <p className="muted small">
        Each dot is one SPHEREx exposure: the average of the usable pixels in a 3×3 box (18″) at your point, with
        zodiacal light removed. Bars show ±1σ. Highlighted dots fall in the selected channel. These are quick-look
        values, not catalogue photometry.
      </p>
    </section>
  )
}

export function LightCurveChart({ ms, wavelength }: { ms: OkMeasurement[]; wavelength: number }) {
  const inBand = inChannel(ms, wavelength).filter((m) => m.dateObs)
  const times = inBand.map((m) => Date.parse(m.dateObs!))
  const lo = Math.min(...times)
  const hi = Math.max(...times)
  const pad = Math.max((hi - lo) * 0.06, DAY * 2)
  const { ticks, format } = timeTicks(lo - pad, hi + pad)
  const releases = [...new Set(inBand.map((m) => m.release))]
  return (
    <section className="card chart-card">
      <header className="card-head">
        <h2>Brightness over time · {wavelength.toFixed(2)} µm</h2>
        <DataStatusBadge status="derived" />
      </header>
      {inBand.length < 2 ? (
        <p className="state muted">
          {inBand.length === 0 ? 'No visits' : 'Only one visit'} measured this point at {wavelength.toFixed(2)} µm. Move the wavelength slider to a
          colour with repeat visits (highlighted in the spectrum).
        </p>
      ) : (
        <ScatterChart
          ariaLabel={`Light curve: ${inBand.length} visits at ${wavelength.toFixed(2)} micrometres`}
          points={inBand.map((m) => ({ x: Date.parse(m.dateObs!), y: m.surfaceBrightness, err: m.uncertainty, emphasis: true, label: pointLabel(m) }))}
          xDomain={[lo - pad, hi + pad]}
          xTicks={ticks}
          formatX={format}
          xLabel="Date of visit (UTC)"
          yLabel="Surface brightness (MJy/sr)"
          line
        />
      )}
      <p className="muted small">
        Only visits that saw the same colour (within half a channel) are compared, so changes here are not just
        changes in wavelength.
        {releases.length > 1 && ` Points come from ${releases.join(' and ')}, which were processed with different pipeline versions, so part of any jump between seasons may be calibration.`}{' '}
        Real astrophysical variability still needs expert checking.
      </p>
    </section>
  )
}
