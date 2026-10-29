import type { Survey } from '../lib/types'
import { IRSA_SPHEREX_URL, SPHEREX_DOCS_URL } from '../lib/links'

export function LearnPanel({ survey }: { survey: Survey }) {
  return (
    <section className="card learn" id="learn">
      <header className="card-head">
        <h2>Understand what you are seeing</h2>
      </header>
      <div className="learn-grid">
        <div>
          <h3>The picture behind the map</h3>
          <p>
            The background is <strong>{survey.name}</strong> ({survey.wavelength}). {survey.description} It is real
            survey imagery, but it is <em>not</em> SPHEREx data. We use it so you can see where you are.
          </p>
          <p className="muted small">{survey.attribution}</p>
        </div>
        <div>
          <h3>What SPHEREx does</h3>
          <p>
            SPHEREx is a NASA space telescope, launched in March 2025, that maps the entire sky in 102 near-infrared
            colours between 0.75 and 5.0 micrometres. It measures how bright every patch of sky is at each colour.
            Astronomers use that to study how the universe began, how galaxies formed, and where frozen water and
            other ices hide in our galaxy.
          </p>
        </div>
        <div>
          <h3>Why the outlines?</h3>
          <p>
            Each purple outline is the real footprint of one SPHEREx image covering your circle, as reported by
            the archive. The ecliptic poles get the most overlap, which is why SPHEREx has extra-deep data there.
          </p>
        </div>
      </div>
      <p className="muted small">
        Sources: <a href={SPHEREX_DOCS_URL} target="_blank" rel="noreferrer">SPHEREx archive documentation</a> ·{' '}
        <a href={IRSA_SPHEREX_URL} target="_blank" rel="noreferrer">IRSA SPHEREx</a>
      </p>
    </section>
  )
}
