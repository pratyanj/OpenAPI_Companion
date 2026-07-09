import { describe, it, expect } from 'vitest'
import { isJwt, decodeJwtExpiryMs } from './jwt'

function makeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig`
}

describe('isJwt', () => {
  it('recognises the three-segment shape', () => {
    expect(isJwt('a.b.c')).toBe(true)
    expect(isJwt('not-a-jwt')).toBe(false)
    expect(isJwt('a.b')).toBe(false)
  })
})

describe('decodeJwtExpiryMs', () => {
  it('reads the exp claim as epoch milliseconds', () => {
    const token = makeJwt({ sub: 'u1', exp: 1_700_000_000 })
    expect(decodeJwtExpiryMs(token)).toBe(1_700_000_000_000)
  })

  it('returns null when there is no exp claim', () => {
    expect(decodeJwtExpiryMs(makeJwt({ sub: 'u1' }))).toBeNull()
  })

  it('returns null for non-JWT strings', () => {
    expect(decodeJwtExpiryMs('opaque-token')).toBeNull()
  })

  it('returns null for malformed payloads', () => {
    expect(decodeJwtExpiryMs('a.!!!notbase64json!!!.c')).toBeNull()
  })
})
