import { describe, it, expect } from 'vitest'
import {
  deriveAccountNameFromUsername,
  parseAccountJson,
  recordToExtraFields,
  extraFieldsToRecord,
} from './auth-json-utils'

describe('deriveAccountNameFromUsername', () => {
  it('extracts prefix before @ for standard emails', () => {
    expect(deriveAccountNameFromUsername('admin@example.com')).toBe('admin')
    expect(deriveAccountNameFromUsername('john.doe@company.org')).toBe('john.doe')
    expect(deriveAccountNameFromUsername('test.user+tag@domain.co.uk')).toBe('test.user+tag')
  })

  it('handles usernames without @ by returning the trimmed string', () => {
    expect(deriveAccountNameFromUsername('superadmin')).toBe('superadmin')
    expect(deriveAccountNameFromUsername('  tester_01  ')).toBe('tester_01')
  })

  it('handles edge cases gracefully', () => {
    expect(deriveAccountNameFromUsername('')).toBe('')
    expect(deriveAccountNameFromUsername('   ')).toBe('')
    expect(deriveAccountNameFromUsername('@example.com')).toBe('@example.com')
  })
})

describe('parseAccountJson', () => {
  it('parses valid credentials and auto-derives name from email prefix', () => {
    const json = JSON.stringify({
      email: 'admin@service.io',
      password: 'secret_password_123',
      tenant_id: 42,
      force_logout: true,
      client_type: 'web',
    })

    const result = parseAccountJson(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.name).toBe('admin')
    expect(result.value.username).toBe('admin@service.io')
    expect(result.value.password).toBe('secret_password_123')
    expect(result.value.extraFields).toEqual({
      tenant_id: 42,
      force_logout: true,
      client_type: 'web',
    })
    expect(result.value.detectedKeys.extraCount).toBe(3)
  })

  it('respects explicitly provided account name/persona in JSON', () => {
    const json = JSON.stringify({
      name: 'Super Admin',
      username: 'root@internal.net',
      pass: 'rootPass!',
    })

    const result = parseAccountJson(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.name).toBe('Super Admin')
    expect(result.value.username).toBe('root@internal.net')
    expect(result.value.password).toBe('rootPass!')
    expect(Object.keys(result.value.extraFields)).toHaveLength(0)
  })

  it('recognizes varied key casing and aliases (e.g. user, pwd, persona)', () => {
    const json = JSON.stringify({
      user: 'dev_user',
      pwd: 'dev_pwd_99',
      persona: 'Developer Role',
      scope: 'read:write',
    })

    const result = parseAccountJson(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.name).toBe('Developer Role')
    expect(result.value.username).toBe('dev_user')
    expect(result.value.password).toBe('dev_pwd_99')
    expect(result.value.extraFields).toEqual({ scope: 'read:write' })
  })

  it('returns clean error for invalid JSON syntax', () => {
    const result = parseAccountJson('{ invalid: json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Invalid JSON syntax')
    }
  })

  it('returns clean error for empty or non-object payloads', () => {
    expect(parseAccountJson('').ok).toBe(false)
    expect(parseAccountJson('   ').ok).toBe(false)
    expect(parseAccountJson('[]').ok).toBe(false)
    expect(parseAccountJson('"just a string"').ok).toBe(false)
    expect(parseAccountJson('12345').ok).toBe(false)
    expect(parseAccountJson('{}').ok).toBe(false)
  })
})

describe('recordToExtraFields and extraFieldsToRecord', () => {
  it('converts record to field entries and back preserving types', () => {
    const original = {
      tenant_id: 101,
      force_logout: true,
      subdomain: 'alpha',
    }

    const entries = recordToExtraFields(original)
    expect(entries).toHaveLength(3)

    const reconstructed = extraFieldsToRecord(entries)
    expect(reconstructed).toEqual(original)
  })

  it('handles empty or undefined gracefully', () => {
    expect(recordToExtraFields(undefined)).toEqual([])
    expect(extraFieldsToRecord([])).toBeUndefined()
  })
})
