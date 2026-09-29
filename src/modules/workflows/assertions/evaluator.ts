/**
 * Assertion Evaluator Engine.
 * Evaluates configured assertions against executed HTTP response snapshots.
 */

import type {
  Assertion,
  AssertionOperator,
  AssertionResult,
  AssertionTargetResponse,
} from './types'
import { extractJsonPath } from './jsonpath'

/** Deep equality comparison for primitives, objects, and arrays. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || a === undefined || b === null || b === undefined) return a === b
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object)
    const keysB = Object.keys(b as object)
    if (keysA.length !== keysB.length) return false
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key)) return false
      if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
        return false
      }
    }
    return true
  }

  return false
}

function resolveType(val: unknown): string {
  if (val === null) return 'null'
  if (Array.isArray(val)) return 'array'
  return typeof val
}

function evaluateOperator(
  actual: unknown,
  operator: AssertionOperator,
  expected: unknown,
): { passed: boolean; reason?: string } {
  switch (operator) {
    case 'equals': {
      // If expected is a string representing a number and actual is number, or vice versa
      if (typeof actual === 'number' && typeof expected === 'string' && !isNaN(Number(expected))) {
        const passed = actual === Number(expected)
        return { passed, reason: passed ? undefined : `Expected ${expected}, but got ${actual}` }
      }
      const passed = deepEqual(actual, expected)
      return {
        passed,
        reason: passed
          ? undefined
          : `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(actual)}`,
      }
    }

    case 'notEquals': {
      const passed = !deepEqual(actual, expected)
      return {
        passed,
        reason: passed ? undefined : `Expected value not to equal ${JSON.stringify(expected)}`,
      }
    }

    case 'is2xx': {
      const code = Number(actual)
      const passed = code >= 200 && code < 300
      return { passed, reason: passed ? undefined : `Expected 2xx status, but got ${actual}` }
    }

    case 'is3xx': {
      const code = Number(actual)
      const passed = code >= 300 && code < 400
      return { passed, reason: passed ? undefined : `Expected 3xx status, but got ${actual}` }
    }

    case 'is4xx': {
      const code = Number(actual)
      const passed = code >= 400 && code < 500
      return { passed, reason: passed ? undefined : `Expected 4xx status, but got ${actual}` }
    }

    case 'is5xx': {
      const code = Number(actual)
      const passed = code >= 500 && code < 600
      return { passed, reason: passed ? undefined : `Expected 5xx status, but got ${actual}` }
    }

    case 'isNot5xx': {
      const code = Number(actual)
      const passed = isNaN(code) ? false : code < 500 || code >= 600
      return { passed, reason: passed ? undefined : `Expected non-5xx status, but got ${actual}` }
    }

    case 'exists': {
      const passed = actual !== undefined && actual !== null
      return { passed, reason: passed ? undefined : 'Expected value to exist' }
    }

    case 'notExists': {
      const passed = actual === undefined || actual === null
      return {
        passed,
        reason: passed ? undefined : `Expected value not to exist, but got ${JSON.stringify(actual)}`,
      }
    }

    case 'contains': {
      if (Array.isArray(actual)) {
        const passed = actual.some((item) => deepEqual(item, expected))
        return {
          passed,
          reason: passed
            ? undefined
            : `Array does not contain expected item: ${JSON.stringify(expected)}`,
        }
      }
      const strActual = String(actual ?? '')
      const strExp = String(expected ?? '')
      const passed = strActual.includes(strExp)
      return {
        passed,
        reason: passed ? undefined : `Expected text to contain "${strExp}", but got "${strActual}"`,
      }
    }

    case 'notContains': {
      if (Array.isArray(actual)) {
        const passed = !actual.some((item) => deepEqual(item, expected))
        return {
          passed,
          reason: passed
            ? undefined
            : `Array contains unexpected item: ${JSON.stringify(expected)}`,
        }
      }
      const strActual = String(actual ?? '')
      const strExp = String(expected ?? '')
      const passed = !strActual.includes(strExp)
      return {
        passed,
        reason: passed ? undefined : `Expected text not to contain "${strExp}"`,
      }
    }

    case 'greaterThan': {
      const numAct = Number(actual)
      const numExp = Number(expected)
      const passed = !isNaN(numAct) && !isNaN(numExp) && numAct > numExp
      return { passed, reason: passed ? undefined : `Expected ${numAct} > ${numExp}` }
    }

    case 'lessThan': {
      const numAct = Number(actual)
      const numExp = Number(expected)
      const passed = !isNaN(numAct) && !isNaN(numExp) && numAct < numExp
      return { passed, reason: passed ? undefined : `Expected ${numAct} < ${numExp}` }
    }

    case 'greaterThanOrEqual': {
      const numAct = Number(actual)
      const numExp = Number(expected)
      const passed = !isNaN(numAct) && !isNaN(numExp) && numAct >= numExp
      return { passed, reason: passed ? undefined : `Expected ${numAct} >= ${numExp}` }
    }

    case 'lessThanOrEqual': {
      const numAct = Number(actual)
      const numExp = Number(expected)
      const passed = !isNaN(numAct) && !isNaN(numExp) && numAct <= numExp
      return { passed, reason: passed ? undefined : `Expected ${numAct} <= ${numExp}` }
    }

    case 'matchesRegex': {
      try {
        const regex = new RegExp(String(expected))
        const passed = regex.test(String(actual ?? ''))
        return {
          passed,
          reason: passed
            ? undefined
            : `Value "${String(actual)}" does not match pattern /${String(expected)}/`,
        }
      } catch (e) {
        return { passed: false, reason: `Invalid regular expression: ${String(e)}` }
      }
    }

    default:
      return { passed: false, reason: `Unsupported operator: ${String(operator)}` }
  }
}

/**
 * Evaluates a single assertion against a response.
 */
export function evaluateAssertion(
  assertion: Assertion,
  response: AssertionTargetResponse,
): AssertionResult {
  const { id, type, target, operator, expected } = assertion

  let actual: unknown
  let parsedBody: unknown
  let parseError = false

  if (type === 'jsonPath' || type === 'type' || (type === 'length' && target)) {
    if (!response.body) {
      return {
        assertionId: id,
        type,
        target,
        operator,
        expected,
        actual: undefined,
        passed: false,
        message: 'Response body is empty',
      }
    }
    try {
      parsedBody = JSON.parse(response.body)
    } catch {
      parseError = true
    }
    if (parseError) {
      return {
        assertionId: id,
        type,
        target,
        operator,
        expected,
        actual: response.body,
        passed: false,
        message: 'Response body is not valid JSON',
      }
    }
  }

  switch (type) {
    case 'status': {
      actual = response.status
      break
    }

    case 'header': {
      if (!target) {
        return {
          assertionId: id,
          type,
          target,
          operator,
          expected,
          actual: undefined,
          passed: false,
          message: 'Header assertion requires a target header name',
        }
      }
      const targetLower = target.toLowerCase()
      const headers = response.headers ?? {}
      const matchingKey = Object.keys(headers).find((k) => k.toLowerCase() === targetLower)
      actual = matchingKey ? headers[matchingKey] : undefined
      break
    }

    case 'jsonPath': {
      actual = extractJsonPath(parsedBody, target ?? '$')
      break
    }

    case 'type': {
      const val = extractJsonPath(parsedBody, target ?? '$')
      actual = resolveType(val)
      break
    }

    case 'length': {
      let val: unknown
      if (target) {
        val = extractJsonPath(parsedBody, target)
      } else if (response.body) {
        try {
          val = JSON.parse(response.body)
        } catch {
          val = response.body
        }
      }
      if (Array.isArray(val) || typeof val === 'string') {
        actual = val.length
      } else if (typeof val === 'object' && val !== null) {
        actual = Object.keys(val).length
      } else {
        actual = undefined
      }
      break
    }

    case 'contains': {
      if (target) {
        try {
          const bodyJson = JSON.parse(response.body ?? '{}')
          actual = extractJsonPath(bodyJson, target)
        } catch {
          actual = response.body
        }
      } else {
        actual = response.body
      }
      break
    }

    case 'responseTime': {
      actual = response.durationMs
      break
    }

    default:
      return {
        assertionId: id,
        type,
        target,
        operator,
        expected,
        actual: undefined,
        passed: false,
        message: `Unknown assertion type: ${String(type)}`,
      }
  }

  const { passed, reason } = evaluateOperator(actual, operator, expected)

  return {
    assertionId: id,
    type,
    target,
    operator,
    expected,
    actual,
    passed,
    message: reason,
  }
}

/**
 * Evaluates a list of assertions against a response.
 */
export function evaluateAssertions(
  assertions: Assertion[],
  response: AssertionTargetResponse,
): AssertionResult[] {
  if (!assertions || assertions.length === 0) {
    return []
  }
  return assertions.map((a) => evaluateAssertion(a, response))
}
