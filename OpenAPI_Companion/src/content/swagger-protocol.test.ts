import { describe, it, expect } from 'vitest'
import {
  BRIDGE_TAG,
  buildAuthorizePayload,
  extractAuth,
  isInbound,
  isOutbound,
  type AuthorizedEntry,
} from './swagger-protocol'

describe('extractAuth', () => {
  it('reads a bearer credential', () => {
    const authorized: Record<string, AuthorizedEntry> = {
      bearerAuth: { value: 'tok123', schema: { type: 'http', scheme: 'bearer' } },
    }
    expect(extractAuth(authorized)).toEqual({
      type: 'bearer',
      token: 'tok123',
      schemeName: 'bearerAuth',
    })
  })

  it('reads an API key credential', () => {
    const authorized: Record<string, AuthorizedEntry> = {
      ApiKeyAuth: { value: 'key123', schema: { type: 'apiKey' } },
    }
    expect(extractAuth(authorized)).toEqual({
      type: 'apiKey',
      token: 'key123',
      schemeName: 'ApiKeyAuth',
    })
  })

  it('reads a basic credential (base64 user:pass)', () => {
    const authorized: Record<string, AuthorizedEntry> = {
      basicAuth: {
        value: { username: 'u', password: 'p' },
        schema: { type: 'http', scheme: 'basic' },
      },
    }
    const snap = extractAuth(authorized)
    expect(snap?.type).toBe('basic')
    expect(atob(snap!.token)).toBe('u:p')
  })

  it('returns null for empty or unknown schemes', () => {
    expect(extractAuth(undefined)).toBeNull()
    expect(extractAuth({})).toBeNull()
    expect(extractAuth({ oauth: { value: 'x', schema: { type: 'oauth2' } } })).toBeNull()
  })
})

describe('buildAuthorizePayload', () => {
  it('builds a bearer authorize payload', () => {
    expect(
      buildAuthorizePayload({ type: 'bearer', token: 'tok', schemeName: 'bearerAuth' }),
    ).toEqual({
      bearerAuth: { name: 'bearerAuth', value: 'tok', schema: { type: 'http', scheme: 'bearer' } },
    })
  })

  it('builds an apiKey authorize payload', () => {
    expect(buildAuthorizePayload({ type: 'apiKey', token: 'k', schemeName: 'ApiKeyAuth' })).toEqual(
      {
        ApiKeyAuth: { name: 'ApiKeyAuth', value: 'k', schema: { type: 'apiKey' } },
      },
    )
  })

  it('decodes basic credentials into username/password', () => {
    const payload = buildAuthorizePayload({
      type: 'basic',
      token: btoa('u:p'),
      schemeName: 'basicAuth',
    })
    expect(payload).toEqual({
      basicAuth: {
        name: 'basicAuth',
        value: { username: 'u', password: 'p' },
        schema: { type: 'http', scheme: 'basic' },
      },
    })
  })
})

describe('message guards', () => {
  it('recognises inbound / outbound envelopes', () => {
    expect(isInbound({ tag: BRIDGE_TAG, dir: 'from-main', type: 'auth', snapshot: null })).toBe(
      true,
    )
    expect(isOutbound({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'readAuth' })).toBe(true)
    expect(isInbound({ tag: BRIDGE_TAG, dir: 'to-main', cmd: 'readAuth' })).toBe(false)
    expect(isInbound({ foo: 'bar' })).toBe(false)
    expect(isOutbound(undefined)).toBe(false)
  })
})
