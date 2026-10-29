export const fmtDeg = (v: number | null, digits = 4) => (v == null ? '—' : v.toFixed(digits))

export function fmtRaHms(ra: number): string {
  const h = ra / 15
  const hh = Math.floor(h)
  const mm = Math.floor((h - hh) * 60)
  const ss = ((h - hh) * 60 - mm) * 60
  return `${String(hh).padStart(2, '0')}h ${String(mm).padStart(2, '0')}m ${ss.toFixed(1).padStart(4, '0')}s`
}

export function fmtDecDms(dec: number): string {
  const sign = dec < 0 ? '−' : '+'
  const a = Math.abs(dec)
  const dd = Math.floor(a)
  const mm = Math.floor((a - dd) * 60)
  const ss = ((a - dd) * 60 - mm) * 60
  return `${sign}${String(dd).padStart(2, '0')}° ${String(mm).padStart(2, '0')}′ ${ss.toFixed(1).padStart(4, '0')}″`
}

export const fmtUm = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)} µm`)

export const fmtDateTime = (iso: string | null) => (iso == null ? '—' : iso.replace('T', ' ').slice(0, 19) + ' UTC')

export const fmtDay = (iso: string | null) => (iso == null ? 'Unknown date' : iso.slice(0, 10))
