import { describe, it, expect } from 'vitest'
import { detectGenerator } from './detect'

describe('detectGenerator — by name', () => {
  const cases: Array<[string, string]> = [
    ['email', 'email'],
    ['userEmail', 'email'],
    ['user_name', 'username'],
    ['username', 'username'],
    ['password', 'password'],
    ['pwd', 'password'],
    ['firstName', 'firstName'],
    ['first_name', 'firstName'],
    ['lastName', 'lastName'],
    ['surname', 'lastName'],
    ['name', 'fullName'],
    ['fullName', 'fullName'],
    ['companyName', 'company'],
    ['phone', 'phone'],
    ['mobileNumber', 'phone'],
    ['streetAddress', 'address'],
    ['city', 'city'],
    ['state', 'state'],
    ['country', 'country'],
    ['zipCode', 'postalCode'],
    ['postalCode', 'postalCode'],
    ['birthDate', 'date'],
    ['createdAt', 'datetime'],
    ['updated_at', 'datetime'],
    ['timestamp', 'datetime'],
    ['website', 'url'],
    ['homepageUrl', 'url'],
    ['grand_total', 'decimal'],
    ['unitPrice', 'decimal'],
    ['amount', 'decimal'],
    ['accountBalance', 'decimal'],
    ['isActive', 'boolean'],
    ['hasAccess', 'boolean'],
  ]

  it.each(cases)('detects %s → %s', (field, expected) => {
    expect(detectGenerator(field)).toBe(expected)
  })

  it('detects id-like fields as uuid without false positives', () => {
    expect(detectGenerator('id')).toBe('uuid')
    expect(detectGenerator('userId')).toBe('uuid')
    expect(detectGenerator('user_id')).toBe('uuid')
    expect(detectGenerator('uuid')).toBe('uuid')
    // Words that merely end in "id" must NOT be treated as ids.
    expect(detectGenerator('valid')).not.toBe('uuid')
    expect(detectGenerator('paid')).not.toBe('uuid')
  })

  it('prefers datetime over date for "datetime"-like names', () => {
    expect(detectGenerator('dateTime')).toBe('datetime')
  })
})

describe('detectGenerator — value-type fallback', () => {
  it('falls back to boolean / integer / float by value', () => {
    expect(detectGenerator('flag', true)).toBe('boolean')
    expect(detectGenerator('count', 5)).toBe('integer')
    expect(detectGenerator('ratio', 1.5)).toBe('float')
  })

  it('returns null for unrecognized string fields (left unchanged)', () => {
    expect(detectGenerator('foobar', 'hello')).toBeNull()
    expect(detectGenerator('xyz')).toBeNull()
  })
})
