import { z } from 'zod'
import { COLLECTIONS, MAX_MEASURE_PER_REQUEST, MAX_RADIUS_DEG } from '../lib/types'

export const observationQuerySchema = z.object({
  ra: z.coerce.number().finite().min(0).lt(360),
  dec: z.coerce.number().finite().min(-90).max(90),
  radius: z.coerce.number().finite().gt(0).max(MAX_RADIUS_DEG),
  collection: z.enum(COLLECTIONS).default('spherex_qr3'),
})

// e.g. ivo://irsa.ipac/spherex_qr3?2026W36_2A_0209_2/D1
const DID_PATTERN = /^ivo:\/\/irsa\.ipac\/(spherex_[a-z0-9_]+)\?[\w./-]+$/

/** Returns the collection a SPHEREx DID belongs to, or null if it is not one we accept. */
export function collectionFromDid(did: string): string | null {
  const m = DID_PATTERN.exec(did)
  if (!m || !(COLLECTIONS as readonly string[]).includes(m[1])) return null
  return m[1]
}

export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join('.') || 'query'}: ${i.message}`).join('; ')
}

const spherexUrl = z.string().regex(/^https:\/\/irsa\.ipac\.caltech\.edu\/ibe\/data\/spherex\/[\w./-]+\.fits$/, 'must be a SPHEREx archive file URL')

export const measureBodySchema = z.object({
  ra: z.number().finite().min(0).lt(360),
  dec: z.number().finite().min(-90).max(90),
  urls: z.array(spherexUrl).min(1).max(MAX_MEASURE_PER_REQUEST),
})

export const visitQuerySchema = z.object({
  url: spherexUrl,
  ra: z.coerce.number().finite().min(0).lt(360),
  dec: z.coerce.number().finite().min(-90).max(90),
  n: z.coerce.number().int().min(16).max(128).default(72),
  scale: z.coerce.number().finite().min(3).max(30).default(6.15),
})
