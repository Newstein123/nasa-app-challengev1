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
  source: 'IRSA SIA2 (live)' | 'IRSA SIA2 (cached fixture)'
  queryUrl: string
  retrievedAt: string
}

export type ObservationsResult =
  | {
      status: 'ok'
      items: Observation[]
      /** True when the archive reported more matches than MAXREC */
      truncated: boolean
      query: ObservationQuery
      provenance: Provenance
    }
  | {
      status: 'no-results'
      query: ObservationQuery
      provenance: Provenance
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
