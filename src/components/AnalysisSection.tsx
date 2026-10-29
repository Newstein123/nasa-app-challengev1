import { isOk, type OkMeasurement, type Pair } from '../lib/analysis'
import { LightCurveChart, SpectrumChart } from './AnalysisCharts'
import { CompareViewer } from './CompareViewer'
import type { AnalysisState } from './usePointAnalysis'

type Props = {
  analysis: AnalysisState
  ms: OkMeasurement[]
  pair: Pair | null
  wavelength: number | null
  point: { ra: number; dec: number } | null
}

function Progress({ analysis }: { analysis: AnalysisState }) {
  if (analysis.phase === 'finding') return <p className="state muted">Finding SPHEREx images that contain this exact point…</p>
  if (analysis.phase !== 'measuring' && analysis.phase !== 'done') return null
  const done = analysis.measurements.length
  const ok = analysis.measurements.filter(isOk).length
  const flagged = analysis.measurements.filter((m) => m.status === 'flagged').length
  const failed = analysis.measurements.filter((m) => m.status === 'error').length
  return (
    <div className="progress-row">
      {(analysis.phase === 'measuring' || analysis.refining) && (
        <progress max={analysis.total} value={done} aria-label="Measurement progress" />
      )}
      <span className="muted small">
        {analysis.phase === 'measuring'
          ? `Measuring a first sample of images…`
          : analysis.refining
            ? `Measured ${done} of ${analysis.total} images · measuring more visits for better matches…`
            : `Measured ${analysis.total} images`}
        {analysis.available > analysis.total && ` (spread over time from ${analysis.available})`}
        {analysis.releases.length > 0 && ` in ${analysis.releases.join(' + ')}`}
        {' · '}
        {ok} usable
        {flagged > 0 && ` · ${flagged} flagged (saturated or artifacts)`}
        {failed > 0 && ` · ${failed} could not be read`}
      </span>
    </div>
  )
}

export function AnalysisSection({ analysis, ms, pair, wavelength, point }: Props) {
  if (!point) return null
  const settled = analysis.phase === 'done'
  return (
    <>
      <section className="card" id="compare">
        <header className="card-head">
          <h2>Compare observations</h2>
          <span className="muted small">Real SPHEREx pixels at your point</span>
        </header>
        <Progress analysis={analysis} />
        {analysis.phase === 'error' && <p className="state error">{analysis.message}</p>}
        {settled && analysis.total === 0 && (
          <p className="state">No SPHEREx image in this release contains this exact point. Try another release or point.</p>
        )}
        {settled && analysis.total > 0 && ms.length < 2 && (
          <p className="state">
            Fewer than two usable images here. Very bright spots (like the core of the Orion Nebula) saturate the
            detector and get flagged. Try a point a few arcminutes away.
          </p>
        )}
        {pair && <CompareViewer key={`${pair.a.url}|${pair.b.url}`} pair={pair} ra={point.ra} dec={point.dec} />}
      </section>
      {ms.length > 0 && wavelength != null && (
        <div className="charts-row">
          <LightCurveChart ms={ms} wavelength={wavelength} />
          <SpectrumChart ms={ms} wavelength={wavelength} />
        </div>
      )}
    </>
  )
}
