import { describe, it, expect } from 'vitest'
import { extractJsonCandidates, extractValueByPath } from './json-candidates'

describe('json-candidates', () => {
  describe('extractJsonCandidates', () => {
    it('returns empty array for empty or invalid input', () => {
      expect(extractJsonCandidates('')).toEqual([])
      expect(extractJsonCandidates('{ invalid')).toEqual([])
    })

    it('extracts primitives with suggested names and secret tags', () => {
      const json = JSON.stringify({
        accessToken: 'ey12345',
        userId: 42,
        user: { email: 'test@example.com' },
      })
      const candidates = extractJsonCandidates(json)
      expect(candidates.length).toBeGreaterThanOrEqual(3)

      const tokenCand = candidates.find((c) => c.suggestedName.includes('ACCESS_TOKEN') || c.suggestedName.includes('TOKEN'))
      expect(tokenCand).toBeDefined()
      expect(tokenCand?.value).toBe('ey12345')
      expect(tokenCand?.isLikelySecret).toBe(true)

      const idCand = candidates.find((c) => c.suggestedName.includes('USER_ID') || c.suggestedName.includes('ID'))
      expect(idCand).toBeDefined()
      expect(idCand?.value).toBe('42')
    })
  })

  describe('extractValueByPath', () => {
    const sample = JSON.stringify({
      token: 'jwt_abc_123',
      status: 200,
      active: true,
      data: {
        id: 'usr_999',
        nested: {
          apiKey: 'key_xyz',
        },
      },
      items: [{ id: 'item_1', name: 'First' }, { id: 'item_2', name: 'Second' }],
    })

    it('extracts top-level fields', () => {
      expect(extractValueByPath(sample, 'token')).toBe('jwt_abc_123')
      expect(extractValueByPath(sample, 'status')).toBe('200')
      expect(extractValueByPath(sample, 'active')).toBe('true')
    })

    it('extracts nested dot-path fields', () => {
      expect(extractValueByPath(sample, 'data.id')).toBe('usr_999')
      expect(extractValueByPath(sample, 'data.nested.apiKey')).toBe('key_xyz')
    })

    it('handles response. or body. prefixes', () => {
      expect(extractValueByPath(sample, 'response.token')).toBe('jwt_abc_123')
      expect(extractValueByPath(sample, 'body.data.id')).toBe('usr_999')
    })

    it('extracts array items using bracket notation', () => {
      expect(extractValueByPath(sample, 'items[0].id')).toBe('item_1')
      expect(extractValueByPath(sample, 'items[1].name')).toBe('Second')
    })

    it('returns null for missing fields or objects', () => {
      expect(extractValueByPath(sample, 'data.missing')).toBeNull()
      expect(extractValueByPath(sample, 'data')).toBeNull() // object, not primitive
      expect(extractValueByPath(sample, '')).toBeNull()
      expect(extractValueByPath(null, 'token')).toBeNull()
    })
  })
})
