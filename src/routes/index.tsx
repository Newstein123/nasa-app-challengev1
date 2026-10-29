import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SkyAtlas, type SkyAtlasHandle } from '../components/SkyAtlas'
import { RegionPanel, type Preset } from '../components/RegionPanel'
import { ObservationList } from '../components/ObservationList'
import { ObservationDetails } from '../components/ObservationDetails'
import { LearnPanel } from '../components/LearnPanel'
import { ExportPanel } from '../components/ExportPanel'
import { AnalysisSection } from '../components/AnalysisSection'
import { ObservationSettings } from '../components/ObservationSettings'
import { usePointAnalysis } from '../components/usePointAnalysis'
import { DataStatusBadge } from '../components/DataStatusBadge'
import { COLLECTIONS, MAX_RADIUS_DEG, type Collection, type Observation, type ObservationsResult } from '../lib/types'
import { DEFAULT_SURVEY_ID, SURVEYS } from '../lib/surveys'
import { fmtDecDms, fmtRaHms } from '../lib/format'
import { bestStartingWavelength, isOk, type Pair, pickPair, wavelengthsMatch } from '../lib/analysis'

type Search = { ra?: number; dec?: number; r: number; c: Collection; s: string }

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}

export const Route = createFileRoute('/')({
  validateSearch: (raw: Record<string, unknown>): Search => {
    const ra = num(raw.ra)
    const dec = num(raw.dec)
    const r = num(raw.r)
    return {
      ra: ra != null && ra >= 0 && ra < 360 ? ra : undefined,
      dec: dec != null && dec >= -90 && dec <= 90 ? dec : undefined,
      r: r != null && r > 0 && r <= MAX_RADIUS_DEG ? r : 0.05,
      c: (COLLECTIONS as readonly unknown[]).includes(raw.c) ? (raw.c as Collection) : 'spherex_qr3',
      s: SURVEYS.some((x) => x.id === raw.s) ? (raw.s as string) : DEFAULT_SURVEY_ID,
    }
  },
  component: Explorer,
})

const round = (v: number) => Math.round(v * 1e5) / 1e5

function Explorer() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/' })
  const atlasRef = useRef<SkyAtlasHandle>(null)
  const [result, setResult] = useState<ObservationsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Observation | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const [showAllFootprints, setShowAllFootprints] = useState(false)

  const { ra, dec, r: radius, c: collection, s: surveyId } = search
  const target = useMemo(
    () => (ra != null && dec != null ? { ra, dec, radius } : null),
    [ra, dec, radius],
  )
  const survey = SURVEYS.find((x) => x.id === surveyId) ?? SURVEYS[0]

  const setSearch = useCallback(
    (patch: Partial<Search>) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
    [navigate],
  )

  const pick = useCallback(
    (pRa: number, pDec: number, opts: { recenter: boolean; collection?: Collection }) => {
      setSearch({ ra: round(pRa), dec: round(pDec), ...(opts.collection ? { c: opts.collection } : {}) })
      if (opts.recenter) atlasRef.current?.gotoRaDec(pRa, pDec)
    },
    [setSearch],
  )

  // Query the archive whenever the region or release changes (debounced for the radius slider).
  useEffect(() => {
    if (ra == null || dec == null) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setSelected(null)
      try {
        const qs = new URLSearchParams({ ra: String(ra), dec: String(dec), radius: String(radius), collection })
        const res = await fetch(`/api/observations?${qs}`, { signal: ctrl.signal })
        setResult((await res.json()) as ObservationsResult)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setResult({ status: 'error', kind: 'upstream', message: 'Could not reach the app server.', retryable: true })
      } finally {
        if (!ctrl.signal.aborted) setLoading(false)
      }
    }, 350)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [ra, dec, radius, collection, retryTick])

  const items = result?.status === 'ok' ? result.items : []

  // Point analysis: measure every SPHEREx image containing the chosen point.
  const point = useMemo(() => (ra != null && dec != null ? { ra, dec } : null), [ra, dec])
  const analysis = usePointAnalysis(point, collection, result != null && result.status !== 'error')
  const running =
    (analysis.phase === 'measuring' || analysis.phase === 'done') && analysis.point.ra === ra && analysis.point.dec === dec ? analysis : null
  const measurements = running?.measurements ?? []
  const snapshot = running?.snapshot ?? []
  // Charts update live; the automatic comparison only changes when a pass completes.
  const ms = useMemo(() => measurements.filter(isOk), [measurements])
  const stableMs = useMemo(() => snapshot.filter(isOk), [snapshot])
  const [userWave, setUserWave] = useState<number | null>(null)
  const [manual, setManual] = useState<{ a: string; b: string } | null>(null)
  useEffect(() => {
    setUserWave(null)
    setManual(null)
  }, [ra, dec, collection])
  const settled = running?.phase === 'done'
  const autoWave = useMemo(() => (settled ? bestStartingWavelength(stableMs) : (ms[0]?.wavelength ?? null)), [settled, stableMs, ms])
  const wavelength = userWave ?? autoWave
  const pair: Pair | null = useMemo(() => {
    if (!settled || wavelength == null) return null
    if (manual) {
      const a = ms.find((m) => m.url === manual.a)
      const b = ms.find((m) => m.url === manual.b)
      if (a && b && a !== b) return { a, b, matched: wavelengthsMatch(a.wavelength, a.bandwidth, b.wavelength, b.bandwidth) }
    }
    return pickPair(userWave == null ? stableMs : ms, wavelength)
  }, [settled, ms, stableMs, wavelength, manual, userWave])
  const footprints = useMemo(
    () =>
      items.map((o) => ({
        did: o.did,
        points: o.footprint,
        center: o.centerRa != null && o.centerDec != null ? ([o.centerRa, o.centerDec] as [number, number]) : null,
        fovDeg: o.fovDeg,
      })),
    [items],
  )
  const cached = result != null && result.status !== 'error' && result.provenance.source.includes('cached')

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            ✦
          </span>
          <div>
            <h1>Cosmic Time Machine</h1>
            <p>Pick a patch of sky and see what NASA’s SPHEREx telescope recorded there</p>
          </div>
        </div>
        <nav>
          <a href="#atlas">Explore</a>
          <a href="#compare">Compare</a>
          <a href="#learn">Learn</a>
          <a href="#about">About</a>
        </nav>
      </header>

      <main className="layout">
        <RegionPanel
          radius={radius}
          collection={collection}
          surveyId={surveyId}
          busy={loading}
          onSearchName={async (name) => {
            const p = await atlasRef.current!.gotoObject(name)
            pick(p.ra, p.dec, { recenter: false })
          }}
          onCoordinates={(pRa, pDec) => pick(pRa, pDec, { recenter: true })}
          onPreset={(p: Preset) => pick(p.ra, p.dec, { recenter: true, collection: p.collection })}
          onRadius={(r) => setSearch({ r })}
          onCollection={(c) => setSearch({ c })}
          onSurvey={(s) => setSearch({ s })}
        >
          <ObservationSettings
            ms={settled ? ms : []}
            wavelength={wavelength}
            pair={pair}
            onWavelength={(w) => {
              setUserWave(w)
              setManual(null)
            }}
            onVisit={(which, url) => {
              if (!pair) return
              setManual({ a: which === 'a' ? url : pair.a.url, b: which === 'b' ? url : pair.b.url })
            }}
          />
        </RegionPanel>

        <section className="center" id="atlas">
          <SkyAtlas
            ref={atlasRef}
            surveyId={surveyId}
            target={target}
            footprints={footprints}
            selectedDid={selected?.did ?? null}
            showAllFootprints={showAllFootprints}
            onPick={(pRa, pDec) => pick(pRa, pDec, { recenter: false })}
            onSelectFootprint={(did) => setSelected(items.find((o) => o.did === did) ?? null)}
          />
          <div className="atlas-caption">
            <DataStatusBadge status="survey" />
            <span>
              {survey.name} · {survey.wavelength}
            </span>
            {target && (
              <span className="mono">
                RA {fmtRaHms(target.ra)} · Dec {fmtDecDms(target.dec)} · r = {radius.toFixed(2)}°
              </span>
            )}
            {items.length > 0 && (
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={showAllFootprints}
                  onChange={(e) => setShowAllFootprints(e.target.checked)}
                />
                Show all {items.length} SPHEREx image outlines
              </label>
            )}
          </div>
          <p className="legend">
            <span className="swatch query" /> your chosen point and search circle
            <span className="swatch selected" /> selected SPHEREx image
            {showAllFootprints && (
              <>
                <span className="swatch footprint" /> other SPHEREx images (click one to select it)
              </>
            )}
          </p>
          <p className="attribution">{survey.attribution} Atlas: Aladin Lite (CDS, Strasbourg).</p>
          <AnalysisSection
            analysis={running ?? (analysis.phase === 'measuring' || analysis.phase === 'done' ? { phase: 'finding' } : analysis)}
            ms={ms}
            pair={pair}
            wavelength={wavelength}
            point={point}
          />
          <LearnPanel survey={survey} />
        </section>

        <aside className="panel right">
          <ObservationList
            result={loading ? null : result}
            loading={loading}
            selectedDid={selected?.did ?? null}
            onSelect={setSelected}
            onRetry={() => setRetryTick((t) => t + 1)}
          />
          {selected && target && <ObservationDetails obs={selected} target={target} cached={cached} />}
          {result && result.status !== 'error' && !loading && (
            <ExportPanel result={result} survey={survey} selected={selected} analysis={settled ? { measurements: ms, pair, wavelength } : null} />
          )}
        </aside>
      </main>

      <footer className="about" id="about">
        <h2>About the data</h2>
        <p>
          Every SPHEREx detail on this page comes live from NASA/IPAC’s{' '}
          <a href="https://irsa.ipac.caltech.edu/Missions/spherex.html" target="_blank" rel="noreferrer">
            IRSA archive
          </a>
          . If the archive returns nothing, we tell you. We never fill gaps with made-up results. Background
          imagery is from public sky surveys and is labelled as such. Comparisons, spectra and light curves are
          calculated by this app from real SPHEREx pixels and are labelled “derived”. Labels show which parts are
          real data and which are calculated from it.
        </p>
        <p className="muted small">NASA Space Apps Challenge 2026 · Cosmic Time Machine team</p>
      </footer>
    </div>
  )
}
