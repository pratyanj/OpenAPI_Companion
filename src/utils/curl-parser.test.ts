import { describe, it, expect } from 'vitest'
import {
  parseCurl,
  normalizeCurlString,
  extractAuthFromHeaders,
  extractCustomHeaders,
} from './curl-parser'

describe('curl-parser', () => {
  it('normalizes multi-line and backtick continuations', () => {
    const raw = `curl -X POST \\\n  'https://api.example.com/tasks/' \\\n  -H 'accept: application/json'`
    const normalized = normalizeCurlString(raw)
    expect(normalized).toBe(
      "curl -X POST 'https://api.example.com/tasks/' -H 'accept: application/json'",
    )

    const psRaw = `curl -X POST \`\r\n  'https://api.example.com/tasks/' \`\r\n  -H 'accept: application/json'`
    const psNormalized = normalizeCurlString(psRaw)
    expect(psNormalized).toBe(
      "curl -X POST 'https://api.example.com/tasks/' -H 'accept: application/json'",
    )
  })

  it('parses basic GET request with query parameters', () => {
    const curl = `curl "http://127.0.0.1:8008/tasks/?completed=true&limit=10" -H "accept: application/json"`
    const parsed = parseCurl(curl)

    expect(parsed.method).toBe('GET')
    expect(parsed.url).toBe('http://127.0.0.1:8008/tasks/?completed=true&limit=10')
    expect(parsed.path).toBe('/tasks/')
    expect(parsed.queryParams).toEqual({
      completed: 'true',
      limit: '10',
    })
    expect(parsed.headers).toEqual({
      accept: 'application/json',
    })
    expect(parsed.body).toBeUndefined()
    expect(parsed.isJsonBody).toBe(false)
  })

  it('parses POST request with JSON body and auto-formats it', () => {
    const curl = `curl -X POST "http://127.0.0.1:8008/tasks/" -H "Content-Type: application/json" -d '{"title":"Buy groceries","priority":"high"}'`
    const parsed = parseCurl(curl)

    expect(parsed.method).toBe('POST')
    expect(parsed.path).toBe('/tasks/')
    expect(parsed.headers['Content-Type']).toBe('application/json')
    expect(parsed.isJsonBody).toBe(true)
    expect(parsed.formattedBody).toBe(
      JSON.stringify(
        {
          title: 'Buy groceries',
          priority: 'high',
        },
        null,
        2,
      ),
    )
  })

  it('infers POST method when -d is present without explicit -X', () => {
    const curl = `curl 'http://127.0.0.1:8008/tasks/' --data-raw '{"test":123}'`
    const parsed = parseCurl(curl)

    expect(parsed.method).toBe('POST')
    expect(parsed.isJsonBody).toBe(true)
  })

  it('parses PUT, DELETE, and PATCH methods accurately', () => {
    const put = parseCurl(`curl -X PUT "http://127.0.0.1:8008/tasks/42" -d '{"done":true}'`)
    expect(put.method).toBe('PUT')
    expect(put.path).toBe('/tasks/42')

    const del = parseCurl(`curl -X DELETE "http://127.0.0.1:8008/tasks/42"`)
    expect(del.method).toBe('DELETE')
    expect(del.path).toBe('/tasks/42')

    const patch = parseCurl(`curl --request PATCH "http://127.0.0.1:8008/tasks/42"`)
    expect(patch.method).toBe('PATCH')
  })

  it('handles relative paths and multiple headers', () => {
    const curl = `curl -X POST /api/items -H "Authorization: Bearer token123" -H "X-Trace-Id: trace-999"`
    const parsed = parseCurl(curl)

    expect(parsed.path).toBe('/api/items')
    expect(parsed.headers['Authorization']).toBe('Bearer token123')
    expect(parsed.headers['X-Trace-Id']).toBe('trace-999')
  })

  it('gracefully handles empty or invalid strings', () => {
    const parsed = parseCurl('')
    expect(parsed.method).toBe('GET')
    expect(parsed.path).toBe('')
    expect(parsed.queryParams).toEqual({})
  })

  it('parses basic auth via -u or --user flag', () => {
    const parsed = parseCurl('curl -u "admin:secret123" https://api.example.com/data')
    expect(parsed.headers['Authorization']).toBe(`Basic ${btoa('admin:secret123')}`)

    const parsedLong = parseCurl('curl --user alice:pass99 https://api.example.com/data')
    expect(parsedLong.headers['Authorization']).toBe(`Basic ${btoa('alice:pass99')}`)
  })
})

describe('extractAuthFromHeaders & extractCustomHeaders', () => {
  it('extracts Bearer authorization token case-insensitively', () => {
    const auth1 = parseCurl('curl https://api.example.com -H "Authorization: Bearer eyJhbGciOi..."')
    const res1 = extractAuthFromHeaders(auth1.headers)
    expect(res1).toEqual({
      type: 'bearer',
      token: 'Bearer eyJhbGciOi...',
      rawHeaderKey: 'Authorization',
      schemeName: 'bearerAuth',
    })

    const auth2 = parseCurl('curl https://api.example.com -H "authorization: Bearer my-token"')
    const res2 = extractAuthFromHeaders(auth2.headers)
    expect(res2?.token).toBe('Bearer my-token')
    expect(res2?.type).toBe('bearer')
  })

  it('extracts Basic authorization and raw tokens', () => {
    const auth1 = parseCurl(
      'curl https://api.example.com -H "Authorization: Basic YWRtaW46c2VjcmV0"',
    )
    const res1 = extractAuthFromHeaders(auth1.headers)
    expect(res1).toEqual({
      type: 'basic',
      token: 'YWRtaW46c2VjcmV0',
      rawHeaderKey: 'Authorization',
      schemeName: 'basicAuth',
    })

    const auth2 = parseCurl('curl https://api.example.com -H "Authorization: raw-jwt-token-string"')
    const res2 = extractAuthFromHeaders(auth2.headers)
    expect(res2).toEqual({
      type: 'bearer',
      token: 'raw-jwt-token-string',
      rawHeaderKey: 'Authorization',
      schemeName: 'bearerAuth',
    })
  })

  it('extracts API key variants from headers', () => {
    const parsed = parseCurl('curl https://api.example.com -H "X-API-Key: secret-key-123"')
    const res = extractAuthFromHeaders(parsed.headers)
    expect(res).toEqual({
      type: 'apiKey',
      token: 'secret-key-123',
      rawHeaderKey: 'X-API-Key',
      schemeName: 'X-API-Key',
    })
  })

  it('extracts custom non-auth headers excluding hop-by-hop and body headers', () => {
    const parsed = parseCurl(`
      curl https://api.example.com/items \\
        -H "Authorization: Bearer tok123" \\
        -H "Content-Type: application/json" \\
        -H "X-Tenant-ID: tenant-42" \\
        -H "X-Client-Version: 3.2.1"
    `)
    const custom = extractCustomHeaders(parsed.headers)
    expect(custom).toEqual({
      'X-Tenant-ID': 'tenant-42',
      'X-Client-Version': '3.2.1',
    })
  })
})
