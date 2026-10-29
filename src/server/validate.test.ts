import { describe, expect, it } from 'vitest'
import { collectionFromDid, observationQuerySchema } from './validate'

describe('observationQuerySchema', () => {
  it('accepts a valid query and defaults the collection', () => {
    expect(observationQuerySchema.parse({ ra: '83.8221', dec: '-5.3911', radius: '0.05' })).toEqual({
      ra: 83.8221, dec: -5.3911, radius: 0.05, collection: 'spherex_qr3',
    })
  })

  it.each([
    [{ ra: '360', dec: '0', radius: '0.1' }],
    [{ ra: '-1', dec: '0', radius: '0.1' }],
    [{ ra: '10', dec: '100', radius: '0.1' }],
    [{ ra: '10', dec: '0', radius: '0' }],
    [{ ra: '10', dec: '0', radius: '1' }],
    [{ ra: 'abc', dec: '0', radius: '0.1' }],
    [{ ra: '10', dec: '0', radius: '0.1', collection: 'wise' }],
    [{ dec: '0', radius: '0.1' }],
  ])('rejects %o', (q) => {
    expect(observationQuerySchema.safeParse(q).success).toBe(false)
  })
})

describe('collectionFromDid', () => {
  it('extracts the collection from a SPHEREx DID', () => {
    expect(collectionFromDid('ivo://irsa.ipac/spherex_qr3?2026W36_2A_0209_2/D1')).toBe('spherex_qr3')
  })
  it('rejects other DIDs and injection attempts', () => {
    expect(collectionFromDid('ivo://irsa.ipac/wise?abc')).toBeNull()
    expect(collectionFromDid('ivo://irsa.ipac/spherex_qr3?x&POS=CIRCLE 0 0 90')).toBeNull()
    expect(collectionFromDid('https://evil.example')).toBeNull()
  })
})
