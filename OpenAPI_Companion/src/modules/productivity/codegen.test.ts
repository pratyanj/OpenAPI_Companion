import { describe, it, expect } from 'vitest'
import { generateCode } from './codegen'
import type { CodeGenRequest } from './types'

const post: CodeGenRequest = {
  method: 'POST',
  url: 'https://api.example.com/users',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer TKN' },
  body: '{"name":"Ada"}',
}

const get: CodeGenRequest = {
  method: 'GET',
  url: 'https://api.example.com/ping',
  headers: {},
}

describe('generateCode — cURL', () => {
  it('includes method, url, headers, and body', () => {
    const out = generateCode('curl', post)
    expect(out).toContain("curl -X POST 'https://api.example.com/users'")
    expect(out).toContain("-H 'Content-Type: application/json'")
    expect(out).toContain("-H 'Authorization: Bearer TKN'")
    expect(out).toContain(`-d '{"name":"Ada"}'`)
  })

  it('omits -d for a body-less request', () => {
    const out = generateCode('curl', get)
    expect(out).toContain("curl -X GET 'https://api.example.com/ping'")
    expect(out).not.toContain('-d ')
  })
})

describe('generateCode — Fetch', () => {
  it('emits a fetch call with headers and a JSON.stringify body', () => {
    const out = generateCode('fetch', post)
    expect(out).toContain("await fetch('https://api.example.com/users', {")
    expect(out).toContain("method: 'POST'")
    expect(out).toContain('"Content-Type": "application/json"')
    expect(out).toContain('body: JSON.stringify(')
    expect(out).toContain('"name": "Ada"')
  })

  it('omits body/headers when absent', () => {
    const out = generateCode('fetch', get)
    expect(out).toContain("method: 'GET'")
    expect(out).not.toContain('body:')
    expect(out).not.toContain('headers:')
  })
})

describe('generateCode — Axios', () => {
  it('emits an axios config with lowercase method and data', () => {
    const out = generateCode('axios', post)
    expect(out).toContain('await axios({')
    expect(out).toContain("method: 'post'")
    expect(out).toContain("url: 'https://api.example.com/users'")
    expect(out).toContain('data: {')
    expect(out).toContain('"name": "Ada"')
  })
})

describe('generateCode — perf', () => {
  it('generates well under the 30 ms budget', () => {
    const start = performance.now()
    for (let i = 0; i < 500; i++) generateCode('curl', post)
    expect((performance.now() - start) / 500).toBeLessThan(30)
  })
})
