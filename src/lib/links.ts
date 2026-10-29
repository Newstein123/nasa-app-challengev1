// Link builders usable on both server and client.

export const SIA_ENDPOINT = 'https://irsa.ipac.caltech.edu/SIA'
export const IRSA_SPHEREX_URL = 'https://irsa.ipac.caltech.edu/Missions/spherex.html'
export const SPHEREX_DOCS_URL = 'https://caltech-ipac.github.io/spherex-archive-documentation/'

export function siaRegionUrl(ra: number, dec: number, radius: number, collection: string, maxrec: number): string {
  const p = new URLSearchParams({
    COLLECTION: collection,
    POS: `CIRCLE ${ra} ${dec} ${radius}`,
    MAXREC: String(maxrec),
  })
  return `${SIA_ENDPOINT}?${p}`
}

export function siaIdUrl(did: string, collection: string): string {
  return `${SIA_ENDPOINT}?${new URLSearchParams({ COLLECTION: collection, ID: did })}`
}

/** IRSA IBE cutout of a SPHEREx image around a position (size in degrees). */
export function cutoutUrl(fitsUrl: string, ra: number, dec: number, sizeDeg = 0.1): string {
  return `${fitsUrl}?center=${ra.toFixed(5)},${dec.toFixed(5)}&size=${sizeDeg}`
}
