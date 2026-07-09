import { describe, it, expect } from 'vitest'
import { GENERATORS, GENERATOR_KEYS, generate, isGeneratorKey, type Rng } from './generators'

/** A cycling deterministic RNG so tests never flake. */
function seq(...values: number[]): Rng {
  let i = 0
  return () => values[i++ % values.length] as number
}

describe('fake-data generators', () => {
  it('ships all 21 v1 generators', () => {
    expect(GENERATOR_KEYS).toHaveLength(21)
  })

  it('every generator produces a non-empty value across many runs', () => {
    for (const key of GENERATOR_KEYS) {
      for (let i = 0; i < 50; i++) {
        const value = GENERATORS[key](Math.random)
        expect(value === '' || value == null).toBe(false)
      }
    }
  })

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  const DATE = /^\d{4}-\d{2}-\d{2}$/
  const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
  const PHONE = /^\+1-\d{3}-555-\d{4}$/

  it('formats email / uuid / date / datetime / phone / postal validly', () => {
    for (let i = 0; i < 100; i++) {
      expect(generate('email')).toMatch(EMAIL)
      expect(generate('uuid')).toMatch(UUID)
      expect(generate('date')).toMatch(DATE)
      expect(generate('datetime')).toMatch(DATETIME)
      expect(generate('phone')).toMatch(PHONE)
      expect(String(generate('postalCode'))).toMatch(/^\d{5}$/)
    }
  })

  it('typed generators return the right primitive types', () => {
    expect(typeof generate('boolean')).toBe('boolean')
    expect(typeof generate('integer')).toBe('number')
    expect(Number.isInteger(generate('integer'))).toBe(true)
    expect(typeof generate('float')).toBe('number')
    expect(typeof generate('url')).toBe('string')
    expect(generate('url', seq(0.1, 0.2, 0.3))).toMatch(/^https:\/\//)
  })

  it('password contains upper, lower, digit and symbol', () => {
    for (let i = 0; i < 50; i++) {
      const pw = String(generate('password'))
      expect(pw.length).toBeGreaterThanOrEqual(12)
      expect(pw).toMatch(/[A-Z]/)
      expect(pw).toMatch(/[a-z]/)
      expect(pw).toMatch(/[0-9]/)
      expect(pw).toMatch(/[!@#$%&*?]/)
    }
  })

  it('is deterministic under a fixed rng', () => {
    expect(generate('integer', seq(0.5))).toBe(generate('integer', seq(0.5)))
  })

  it('isGeneratorKey guards unknown keys', () => {
    expect(isGeneratorKey('email')).toBe(true)
    expect(isGeneratorKey('nope')).toBe(false)
  })

  it('generates a full field in well under the 20 ms budget', () => {
    const start = performance.now()
    for (let i = 0; i < 1000; i++) generate('fullName')
    expect((performance.now() - start) / 1000).toBeLessThan(20)
  })
})
