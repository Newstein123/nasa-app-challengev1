// Object-name resolution with CDS Sesame. CDS is tried first; the CfA mirror
// keeps name search working when the Strasbourg servers are unreachable.
const SESAME_MIRRORS = [
  'https://cds.unistra.fr/cgi-bin/nph-sesame/-ox/SNV?',
  'https://vizier.cfa.harvard.edu/viz-bin/nph-sesame/-ox/SNV?',
]
const TIMEOUT_MS = 6000

export type Resolved = { ra: number; dec: number; source: string }

/** Parses the first position out of a Sesame XML response. */
export function parseSesame(xml: string): { ra: number; dec: number } | null {
  const ra = Number(/<jradeg>\s*([-+\d.eE]+)\s*<\/jradeg>/.exec(xml)?.[1])
  const dec = Number(/<jdedeg>\s*([-+\d.eE]+)\s*<\/jdedeg>/.exec(xml)?.[1])
  return Number.isFinite(ra) && Number.isFinite(dec) ? { ra, dec } : null
}

/** Returns the position, null if no mirror knows the name, or throws if none could be reached. */
export async function resolveName(name: string): Promise<Resolved | null> {
  // Ask all mirrors at once and take the first position, so a dead mirror costs no extra wait.
  const ctrl = new AbortController()
  const signal = AbortSignal.any([ctrl.signal, AbortSignal.timeout(TIMEOUT_MS)])
  const attempts = SESAME_MIRRORS.map(async (base) => {
    const res = await fetch(base + encodeURIComponent(name), { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { pos: parseSesame(await res.text()), source: new URL(base).host }
  })
  try {
    const found = await Promise.any(attempts.map((a) => a.then((r) => (r.pos ? r : Promise.reject(r)))))
    return { ...found.pos!, source: found.source }
  } catch {
    const answered = (await Promise.allSettled(attempts)).some((r) => r.status === 'fulfilled')
    if (!answered) throw new Error('The name resolver (CDS Sesame) is unreachable right now. Try coordinates instead.')
    return null
  } finally {
    ctrl.abort()
  }
}
