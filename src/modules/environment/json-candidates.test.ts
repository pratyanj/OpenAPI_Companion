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

      const tokenCand = candidates.find(
        (c) => c.suggestedName.includes('ACCESS_TOKEN') || c.suggestedName.includes('TOKEN'),
      )
      expect(tokenCand).toBeDefined()
      expect(tokenCand?.value).toBe('ey12345')
      expect(tokenCand?.isLikelySecret).toBe(true)

      const idCand = candidates.find(
        (c) => c.suggestedName.includes('USER_ID') || c.suggestedName.includes('ID'),
      )
      expect(idCand).toBeDefined()
      expect(idCand?.value).toBe('42')
    })

    it('generates distinct suggested variable names for array items', () => {
      const json = JSON.stringify([
        { id: 101, name: 'Engineering', description: 'Core' },
        { id: 102, name: 'Cloud & Infrastructure', description: 'DevOps' },
      ])
      const candidates = extractJsonCandidates(json)
      const id0 = candidates.find((c) => c.path === '[0].id')
      const id1 = candidates.find((c) => c.path === '[1].id')
      const name0 = candidates.find((c) => c.path === '[0].name')
      const name1 = candidates.find((c) => c.path === '[1].name')

      expect(id0?.suggestedName).toBe('ID')
      expect(id1?.suggestedName).toBe('ID_1')
      expect(name0?.suggestedName).toBe('NAME')
      expect(name1?.suggestedName).toBe('NAME_1')
    })

    it('generates distinct suggested variable names for nested array items', () => {
      const json = JSON.stringify({
        items: [
          { id: 'a', name: 'First' },
          { id: 'b', name: 'Second' },
        ],
      })
      const candidates = extractJsonCandidates(json)
      const id0 = candidates.find((c) => c.path === 'items[0].id')
      const id1 = candidates.find((c) => c.path === 'items[1].id')

      expect(id0?.suggestedName).toBe('ITEMS_ID')
      expect(id1?.suggestedName).toBe('ITEMS_1_ID')
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
      items: [
        { id: 'item_1', name: 'First' },
        { id: 'item_2', name: 'Second' },
      ],
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
