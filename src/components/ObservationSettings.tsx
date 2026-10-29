import { fmtDate, inChannel, type OkMeasurement, type Pair } from '../lib/analysis'

type Props = {
  ms: OkMeasurement[]
  wavelength: number | null
  pair: Pair | null
  onWavelength: (w: number) => void
  onVisit: (which: 'a' | 'b', url: string) => void
}

const option = (m: OkMeasurement) => `${fmtDate(m.dateObs)} · ${m.wavelength.toFixed(3)} µm · D${m.detector ?? '?'} · ${m.release}`

export function ObservationSettings({ ms, wavelength, pair, onWavelength, onVisit }: Props) {
  if (ms.length === 0 || wavelength == null) {
    return (
      <div className="obs-settings">
        <h2>2. Observation settings</h2>
        <p className="hint">Pick a point to see which SPHEREx visits measured it.</p>
      </div>
    )
  }
  const byDate = [...ms].sort((a, b) => (a.dateObs ?? '').localeCompare(b.dateObs ?? ''))
  const inBand = inChannel(ms, wavelength).length
  return (
    <div className="obs-settings">
      <h2>2. Observation settings</h2>
      <label className="setting">
        <span>
          <span className="dot dot-A" /> Visit A
        </span>
        <select value={pair?.a.url ?? ''} onChange={(e) => onVisit('a', e.target.value)}>
          {byDate.map((m) => (
            <option key={m.url} value={m.url}>{option(m)}</option>
          ))}
        </select>
      </label>
      <label className="setting">
        <span>
          <span className="dot dot-B" /> Visit B
        </span>
        <select value={pair?.b.url ?? ''} onChange={(e) => onVisit('b', e.target.value)}>
          {byDate.map((m) => (
            <option key={m.url} value={m.url}>{option(m)}</option>
          ))}
        </select>
      </label>
      <label className="setting">
        <span>Wavelength (near-infrared)</span>
        <input
          className="wl-slider"
          type="range"
          min={0.75}
          max={5}
          step={0.005}
          value={wavelength}
          onChange={(e) => onWavelength(Number(e.target.value))}
          aria-valuetext={`${wavelength.toFixed(2)} micrometres`}
        />
        <span className="wl-readout">
          <strong>{wavelength.toFixed(2)} µm</strong>
          <span className="muted small">
            {inBand} visit{inBand === 1 ? '' : 's'} in this channel
          </span>
        </span>
        <span className="wl-scale">
          <span>0.75 µm</span>
          <span>5.0 µm</span>
        </span>
      </label>
      <p className="hint">
        SPHEREx sees each spot in many colours on different days. Moving the slider picks two visits in the same
        colour, so the comparison is fair.
      </p>
    </div>
  )
}
