import { useState } from 'react'
import type { Observation, ObservationsResult, Survey } from '../lib/types'
import { fmtDecDms, fmtRaHms, fmtUm } from '../lib/format'
import type { OkMeasurement, Pair } from '../lib/analysis'

type Props = {
  result: ObservationsResult
  survey: Survey
  selected: Observation | null
  analysis: { measurements: OkMeasurement[]; pair: Pair | null; wavelength: number | null } | null
}

export function buildSummary({ result, survey, selected, analysis }: Props) {
  if (result.status === 'error') return null
  const q = result.query
  const items = result.status === 'ok' ? result.items : []
  return {
    app: 'Cosmic Time Machine',
    generatedAt: new Date().toISOString(),
    region: { ra: q.ra, dec: q.dec, radiusDeg: q.radius, frame: 'ICRS' },
    backgroundSurvey: { id: survey.id, name: survey.name, attribution: survey.attribution, dataStatus: 'real survey imagery, not SPHEREx' },
    spherex: {
      collection: q.collection,
      status: result.status,
      productCount: items.length,
      truncated: result.status === 'ok' ? result.truncated : false,
      dataStatus: result.provenance.source,
      queryUrl: result.provenance.queryUrl,
      retrievedAt: result.provenance.retrievedAt,
      products: items.map((o) => ({
        did: o.did,
        band: o.band,
        wavelengthUm: [o.wavelengthMinUm, o.wavelengthMaxUm],
        dateStart: o.dateStart,
        fitsUrl: o.fitsUrl,
      })),
    },
    selectedProduct: selected?.did ?? null,
    pointAnalysis: analysis && {
      dataStatus: 'derived by this app from SPHEREx L2 pixels (3×3 box mean, zodi model subtracted, flagged pixels excluded); quick-look, not catalogue photometry',
      selectedWavelengthUm: analysis.wavelength,
      comparedVisits: analysis.pair && {
        a: analysis.pair.a.url,
        b: analysis.pair.b.url,
        sameChannel: analysis.pair.matched,
      },
      measurements: analysis.measurements.map((m) => ({
        fitsUrl: m.url,
        dateObs: m.dateObs,
        wavelengthUm: m.wavelength,
        bandwidthUm: m.bandwidth,
        surfaceBrightnessMJySr: m.surfaceBrightness,
        uncertaintyMJySr: m.uncertainty,
      })),
    },
  }
}

function toMarkdown(s: NonNullable<ReturnType<typeof buildSummary>>, selected: Observation | null): string {
  const r = s.region
  const lines = [
    `# Cosmic Time Machine: region summary`,
    ``,
    `- **Position (ICRS):** RA ${r.ra.toFixed(4)}° (${fmtRaHms(r.ra)}), Dec ${r.dec.toFixed(4)}° (${fmtDecDms(r.dec)})`,
    `- **Search radius:** ${r.radiusDeg}°`,
    `- **Background imagery:** ${s.backgroundSurvey.name}. ${s.backgroundSurvey.attribution} (not SPHEREx data)`,
    `- **SPHEREx (${s.spherex.collection}):** ${
      s.spherex.status === 'ok'
        ? `${s.spherex.productCount}${s.spherex.truncated ? '+' : ''} products found`
        : 'no products found in this release'
    }`,
    `- **Data source:** ${s.spherex.dataStatus}, retrieved ${s.spherex.retrievedAt}`,
    `- **Reproduce the query:** ${s.spherex.queryUrl}`,
  ]
  const pa = s.pointAnalysis
  if (pa) {
    lines.push(
      ``,
      `## Point analysis (derived)`,
      `- ${pa.measurements.length} usable SPHEREx measurements at this position`,
    )
    if (pa.comparedVisits) {
      lines.push(
        `- Compared visits (${pa.comparedVisits.sameChannel ? 'same channel' : 'different wavelengths'}):`,
        `  - A: ${pa.comparedVisits.a}`,
        `  - B: ${pa.comparedVisits.b}`,
      )
    }
  }
  if (selected) {
    lines.push(
      ``,
      `## Selected product`,
      `- ${selected.obsId} · ${selected.band} · ${fmtUm(selected.wavelengthMinUm)}–${fmtUm(selected.wavelengthMaxUm)} · ${selected.dateStart ?? 'date unknown'}`,
      `- ${selected.fitsUrl}`,
    )
  }
  lines.push(``, `_Generated ${s.generatedAt}. All values come from the archive response above._`)
  return lines.join('\n')
}

export function ExportPanel(props: Props) {
  const [copied, setCopied] = useState<string | null>(null)
  const summary = buildSummary(props)
  if (!summary) return null

  const flash = (what: string) => {
    setCopied(what)
    setTimeout(() => setCopied(null), 1800)
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      flash(what)
    } catch {
      flash('Copy failed. Your browser blocked clipboard access')
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    const r = summary!.region
    a.href = URL.createObjectURL(blob)
    a.download = `cosmic-time-machine_${r.ra.toFixed(3)}_${r.dec.toFixed(3)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="card">
      <header className="card-head">
        <h2>Share this region</h2>
      </header>
      <div className="export-actions">
        <button onClick={() => copy(window.location.href, 'Link')}>Copy link</button>
        <button onClick={() => copy(toMarkdown(summary, props.selected), 'Summary')}>Copy summary</button>
        <button onClick={download}>Download JSON</button>
      </div>
      {copied && <p className="muted small">{copied.startsWith('Copy failed') ? copied : `${copied} copied.`}</p>}
      <p className="muted small">Includes coordinates, data sources, and the exact archive query so anyone can retrace it.</p>
    </section>
  )
}
