export type DataStatus = 'archive' | 'survey' | 'derived' | 'illustrative' | 'cached'

const LABELS: Record<DataStatus, { text: string; title: string }> = {
  archive: { text: 'Real · SPHEREx archive', title: 'Metadata returned live by the IRSA SPHEREx archive' },
  cached: { text: 'Real · cached archive response', title: 'A real IRSA archive response saved earlier, used in offline demo mode' },
  survey: { text: 'Real · survey imagery (not SPHEREx)', title: 'Public sky survey image tiles (HiPS) built by CDS, served by ESA ESASky' },
  derived: { text: 'Derived from archive metadata', title: 'Computed by this app from archive values, e.g. grouping or unit conversion' },
  illustrative: { text: 'Illustrative · not data', title: 'Design preview only. Contains no scientific measurements' },
}

export function DataStatusBadge({ status }: { status: DataStatus }) {
  const l = LABELS[status]
  return (
    <span className={`badge badge-${status}`} title={l.title}>
      {l.text}
    </span>
  )
}
