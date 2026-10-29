// SPHEREx spans 0.75–5.0 µm. Shows where one product's range sits in that span.
const MIN = 0.75
const MAX = 5.0

export function WavelengthBar({ min, max }: { min: number | null; max: number | null }) {
  const pct = (v: number) => `${(Math.min(Math.max((v - MIN) / (MAX - MIN), 0), 1) * 100).toFixed(1)}%`
  return (
    <div className="wl">
      <div className="wl-track">
        {min != null && max != null && (
          <div className="wl-range" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />
        )}
      </div>
      <div className="wl-scale">
        <span>0.75 µm</span>
        <span>near-infrared: invisible to the eye</span>
        <span>5.0 µm</span>
      </div>
    </div>
  )
}
