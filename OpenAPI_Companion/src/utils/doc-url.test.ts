import { describe, it, expect } from 'vitest'
import { docIdentityUrl, isHttpUrl } from './doc-url'

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
