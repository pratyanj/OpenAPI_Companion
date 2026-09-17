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

describe('generateCode — PowerShell', () => {
  it('emits Invoke-RestMethod with method, uri, headers, and body', () => {
    const out = generateCode('powershell', post)
    expect(out).toContain('Invoke-RestMethod -Method POST')
    expect(out).toContain("-Uri 'https://api.example.com/users'")
    expect(out).toContain('-Headers @{')
    expect(out).toContain("'Authorization' = 'Bearer TKN'")
    expect(out).toContain('-Body \'{"name":"Ada"}\'')
  })

  it('escapes single quotes by doubling them, and omits body/headers when absent', () => {
    const out = generateCode('powershell', {
      method: 'get',
      url: "https://api.example.com/it's",
      headers: {},
    })
    expect(out).toContain("-Uri 'https://api.example.com/it''s'")
    expect(out).not.toContain('-Headers')
    expect(out).not.toContain('-Body')
  })
})

describe('generateCode — Python', () => {
  it('emits python requests code with headers and json literal', () => {
    const out = generateCode('python', post)
    expect(out).toContain('import requests')
    expect(out).toContain("url = 'https://api.example.com/users'")
    expect(out).toContain('headers = {')
    expect(out).toContain("'Content-Type': 'application/json'")
    expect(out).toContain("'Authorization': 'Bearer TKN'")
    expect(out).toContain('json_data = {')
    expect(out).toContain("'name': 'Ada'")
    expect(out).toContain('response = requests.post(url, headers=headers, json=json_data)')
    expect(out).toContain('print(response.status_code)')
    expect(out).toContain('print(response.json())')
  })

  it('omits headers and body when absent in GET request', () => {
    const out = generateCode('python', get)
    expect(out).toContain('import requests')
    expect(out).toContain("url = 'https://api.example.com/ping'")
    expect(out).not.toContain('headers =')
    expect(out).not.toContain('json_data =')
    expect(out).toContain('response = requests.get(url)')
  })

  it('handles non-JSON raw body using data=', () => {
    const out = generateCode('python', {
      method: 'POST',
      url: 'https://api.example.com/login',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=password&user=admin',
    })
    expect(out).toContain("data = 'grant_type=password&user=admin'")
    expect(out).toContain('response = requests.post(url, headers=headers, data=data)')
  })

  it('formats python literals correctly for booleans, numbers, and null', () => {
    const out = generateCode('python', {
      method: 'PUT',
      url: 'https://api.example.com/settings',
      headers: {},
      body: JSON.stringify({ active: true, disabled: false, count: 5, extra: null }),
    })
    expect(out).toContain("'active': True")
    expect(out).toContain("'disabled': False")
    expect(out).toContain("'count': 5")
    expect(out).toContain("'extra': None")
    expect(out).toContain('response = requests.put(url, json=json_data)')
  })
})

describe('generateCode — perf', () => {
  it('generates well under the 30 ms budget', () => {
    const start = performance.now()
    for (let i = 0; i < 500; i++) generateCode('curl', post)
    expect((performance.now() - start) / 500).toBeLessThan(30)
  })
})
