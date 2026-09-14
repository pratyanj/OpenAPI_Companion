import { describe, it, expect } from 'vitest'
import { isJwt, decodeJwtExpiryMs, decodeJwtClaims, extractUserDisplayFromJwt } from './jwt'

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

describe('decodeJwtClaims & extractUserDisplayFromJwt', () => {
  it('decodes arbitrary claims from JWT payload', () => {
    const token = makeJwt({ sub: 'user_123', role: 'admin', email: 'admin@test.com' })
    const claims = decodeJwtClaims(token)
    expect(claims).toEqual({ sub: 'user_123', role: 'admin', email: 'admin@test.com' })
  })

  it('extracts name and role from common claims', () => {
    const token = makeJwt({ name: 'Alice Admin', role: 'SuperAdmin' })
    const display = extractUserDisplayFromJwt(token)
    expect(display).toEqual({ name: 'Alice Admin', role: 'SuperAdmin' })
  })

  it('falls back to username, preferred_username, email, or sub', () => {
    expect(extractUserDisplayFromJwt(makeJwt({ preferred_username: 'alice_w' }))).toEqual({
      name: 'alice_w',
      role: undefined,
    })
    expect(extractUserDisplayFromJwt(makeJwt({ email: 'bob@example.com' }))).toEqual({
      name: 'bob@example.com',
      role: undefined,
    })
    expect(extractUserDisplayFromJwt(makeJwt({ sub: 'usr_99' }))).toEqual({
      name: 'usr_99',
      role: undefined,
    })
  })

  it('extracts role from array of roles', () => {
    const token = makeJwt({ sub: 'u1', roles: ['Manager', 'Staff'] })
    const display = extractUserDisplayFromJwt(token)
    expect(display?.role).toBe('Manager')
  })

  it('returns null for non-JWT strings or payloads without user info', () => {
    expect(decodeJwtClaims('raw-token')).toBeNull()
    expect(extractUserDisplayFromJwt('raw-token')).toBeNull()
    expect(extractUserDisplayFromJwt(makeJwt({ custom: 123 }))).toBeNull()
  })
})
