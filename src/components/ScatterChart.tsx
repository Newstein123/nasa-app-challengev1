import { useEffect, useMemo, useRef, useState } from 'react'

export type ChartPoint = { x: number; y: number; err: number; emphasis: boolean; label: string }

type Props = {
  points: ChartPoint[]
  xDomain: [number, number]
  xTicks: number[]
  formatX: (x: number) => string
  xLabel: string
  yLabel: string
  /** Shaded vertical band, e.g. the selected wavelength channel */
  band?: [number, number]
  /** Connect emphasised points in x order */
  line?: boolean
  ariaLabel: string
}

const H = 240
const M = { top: 12, right: 16, bottom: 42, left: 58 }

function niceTicks(lo: number, hi: number, count = 5): number[] {
  const span = hi - lo || 1
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 1) ?? step0
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)))
  return out
}

export function ScatterChart({ points, xDomain, xTicks, formatX, xLabel, yLabel, band, line, ariaLabel }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  // Draw at the real pixel width so text and marks keep their intended size.
  const [W, setW] = useState(520)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { yDomain, yTicks } = useMemo(() => {
    const lo = Math.min(...points.map((p) => p.y - p.err))
    const hi = Math.max(...points.map((p) => p.y + p.err))
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
    const ticks = niceTicks(lo - pad, hi + pad)
    return { yDomain: [Math.min(lo - pad, ticks[0]), Math.max(hi + pad, ticks.at(-1)!)] as [number, number], yTicks: ticks }
  }, [points])

  const sx = (x: number) => M.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * (W - M.left - M.right)
  const sy = (y: number) => H - M.bottom - ((y - yDomain[0]) / (yDomain[1] - yDomain[0])) * (H - M.top - M.bottom)
  const ordered = [...points].sort((a, b) => Number(a.emphasis) - Number(b.emphasis)) // emphasised on top
  const linePts = line ? points.filter((p) => p.emphasis).sort((a, b) => a.x - b.x) : []

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = svgRef.current!.getBoundingClientRect()
    const mx = ((e.clientX - r.left) / r.width) * W
    const my = ((e.clientY - r.top) / r.height) * H
    let best: number | null = null
    let bestD = 24 // hit radius in chart units, larger than the mark
    points.forEach((p, i) => {
      const d = Math.hypot(sx(p.x) - mx, sy(p.y) - my)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    setHover(best)
  }

  const hp = hover != null ? points[hover] : null
  return (
    <div className="chart" ref={boxRef}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {band && (
          <rect className="ch-band" x={sx(band[0])} y={M.top} width={Math.max(2, sx(band[1]) - sx(band[0]))} height={H - M.top - M.bottom} />
        )}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line className="ch-grid" x1={M.left} x2={W - M.right} y1={sy(t)} y2={sy(t)} />
            <text className="ch-tick" x={M.left - 8} y={sy(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={`x${t}`} className="ch-tick" x={sx(t)} y={H - M.bottom + 16} textAnchor="middle">{formatX(t)}</text>
        ))}
        <line className="ch-axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        <text className="ch-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">{xLabel}</text>
        <text className="ch-label" transform={`translate(14, ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {linePts.length > 1 && <polyline className="ch-line" points={linePts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />}
        {ordered.map((p, i) => (
          <g key={i} className={p.emphasis ? 'ch-pt em' : 'ch-pt'}>
            <line x1={sx(p.x)} x2={sx(p.x)} y1={sy(p.y - p.err)} y2={sy(p.y + p.err)} />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={p.emphasis ? 4.5 : 3.5} />
          </g>
        ))}
        {hp && <circle className="ch-hover" cx={sx(hp.x)} cy={sy(hp.y)} r={7} />}
      </svg>
      {hp && (
        <div
          className="ch-tip"
          style={{ left: `${(sx(hp.x) / W) * 100}%`, top: `${(sy(hp.y) / H) * 100}%` }}
          role="status"
        >
          {hp.label}
        </div>
      )}
    </div>
  )
}
