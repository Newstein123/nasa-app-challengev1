// Shared between the server boundary and the UI. Every value here comes from
// the IRSA archive response; nothing is synthesized.

export const COLLECTIONS = [
  'spherex_qr3',
  'spherex_qr2',
  'spherex_qr3_deep',
  'spherex_qr2_deep',
] as const
export type Collection = (typeof COLLECTIONS)[number]

export const MAX_RADIUS_DEG = 0.5

export type Observation = {
  /** IVOA publisher DID, unique per product, e.g. ivo://irsa.ipac/spherex_qr3?2026W36_2A_0209_2/D1 */
  did: string
  obsId: string
  collection: string
  /** Detector band name, e.g. "SPHEREx-D1" */
  band: string
  wavelengthMinUm: number | null
  wavelengthMaxUm: number | null
  spectralResolvingPower: number | null
  /** ISO 8601 UTC start of exposure, converted from MJD */
  dateStart: string | null
  dateEnd: string | null
  exposureS: number | null
  centerRa: number | null
  centerDec: number | null
  /** Footprint vertices [ra, dec] in ICRS degrees */
  footprint: [number, number][]
  fovDeg: number | null
  pixelScaleArcsec: number | null
  calibLevel: number | null
  fitsUrl: string
  sizeMB: number | null
  releaseDate: string | null
  surveyName: string | null
}

export type ObservationQuery = {
  ra: number
  dec: number
  radius: number
  collection: Collection
}

export type ArchiveErrorKind = 'timeout' | 'upstream' | 'parse' | 'bad-request'

export type Provenance = {
  source: 'IRSA SIA2 (live)' | 'IRSA SIA2 (cached fixture)' | 'IRSA SIA2 (local index)'
  queryUrl: string
  retrievedAt: string
}

/** How a region query relates to the synced archive index (only for watched regions). */
export type SyncInfo = {
  regionName: string
  /** When the index was last refreshed for this region */
  syncedAt: string
  /** Products that first appeared in the archive at the latest sync */
  newSinceLastSync: string[]
  /** Products in this live response that the index has not seen yet */
  notInIndex: string[]
  /** Set when the live archive failed and these items come from the index */
  fallbackReason?: string
}

export type ObservationsResult =
  | {
      status: 'ok'
      items: Observation[]
      /** True when the archive reported more matches than MAXREC */
      truncated: boolean
      query: ObservationQuery
      provenance: Provenance
      sync?: SyncInfo
    }
  | {
      status: 'no-results'
      query: ObservationQuery
      provenance: Provenance
      sync?: SyncInfo
    }
  | {
      status: 'error'
      kind: ArchiveErrorKind
      message: string
      retryable: boolean
      query?: ObservationQuery
    }

export type Survey = {
  id: string
  name: string
  wavelength: string
  description: string
  attribution: string
  url: string
  /** HiPS tile service Aladin loads directly (a CORS-enabled mirror, so the map does not depend on one host). */
  hipsUrl: string
}

// ---------- point analysis (derived from SPHEREx pixels by this app) ----------

export type Measurement =
  | {
      status: 'ok'
      url: string
      /** Data release from the file path, e.g. "QR3" */
      release: string
      obsId: string | null
      detector: number | null
      dateObs: string | null
      /** Central wavelength at the target pixel, µm */
      wavelength: number
      /** Channel bandwidth at the target pixel, µm */
      bandwidth: number
      /** Mean zodi-subtracted surface brightness of good pixels in a 3×3 box, MJy/sr */
      surfaceBrightness: number
      /** 1σ uncertainty of that mean from the VARIANCE plane, MJy/sr */
      uncertainty: number
      goodPixels: number
      /** Distance of the point from the nearest detector edge, pixels */
      edgePx: number
    }
  | { status: 'flagged' | 'off-image' | 'error'; url: string; message: string }

export type VisitImage = {
  url: string
  obsId: string | null
  detector: number | null
  dateObs: string | null
  /** Output grid: n×n pixels, north up, east left, centred on the target */
  n: number
  scaleArcsec: number
  /** Row-major, top row = north. base64 of little-endian Float32; NaN = no data */
  pixels: string
  /** Wavelength (µm) seen at each output pixel, same layout */
  wavelengths: string
  waveAtCenter: number
  bandwidthAtCenter: number
}

export const MAX_MEASURE_PER_REQUEST = 6

/** Release name ("QR2", "QR3", …) from a SPHEREx archive file URL. */
export const releaseOf = (url: string) => /\/spherex\/(qr\d+)\//i.exec(url)?.[1].toUpperCase() ?? 'unknown'

/** Releases analysed together with the selected one: same kind (all-sky or deep), all versions. */
export function releaseFamily(c: Collection): Collection[] {
  return COLLECTIONS.filter((x) => x.endsWith('_deep') === c.endsWith('_deep'))
}

// ---------- archive index (written by scripts/sync.ts, bundled at build time) ----------

export type IndexedObservation = Observation & {
  /** First sync that saw this product */
  firstSeenAt: string
  /** Set when a later sync no longer found it in the archive; kept, never silently dropped */
  missingSince?: string
}

export type IndexedRegion = {
  name: string
  ra: number
  dec: number
  radius: number
  collection: Collection
  status: 'ok' | 'stale'
  /** Last successful archive query for this region */
  syncedAt: string | null
  /** Error of the latest attempt when status is 'stale' */
  error?: string
  /** True when the archive capped the response at MAXREC */
  truncated: boolean
  queryUrl: string
  newSinceLastSync: string[]
  items: IndexedObservation[]
}

export type ArchiveIndex = {
  version: 1
  /** Last run in which every region synced */
  lastSuccessfulSync: string | null
  lastAttempt: string | null
  regions: Record<string, IndexedRegion>
}

export type SyncStatus = {
  lastSuccessfulSync: string | null
  lastAttempt: string | null
  regions: { key: string; name: string; collection: Collection; status: 'ok' | 'stale'; syncedAt: string | null; error?: string; count: number; newCount: number }[]
}
