import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type SkyAtlasHandle = {
  /** Resolve an object name (via CDS Sesame) and centre the view on it. */
  gotoObject: (name: string) => Promise<{ ra: number; dec: number }>
  gotoRaDec: (ra: number, dec: number) => void
}

type Props = {
  /** HiPS service URL of the background survey */
  hipsUrl: string
  target: { ra: number; dec: number; radius: number } | null
  footprints: { did: string; points: [number, number][]; center: [number, number] | null; fovDeg: number | null }[]
  selectedDid: string | null
  /** Draw every footprint; otherwise only the selected one is drawn. */
  showAllFootprints: boolean
  onPick: (ra: number, dec: number) => void
  onSelectFootprint: (did: string) => void
}

const normRa = (ra: number) => ((ra % 360) + 360) % 360

const COLOR_QUERY = '#5eead4'
const COLOR_FOOTPRINT = '#a78bfa'
const COLOR_SELECTED = '#facc15'

// Keep Aladin's own hover/selection styling (default bright green) in our palette.
const shapeStyle = (color: string, lineWidth: number) => ({
  color,
  lineWidth,
  hoverColor: COLOR_SELECTED,
  selectionColor: COLOR_SELECTED,
})

const HIT_TOLERANCE_PX = 6

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Returns the DID of the drawn outline whose edge is nearest to (x, y), if within tolerance. */
function outlineAt(aladin: any, drawn: Props['footprints'], x: number, y: number): string | null {
  let best: { did: string; d: number } | null = null
  for (const fp of drawn) {
    const px = fp.points.map(([ra, dec]) => aladin.world2pix(ra, dec) as [number, number] | undefined)
    for (let i = 0; i < px.length; i++) {
      const a = px[i]
      const b = px[(i + 1) % px.length]
      if (!a || !b) continue
      const d = distToSegment(x, y, a[0], a[1], b[0], b[1])
      if (d <= HIT_TOLERANCE_PX && (!best || d < best.d)) best = { did: fp.did, d }
    }
  }
  return best?.did ?? null
}

// Aladin Lite is browser-only (WebGL + WASM), so it is imported lazily on mount.
export const SkyAtlas = forwardRef<SkyAtlasHandle, Props>(function SkyAtlas(
  { hipsUrl, target, footprints, selectedDid, showAllFootprints, onPick, onSelectFootprint },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null)
  const aladinRef = useRef<any>(null)
  const libRef = useRef<any>(null)
  const overlaysRef = useRef<{ query: any; marker: any; footprints: any; selected: any } | null>(null)
  const onPickRef = useRef(onPick)
  onPickRef.current = onPick
  const onSelectRef = useRef(onSelectFootprint)
  onSelectRef.current = onSelectFootprint
  /** Outlines currently drawn on the map, for click hit-testing. */
  const drawnRef = useRef<Props['footprints']>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    import('aladin-lite')
      .then(async ({ default: A }) => {
        await A.init
        if (cancelled || !divRef.current) return
        const aladin = A.aladin(divRef.current, {
          survey: hipsUrl,
          fov: 1.5,
          target: target ? `${target.ra} ${target.dec}` : '83.8221 -5.3911',
          cooFrame: 'ICRS',
          showReticle: true,
          showCooGrid: false,
          showProjectionControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showShareControl: false,
          showSettingsControl: false,
          showSimbadPointerControl: false,
          showCooGridControl: false,
          showStatusBar: true,
          showFrame: true,
        })
        const query = A.graphicOverlay({ color: COLOR_QUERY, lineWidth: 2, name: 'Query region' })
        const fps = A.graphicOverlay({ color: COLOR_FOOTPRINT, lineWidth: 1, name: 'SPHEREx footprints' })
        const selected = A.graphicOverlay({ color: COLOR_SELECTED, lineWidth: 3, name: 'Selected product' })
        // Fixed pixel-size marker so the chosen point stays visible at any zoom.
        const marker = A.catalog({ name: 'Chosen point', shape: 'circle', sourceSize: 18, color: COLOR_QUERY, hoverColor: COLOR_QUERY, selectionColor: COLOR_QUERY })
        aladin.addOverlay(fps)
        aladin.addOverlay(selected)
        aladin.addOverlay(query)
        aladin.addCatalog(marker)
        // Clicking on a drawn outline selects that product; clicking anywhere
        // else moves the chosen point. Aladin's own hit-testing does not pick
        // up graphic-overlay polygons, so test the edges in screen pixels.
        aladin.on('click', (e: { ra: number; dec: number; x: number; y: number; isDragging: boolean }) => {
          if (e.isDragging) return
          const did = outlineAt(aladin, drawnRef.current, e.x, e.y)
          if (did) onSelectRef.current(did)
          else onPickRef.current(normRa(e.ra), e.dec)
        })
        libRef.current = A
        aladinRef.current = aladin
        if (import.meta.env.DEV) (window as any).__aladin = aladin
        overlaysRef.current = { query, marker, footprints: fps, selected }
        setReady(true)
      })
      .catch((e) => !cancelled && setLoadError(String(e?.message ?? e)))
    return () => {
      cancelled = true
    }
    // Initialised once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const aladin = aladinRef.current
    if (!ready || !aladin) return
    if (typeof aladin.setBaseImageLayer === 'function') aladin.setBaseImageLayer(hipsUrl)
    else aladin.setImageSurvey(hipsUrl)
  }, [ready, hipsUrl])

  useEffect(() => {
    const A = libRef.current
    const o = overlaysRef.current
    if (!ready || !A || !o) return
    o.query.removeAll()
    o.marker.removeAll()
    if (target) {
      o.query.add(A.circle(target.ra, target.dec, target.radius, shapeStyle(COLOR_QUERY, 2)))
      o.marker.addSources([A.source(target.ra, target.dec)])
    }
  }, [ready, target])

  useEffect(() => {
    const A = libRef.current
    const o = overlaysRef.current
    if (!ready || !A || !o) return
    o.footprints.removeAll()
    o.selected.removeAll()
    drawnRef.current = []
    for (const fp of footprints) {
      const isSelected = fp.did === selectedDid
      if (fp.points.length < 3 || (!isSelected && !showAllFootprints)) continue
      drawnRef.current.push(fp)
      // A.polygon mutates its input (drops the closing vertex), so pass a copy.
      const poly = A.polygon(
        fp.points.map((p) => [...p]),
        isSelected ? shapeStyle(COLOR_SELECTED, 3) : shapeStyle(COLOR_FOOTPRINT, 1),
      )
      ;(isSelected ? o.selected : o.footprints).add(poly)
    }
  }, [ready, footprints, selectedDid, showAllFootprints])

  // If the view is far wider than the selected image, zoom so its outline fills the view.
  useEffect(() => {
    const aladin = aladinRef.current
    if (!ready || !aladin || !selectedDid) return
    const fp = footprints.find((f) => f.did === selectedDid)
    if (!fp?.center || !fp.fovDeg) return
    const [viewW] = aladin.getFov()
    if (viewW > fp.fovDeg * 4) {
      aladin.gotoRaDec(fp.center[0], fp.center[1])
      aladin.setFoV(fp.fovDeg * 1.8)
    }
    // Only on selection change, not when the footprint list re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedDid])

  useImperativeHandle(
    ref,
    () => ({
      // Resolved by our server, which falls back to a Sesame mirror when CDS is down.
      gotoObject: async (name) => {
        const res = await fetch(`/api/resolve?${new URLSearchParams({ name })}`)
        const body = await res.json()
        if (body.status !== 'ok') throw new Error(body.message ?? `Could not resolve “${name}”`)
        const pos = { ra: normRa(body.ra), dec: body.dec }
        aladinRef.current?.gotoRaDec(pos.ra, pos.dec)
        return pos
      },
      gotoRaDec: (ra, dec) => aladinRef.current?.gotoRaDec(ra, dec),
    }),
    [],
  )

  return (
    <div className="atlas">
      <div ref={divRef} className="atlas-canvas" />
      {!ready && !loadError && <div className="atlas-overlay">Loading sky atlas…</div>}
      {loadError && <div className="atlas-overlay error">Sky atlas failed to load: {loadError}</div>}
    </div>
  )
})
