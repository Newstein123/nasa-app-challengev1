import { describe, expect, it } from 'vitest'
import { parseSesame } from './resolve'

describe('parseSesame', () => {
  it('reads the J2000 position in degrees', () => {
    const xml = `<Sesame><Target><Resolver name="S=Simbad"><jpos>05:35:17.30 -05:23:28.0</jpos>
      <jradeg>83.82208</jradeg><jdedeg>-05.39111</jdedeg></Resolver></Target></Sesame>`
    expect(parseSesame(xml)).toEqual({ ra: 83.82208, dec: -5.39111 })
  })
  it('returns null when nothing resolved', () => {
    expect(parseSesame('<Sesame><Target><INFO>*** Nothing found ***</INFO></Target></Sesame>')).toBeNull()
  })
})
