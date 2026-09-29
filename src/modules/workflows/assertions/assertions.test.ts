import { describe, it, expect } from 'vitest'
import {
  parseJsonPath,
  extractJsonPath,
  evaluateAssertion,
  evaluateAssertions,
  type Assertion,
  type AssertionTargetResponse,
} from './index'

describe('JSONPath Extractor', () => {
  it('tokenizes simple and nested dot paths', () => {
    expect(parseJsonPath('$.data.id')).toEqual(['data', 'id'])
    expect(parseJsonPath('user.profile.name')).toEqual(['user', 'profile', 'name'])
    expect(parseJsonPath('$')).toEqual([])
    expect(parseJsonPath('')).toEqual([])
  })

  it('tokenizes array index and bracket notation', () => {
    expect(parseJsonPath('$.items[0].id')).toEqual(['items', 0, 'id'])
    expect(parseJsonPath('matrix[1][2]')).toEqual(['matrix', 1, 2])
    expect(parseJsonPath('data["prop-name"]')).toEqual(['data', 'prop-name'])
  })

  it('extracts values from nested JSON structures', () => {
    const payload = {
      user: {
        id: 42,
        name: 'Alice',
        roles: ['admin', 'editor'],
        profile: {
          bio: 'Engineer',
        },
      },
      items: [
        { id: 1, title: 'Item 1' },
        { id: 2, title: 'Item 2' },
      ],
    }

    expect(extractJsonPath(payload, '$.user.id')).toBe(42)
    expect(extractJsonPath(payload, 'user.name')).toBe('Alice')
    expect(extractJsonPath(payload, '$.user.roles[0]')).toBe('admin')
    expect(extractJsonPath(payload, '$.items[1].title')).toBe('Item 2')
    expect(extractJsonPath(payload, '$.user.profile.bio')).toBe('Engineer')
  })

  it('resolves array and string lengths', () => {
    const payload = {
      tags: ['alpha', 'beta', 'gamma'],
      title: 'OpenAPI',
    }

    expect(extractJsonPath(payload, '$.tags.length')).toBe(3)
    expect(extractJsonPath(payload, '$.title.length')).toBe(7)
  })

  it('returns undefined gracefully on non-existent properties', () => {
    const payload = { a: { b: 1 } }
    expect(extractJsonPath(payload, '$.a.c.d')).toBeUndefined()
    expect(extractJsonPath(payload, '$.unknown')).toBeUndefined()
    expect(extractJsonPath(null, '$.a')).toBeUndefined()
    expect(extractJsonPath(undefined, '$.a')).toBeUndefined()
  })
})

describe('Assertion Evaluator', () => {
  const sampleResponse: AssertionTargetResponse = {
    status: 201,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-ID': 'req-98765',
    },
    body: JSON.stringify({
      success: true,
      data: {
        id: 92831,
        email: 'developer@example.com',
        roles: ['developer', 'tester'],
        age: 30,
        settings: {
          notifications: true,
        },
      },
      items: [10, 20, 30],
    }),
    durationMs: 145,
  }

  describe('Status assertions', () => {
    it('evaluates status equality and range operators', () => {
      const equals201: Assertion = {
        id: '1',
        type: 'status',
        operator: 'equals',
        expected: 201,
      }
      expect(evaluateAssertion(equals201, sampleResponse).passed).toBe(true)

      const is2xx: Assertion = {
        id: '2',
        type: 'status',
        operator: 'is2xx',
      }
      expect(evaluateAssertion(is2xx, sampleResponse).passed).toBe(true)

      const isNot5xx: Assertion = {
        id: '3',
        type: 'status',
        operator: 'isNot5xx',
      }
      expect(evaluateAssertion(isNot5xx, sampleResponse).passed).toBe(true)

      const equals200: Assertion = {
        id: '4',
        type: 'status',
        operator: 'equals',
        expected: 200,
      }
      const failRes = evaluateAssertion(equals200, sampleResponse)
      expect(failRes.passed).toBe(false)
      expect(failRes.message).toContain('Expected 200, but got 201')
    })
  })

  describe('Header assertions', () => {
    it('evaluates headers with case-insensitive matching', () => {
      const ctContains: Assertion = {
        id: '1',
        type: 'header',
        target: 'content-type',
        operator: 'contains',
        expected: 'application/json',
      }
      expect(evaluateAssertion(ctContains, sampleResponse).passed).toBe(true)

      const reqIdExists: Assertion = {
        id: '2',
        type: 'header',
        target: 'x-request-id',
        operator: 'exists',
      }
      expect(evaluateAssertion(reqIdExists, sampleResponse).passed).toBe(true)

      const missingHeader: Assertion = {
        id: '3',
        type: 'header',
        target: 'x-missing-token',
        operator: 'exists',
      }
      expect(evaluateAssertion(missingHeader, sampleResponse).passed).toBe(false)
    })
  })

  describe('JSONPath assertions', () => {
    it('evaluates nested fields and values', () => {
      const idEquals: Assertion = {
        id: '1',
        type: 'jsonPath',
        target: '$.data.id',
        operator: 'equals',
        expected: 92831,
      }
      expect(evaluateAssertion(idEquals, sampleResponse).passed).toBe(true)

      const emailContains: Assertion = {
        id: '2',
        type: 'jsonPath',
        target: '$.data.email',
        operator: 'contains',
        expected: '@example.com',
      }
      expect(evaluateAssertion(emailContains, sampleResponse).passed).toBe(true)

      const rolesContains: Assertion = {
        id: '3',
        type: 'jsonPath',
        target: '$.data.roles',
        operator: 'contains',
        expected: 'developer',
      }
      expect(evaluateAssertion(rolesContains, sampleResponse).passed).toBe(true)

      const ageGreaterThan: Assertion = {
        id: '4',
        type: 'jsonPath',
        target: '$.data.age',
        operator: 'greaterThan',
        expected: 18,
      }
      expect(evaluateAssertion(ageGreaterThan, sampleResponse).passed).toBe(true)
    })

    it('evaluates regex patterns on strings', () => {
      const emailRegex: Assertion = {
        id: '1',
        type: 'jsonPath',
        target: '$.data.email',
        operator: 'matchesRegex',
        expected: '^[a-z]+@example\\.com$',
      }
      expect(evaluateAssertion(emailRegex, sampleResponse).passed).toBe(true)
    })

    it('gracefully reports invalid JSON in response body', () => {
      const badResponse: AssertionTargetResponse = {
        status: 200,
        body: '<html><body>Internal Error</body></html>',
      }
      const assertion: Assertion = {
        id: '1',
        type: 'jsonPath',
        target: '$.data.id',
        operator: 'exists',
      }
      const result = evaluateAssertion(assertion, badResponse)
      expect(result.passed).toBe(false)
      expect(result.message).toBe('Response body is not valid JSON')
    })
  })

  describe('Type and Length assertions', () => {
    it('validates property types', () => {
      const idIsNumber: Assertion = {
        id: '1',
        type: 'type',
        target: '$.data.id',
        operator: 'equals',
        expected: 'number',
      }
      expect(evaluateAssertion(idIsNumber, sampleResponse).passed).toBe(true)

      const rolesIsArray: Assertion = {
        id: '2',
        type: 'type',
        target: '$.data.roles',
        operator: 'equals',
        expected: 'array',
      }
      expect(evaluateAssertion(rolesIsArray, sampleResponse).passed).toBe(true)
    })

    it('validates array and string lengths', () => {
      const itemsLength: Assertion = {
        id: '1',
        type: 'length',
        target: '$.items',
        operator: 'equals',
        expected: 3,
      }
      expect(evaluateAssertion(itemsLength, sampleResponse).passed).toBe(true)

      const itemsMinLength: Assertion = {
        id: '2',
        type: 'length',
        target: '$.items',
        operator: 'greaterThan',
        expected: 0,
      }
      expect(evaluateAssertion(itemsMinLength, sampleResponse).passed).toBe(true)
    })
  })

  describe('Response time assertions', () => {
    it('evaluates latency against threshold', () => {
      const fastEnough: Assertion = {
        id: '1',
        type: 'responseTime',
        operator: 'lessThan',
        expected: 500,
      }
      expect(evaluateAssertion(fastEnough, sampleResponse).passed).toBe(true)

      const tooStrict: Assertion = {
        id: '2',
        type: 'responseTime',
        operator: 'lessThan',
        expected: 50,
      }
      expect(evaluateAssertion(tooStrict, sampleResponse).passed).toBe(false)
    })
  })

  describe('Batch evaluation (evaluateAssertions)', () => {
    it('evaluates an array of assertions and returns all results', () => {
      const assertions: Assertion[] = [
        { id: '1', type: 'status', operator: 'equals', expected: 201 },
        { id: '2', type: 'jsonPath', target: '$.data.id', operator: 'exists' },
        { id: '3', type: 'status', operator: 'equals', expected: 400 }, // failing
      ]

      const results = evaluateAssertions(assertions, sampleResponse)
      expect(results).toHaveLength(3)
      expect(results[0]?.passed).toBe(true)
      expect(results[1]?.passed).toBe(true)
      expect(results[2]?.passed).toBe(false)
    })
  })
})
