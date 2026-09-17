import { describe, it, expect } from 'vitest'
import {
  BRIDGE_TAG,
  resolveWithVariables,
  buildAuthorizePayload,
  chooseScheme,
  extractAuth,
  isInbound,
  isOutbound,
  planAuthWrite,
  securityDefinitionsFrom,
  type AuthorizedEntry,
  type SchemeDefinition,
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

describe('planAuthWrite', () => {
  // The regression: an apiKey scheme whose value is a JWT was applied via
  // authorize() with a reconstructed http/bearer schema, which Swagger ignores —
  // leaving the Authorize box empty. It must go through preauthorizeApiKey.
  it('routes an apiKey scheme through preauthorizeApiKey, keeping the full value', () => {
    const defs: Record<string, SchemeDefinition> = {
      Authorization: { type: 'apiKey', in: 'header', name: 'Authorization' },
    }
    const plan = planAuthWrite(
      { type: 'jwt', token: 'Bearer eyJ.a.b', schemeName: 'Authorization' },
      defs,
    )
    expect(plan).toEqual({ via: 'apiKey', name: 'Authorization', value: 'Bearer eyJ.a.b' })
  })

  it('finds the real apiKey scheme even when the stored name/type is wrong', () => {
    // A refreshed/added token arrives as jwt with no matching scheme name; the
    // spec's only scheme is apiKey, so that's what must be authorized.
    const defs: Record<string, SchemeDefinition> = {
      Bearer: { type: 'apiKey', in: 'header', name: 'Authorization' },
    }
    const plan = planAuthWrite({ type: 'jwt', token: 'Bearer eyJ.a.b' }, defs)
    expect(plan).toEqual({ via: 'apiKey', name: 'Bearer', value: 'Bearer eyJ.a.b' })
  })

  it('sends a raw token to a genuine http-bearer scheme (Swagger adds Bearer)', () => {
    const defs: Record<string, SchemeDefinition> = {
      bearerAuth: { type: 'http', scheme: 'bearer' },
    }
    const plan = planAuthWrite(
      { type: 'bearer', token: 'Bearer eyJ.a.b', schemeName: 'bearerAuth' },
      defs,
    )
    expect(plan).toEqual({
      via: 'authorize',
      payload: {
        bearerAuth: {
          name: 'bearerAuth',
          value: 'eyJ.a.b', // prefix stripped
          schema: { type: 'http', scheme: 'bearer' },
        },
      },
    })
  })

  it('falls back to a reconstructed payload when the spec has no definitions yet', () => {
    const plan = planAuthWrite({ type: 'apiKey', token: 'k', schemeName: 'ApiKeyAuth' }, {})
    // No defs → assume our type; apiKey still routes to preauthorizeApiKey.
    expect(plan).toEqual({ via: 'apiKey', name: 'ApiKeyAuth', value: 'k' })
  })
})

describe('chooseScheme', () => {
  it('prefers the credential’s own scheme when the spec defines it', () => {
    const defs: Record<string, SchemeDefinition> = {
      A: { type: 'apiKey' },
      B: { type: 'http', scheme: 'bearer' },
    }
    expect(chooseScheme({ type: 'jwt', token: 't', schemeName: 'B' }, defs)).toBe('B')
  })
})

describe('securityDefinitionsFrom', () => {
  // The bug: schemes were read from state.auth.definitions (empty in real builds)
  // instead of the spec, so every scheme looked absent and apiKey writes failed.
  it('reads OAS2 securityDefinitions from the spec', () => {
    const state = {
      spec: {
        json: {
          securityDefinitions: { Bearer: { type: 'apiKey', in: 'header', name: 'Authorization' } },
        },
      },
    }
    expect(securityDefinitionsFrom(state)).toEqual({
      Bearer: { type: 'apiKey', scheme: undefined, name: 'Authorization', in: 'header' },
    })
  })

  it('reads OAS3 components.securitySchemes', () => {
    const state = {
      spec: {
        json: {
          components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
        },
      },
    }
    expect(securityDefinitionsFrom(state).bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    })
  })

  it('prefers the resolved spec over the raw json', () => {
    const state = {
      spec: {
        resolvedSpec: { securityDefinitions: { A: { type: 'apiKey', name: 'X', in: 'header' } } },
        json: { securityDefinitions: { B: { type: 'apiKey', name: 'Y', in: 'header' } } },
      },
    }
    expect(Object.keys(securityDefinitionsFrom(state))).toEqual(['A'])
  })

  it('falls back to auth.definitions, and returns {} when nothing is present', () => {
    expect(securityDefinitionsFrom({ auth: { definitions: { K: { type: 'apiKey' } } } })).toEqual({
      K: { type: 'apiKey', scheme: undefined, name: undefined, in: undefined },
    })
    expect(securityDefinitionsFrom(undefined)).toEqual({})
    expect(securityDefinitionsFrom({ spec: { json: {} } })).toEqual({})
  })

  // End-to-end of the fix: real spec schemes -> the apiKey route with the full value.
  it('routes an OAS2 apiKey scheme correctly once read from the spec', () => {
    const state = {
      spec: {
        json: {
          securityDefinitions: { Bearer: { type: 'apiKey', in: 'header', name: 'Authorization' } },
        },
      },
    }
    const defs = securityDefinitionsFrom(state)
    const plan = planAuthWrite({ type: 'jwt', token: 'Bearer eyJ.a.b', schemeName: 'Bearer' }, defs)
    expect(plan).toEqual({ via: 'apiKey', name: 'Bearer', value: 'Bearer eyJ.a.b' })
  })
})

describe('resolveWithVariables', () => {
  it('resolves {{VAR}} and case-insensitive placeholders in strings', () => {
    const text = 'https://api.example.com/users/{{user_id}}?role={{ROLE}}'
    const vars = { USER_ID: '123', role: 'admin' }
    expect(resolveWithVariables(text, vars)).toBe('https://api.example.com/users/123?role=admin')
  })

  it('resolves URL-encoded %7B%7BVAR%7D%7D in URLs', () => {
    const text = 'https://api.example.com/tasks/%7B%7Btask_id%7D%7D'
    const vars = { task_id: '99' }
    expect(resolveWithVariables(text, vars)).toBe('https://api.example.com/tasks/99')
  })

  it('resolves dynamic variables like {{$uuid}} and {{$timestamp}}', () => {
    const text = 'id={{$uuid}}&time={{$timestamp}}'
    const out = resolveWithVariables(text, {})
    expect(out).toMatch(/^id=[0-9a-f-]{36}&time=\d+$/i)
  })
})
