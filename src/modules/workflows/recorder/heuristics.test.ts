import { describe, it, expect } from 'vitest'
import {
  formatVariableName,
  extractCandidatesFromResponse,
  detectVariableMatches,
  analyzeScenarioVariables,
  type CandidateValue,
} from './heuristics'
import type { RecordedStep } from './types'

describe('Scenario Recorder Heuristics', () => {
  describe('formatVariableName', () => {
    it('formats camelCase and PascalCase into snake_case', () => {
      expect(formatVariableName('userId')).toBe('user_id')
      expect(formatVariableName('accessToken')).toBe('access_token')
      expect(formatVariableName('order_id')).toBe('order_id')
    })

    it('infers resource name for generic id keys', () => {
      expect(formatVariableName('id', '/users')).toBe('user_id')
      expect(formatVariableName('id', '/api/v1/projects')).toBe('project_id')
      expect(formatVariableName('id')).toBe('id')
    })
  })

  describe('extractCandidatesFromResponse', () => {
    it('extracts candidate identifiers and tokens from response JSON', () => {
      const body = JSON.stringify({
        status: 'success',
        data: {
          id: 92831,
          userId: 'usr_abc123',
          access_token: 'jwt.token.string',
          active: true, // should be ignored
          role: 'user', // should be ignored
        },
      })

      const candidates = extractCandidatesFromResponse(body, 0, '/users')
      expect(candidates.length).toBeGreaterThanOrEqual(3)

      const keys = candidates.map((c) => c.key)
      expect(keys).toContain('id')
      expect(keys).toContain('userId')
      expect(keys).toContain('access_token')
      expect(keys).not.toContain('active')
      expect(keys).not.toContain('role')
    })

    it('handles arrays and deeply nested objects', () => {
      const body = JSON.stringify({
        items: [
          { id: 101, name: 'Item 1' },
          { id: 102, name: 'Item 2' },
        ],
      })

      const candidates = extractCandidatesFromResponse(body, 0)
      expect(candidates).toHaveLength(2)
      expect(candidates[0]?.value).toBe('101')
      expect(candidates[0]?.jsonPath).toBe('$.items[0].id')
    })

    it('returns empty array on non-JSON or empty response', () => {
      expect(extractCandidatesFromResponse(undefined, 0)).toEqual([])
      expect(extractCandidatesFromResponse('Not JSON', 0)).toEqual([])
      expect(extractCandidatesFromResponse('', 0)).toEqual([])
    })
  })

  describe('detectVariableMatches', () => {
    const candidate: CandidateValue = {
      stepIndex: 0,
      key: 'userId',
      jsonPath: '$.data.userId',
      value: 'usr_998877',
      variableName: 'user_id',
    }

    it('detects candidate in pathParams', () => {
      const step: RecordedStep = {
        id: 'step_2',
        order: 2,
        endpointId: 'get /users/{userId}',
        method: 'GET',
        endpoint: '/users/{userId}',
        pathParams: { userId: 'usr_998877' },
        timestamp: 100,
      }

      const matches = detectVariableMatches([candidate], step, 1)
      expect(matches).toHaveLength(1)
      expect(matches[0]?.variableName).toBe('user_id')
      expect(matches[0]?.targetLocation).toBe('path')
      expect(matches[0]?.targetKey).toBe('userId')
      expect(matches[0]?.extractedFromStepIndex).toBe(0)
      expect(matches[0]?.targetStepIndex).toBe(1)
    })

    it('detects candidate in query parameters', () => {
      const step: RecordedStep = {
        id: 'step_2',
        order: 2,
        endpointId: 'get /orders',
        method: 'GET',
        endpoint: '/orders',
        queryParams: { user: 'usr_998877' },
        timestamp: 100,
      }

      const matches = detectVariableMatches([candidate], step, 1)
      expect(matches).toHaveLength(1)
      expect(matches[0]?.targetLocation).toBe('query')
      expect(matches[0]?.targetKey).toBe('user')
    })

    it('detects candidate in request body', () => {
      const step: RecordedStep = {
        id: 'step_2',
        order: 2,
        endpointId: 'post /orders',
        method: 'POST',
        endpoint: '/orders',
        body: JSON.stringify({ customerId: 'usr_998877', amount: 50 }),
        timestamp: 100,
      }

      const matches = detectVariableMatches([candidate], step, 1)
      expect(matches).toHaveLength(1)
      expect(matches[0]?.targetLocation).toBe('body')
    })
  })

  describe('analyzeScenarioVariables', () => {
    it('analyzes multi-step API flows and builds chaining suggestions', () => {
      const steps: RecordedStep[] = [
        {
          id: 'step_1',
          order: 1,
          endpointId: 'post /login',
          method: 'POST',
          endpoint: '/login',
          response: {
            status: 200,
            body: JSON.stringify({ token: 'sec_token_12345' }),
          },
          timestamp: 100,
        },
        {
          id: 'step_2',
          order: 2,
          endpointId: 'post /users',
          method: 'POST',
          endpoint: '/users',
          headers: { Authorization: 'Bearer sec_token_12345' },
          body: JSON.stringify({ name: 'Alice' }),
          response: {
            status: 201,
            body: JSON.stringify({ id: 88776, name: 'Alice' }),
          },
          timestamp: 200,
        },
        {
          id: 'step_3',
          order: 3,
          endpointId: 'get /users/{id}',
          method: 'GET',
          endpoint: '/users/{id}',
          pathParams: { id: '88776' },
          headers: { Authorization: 'Bearer sec_token_12345' },
          timestamp: 300,
        },
      ]

      const suggestions = analyzeScenarioVariables(steps)
      expect(suggestions.length).toBeGreaterThanOrEqual(3)

      // Token used in step 1 & step 2
      const tokenMatches = suggestions.filter((s) => s.variableName === 'token')
      expect(tokenMatches).toHaveLength(2)
      expect(tokenMatches[0]?.targetStepIndex).toBe(1)
      expect(tokenMatches[1]?.targetStepIndex).toBe(2)

      // User ID extracted from step 1 used in step 2
      const idMatch = suggestions.find(
        (s) => s.variableName.includes('id') && s.targetStepIndex === 2,
      )
      expect(idMatch).toBeDefined()
      expect(idMatch?.extractedFromStepIndex).toBe(1)
      expect(idMatch?.originalValue).toBe('88776')
    })
  })
})
