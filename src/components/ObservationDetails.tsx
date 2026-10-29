import type { Observation } from '../lib/types'
import { cutoutUrl, IRSA_SPHEREX_URL, siaIdUrl } from '../lib/links'
import { fmtDateTime, fmtDeg, fmtUm } from '../lib/format'
import { DataStatusBadge } from './DataStatusBadge'
import { WavelengthBar } from './WavelengthBar'

type Props = {
  obs: Observation
  target: { ra: number; dec: number }
  cached: boolean
}

/** Plain-language sentence built only from the archive values. */
function explain(o: Observation): string {
  const det = o.band.replace('SPHEREx-', 'detector ')
  const range =
    o.wavelengthMinUm != null && o.wavelengthMaxUm != null
      ? `light between ${o.wavelengthMinUm.toFixed(2)} and ${o.wavelengthMaxUm.toFixed(2)} micrometres, roughly ${(o.wavelengthMinUm / 0.65).toFixed(1)}–${(o.wavelengthMaxUm / 0.65).toFixed(1)}× the wavelength of red light`
      : 'near-infrared light'
  const when = o.dateStart ? ` on ${o.dateStart.slice(0, 10)}` : ''
  const exp = o.exposureS != null ? ` with a ${o.exposureS.toFixed(0)}-second exposure` : ''
  const fov = o.fovDeg != null ? ` The image spans about ${o.fovDeg.toFixed(1)}° of sky, about ${(o.fovDeg / 0.5).toFixed(0)} full Moons wide.` : ''
  return `SPHEREx recorded this image through ${det}${when}${exp}. It captures ${range}.${fov} Because SPHEREx uses a graded filter, the exact wavelength changes across the image: one picture holds a whole slice of the spectrum.`
}

export function ObservationDetails({ obs, target, cached }: Props) {
  const rows: [string, string][] = [
    ['Product ID', obs.obsId],
    ['Detector / band', obs.band],
    ['Wavelength range', `${fmtUm(obs.wavelengthMinUm)} – ${fmtUm(obs.wavelengthMaxUm)}`],
    ['Spectral resolving power', obs.spectralResolvingPower == null ? '—' : `R ≈ ${obs.spectralResolvingPower.toFixed(1)}`],
    ['Exposure start', fmtDateTime(obs.dateStart)],
    ['Exposure time', obs.exposureS == null ? '—' : `${obs.exposureS.toFixed(1)} s`],
    ['Image centre (RA, Dec)', `${fmtDeg(obs.centerRa)}°, ${fmtDeg(obs.centerDec)}°`],
    ['Field of view', obs.fovDeg == null ? '—' : `${obs.fovDeg.toFixed(2)}°`],
    ['Pixel scale', obs.pixelScaleArcsec == null ? '—' : `${obs.pixelScaleArcsec.toFixed(2)}″`],
    ['Calibration level', obs.calibLevel == null ? '—' : String(obs.calibLevel)],
    ['Collection', obs.collection],
    ['Public release', obs.releaseDate ?? '—'],
    ['Full file size', obs.sizeMB == null ? '—' : `${obs.sizeMB.toFixed(0)} MB (FITS)`],
  ]

  return (
    <section className="card">
      <header className="card-head">
        <h2>Observation details</h2>
        <DataStatusBadge status={cached ? 'cached' : 'archive'} />
      </header>
      <p className="explain">{explain(obs)}</p>
      <p className="muted small">
        <DataStatusBadge status="derived" /> The sentence above and the bar below are worded and computed by this app from the
        archive values in the table.
      </p>
      <WavelengthBar min={obs.wavelengthMinUm} max={obs.wavelengthMaxUm} />
      <dl className="kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className={k === 'Product ID' ? 'mono' : undefined}>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="links">
        <a href={cutoutUrl(obs.fitsUrl, target.ra, target.dec)} target="_blank" rel="noreferrer">
          Download cutout around region (FITS, ~4 MB)
        </a>
        <a href={obs.fitsUrl} target="_blank" rel="noreferrer">
          Full image (FITS{obs.sizeMB ? `, ${obs.sizeMB.toFixed(0)} MB` : ''})
        </a>
        <a href={siaIdUrl(obs.did, obs.collection)} target="_blank" rel="noreferrer">
          Archive record (IRSA SIA2)
        </a>
        <a href={IRSA_SPHEREX_URL} target="_blank" rel="noreferrer">
          IRSA SPHEREx archive
        </a>
      </div>
      <p className="muted small mono did">{obs.did}</p>
    </section>
  )
}
