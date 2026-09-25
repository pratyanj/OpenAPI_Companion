import { describe, it, expect } from 'vitest'
import {
  docIdentityUrl,
  isHttpUrl,
  isLocalHost,
  normalizeLocalOrigin,
  extractPort,
} from './doc-url'

describe('docIdentityUrl', () => {
  it('drops the hash so navigation/refresh keep the same identity', () => {
    const base = 'https://localhost:8000/swagger/'
    expect(docIdentityUrl(base + '#/')).toBe(base)
    expect(docIdentityUrl(base + '#/operations-approvals-approvals_limits_list')).toBe(base)
    expect(docIdentityUrl(base + '#/')).toBe(docIdentityUrl(base + '#/operations/foo'))
  })

  it('keeps origin, pathname, and query (which can distinguish deployments)', () => {
    expect(docIdentityUrl('https://api.example.com/docs?spec=v2#/tag')).toBe(
      'https://api.example.com/docs?spec=v2',
    )
  })

  it('is stable for the same page regardless of hash', () => {
    expect(docIdentityUrl('http://h/p#a')).toBe(docIdentityUrl('http://h/p#b'))
  })
})

describe('isHttpUrl', () => {
  it('accepts absolute http(s) URLs', () => {
    expect(isHttpUrl('https://qa.example.com/swagger/')).toBe(true)
    expect(isHttpUrl('http://localhost:8000')).toBe(true)
  })
  it('rejects non-http and invalid values', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('/relative/path')).toBe(false)
    expect(isHttpUrl('not a url')).toBe(false)
  })
})

describe('isLocalHost', () => {
  it('detects localhost and .local', () => {
    expect(isLocalHost('http://localhost:8008')).toBe(true)
    expect(isLocalHost('https://my-app.local:3000')).toBe(true)
    expect(isLocalHost('localhost')).toBe(true)
  })

  it('detects IPv4 and IPv6 loopbacks', () => {
    expect(isLocalHost('http://127.0.0.1:8008')).toBe(true)
    expect(isLocalHost('http://127.0.0.2:5000')).toBe(true)
    expect(isLocalHost('http://0.0.0.0:8000')).toBe(true)
    expect(isLocalHost('http://[::1]:8080')).toBe(true)
  })

  it('detects private LAN IP ranges (10.x, 192.168.x, 172.16-31.x)', () => {
    expect(isLocalHost('http://192.168.1.50:8008')).toBe(true)
    expect(isLocalHost('http://10.0.0.5:8000')).toBe(true)
    expect(isLocalHost('http://172.20.10.4:8000')).toBe(true)
  })

  it('rejects public internet domains and public IPs', () => {
    expect(isLocalHost('https://api.github.com')).toBe(false)
    expect(isLocalHost('https://petstore.swagger.io')).toBe(false)
    expect(isLocalHost('http://8.8.8.8:8080')).toBe(false)
    expect(isLocalHost('invalid-not-a-host')).toBe(false)
  })
})

describe('normalizeLocalOrigin', () => {
  it('normalizes 127.0.0.1 to localhost preserving port', () => {
    expect(normalizeLocalOrigin('http://127.0.0.1:8008')).toBe('http://localhost:8008')
    expect(normalizeLocalOrigin('http://0.0.0.0:8009')).toBe('http://localhost:8009')
  })

  it('preserves localhost and other hosts unchanged', () => {
    expect(normalizeLocalOrigin('http://localhost:8008')).toBe('http://localhost:8008')
    expect(normalizeLocalOrigin('http://192.168.1.50:8008')).toBe('http://192.168.1.50:8008')
    expect(normalizeLocalOrigin('https://api.example.com')).toBe('https://api.example.com')
  })
})

describe('extractPort', () => {
  it('extracts explicit port from URL', () => {
    expect(extractPort('http://localhost:8008/docs')).toBe('8008')
    expect(extractPort('http://127.0.0.1:9000')).toBe('9000')
  })

  it('falls back to default port when omitted', () => {
    expect(extractPort('https://api.example.com/docs')).toBe('443')
    expect(extractPort('http://localhost')).toBe('80')
  })
})
