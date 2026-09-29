/**
 * Dynamic Value Detection Heuristics for API Scenario Recorder.
 * Analyzes response properties and identifies chaining candidates in subsequent requests.
 */

import type { RecordedStep, SuggestedVariableBinding } from './types'

export interface CandidateValue {
  stepIndex: number
  key: string
  jsonPath: string
  value: string
  variableName: string
}

const COMMON_FALSE_POSITIVES = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'success',
  'error',
  'ok',
  'fail',
  'pending',
  'active',
  'inactive',
  'default',
  'admin',
  'user',
  'test',
])

/** Check if a key is likely an identifier, token, or dynamic reference. */
function isCandidateKey(key: string): boolean {
  const lower = key.toLowerCase()
  return (
    lower === 'id' ||
    lower === '_id' ||
    lower.endsWith('id') ||
    lower.endsWith('_id') ||
    lower.includes('token') ||
    lower.includes('uuid') ||
    lower.includes('secret') ||
    lower.includes('key') ||
    lower.includes('code') ||
    lower.includes('slug')
  )
}

/** Formats a candidate key into a clean snake_case template variable name. */
export function formatVariableName(key: string, endpointPath?: string): string {
  let name = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toLowerCase()

  // If the key is just "id" or "_id" and endpointPath is e.g. "/users" or "/teams", prefix it
  if ((name === 'id' || name === '_id') && endpointPath) {
    const segments = endpointPath.split('/').filter(Boolean)
    const resource = segments[segments.length - 1]
    if (resource && !resource.startsWith('{')) {
      const singular = resource.endsWith('s') ? resource.slice(0, -1) : resource
      name = `${singular}_id`
    }
  }

  return name.replace(/^_+|_+$/g, '') || 'extracted_var'
}

/**
 * Recursively inspects a JSON object/array to find candidate IDs and tokens.
 */
export function extractCandidatesFromResponse(
  body: string | undefined,
  stepIndex: number,
  endpointPath?: string,
): CandidateValue[] {
  if (!body) return []

  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }

  const candidates: CandidateValue[] = []

  function walk(node: unknown, path: string, keyName?: string): void {
    if (node === null || node === undefined) return

    if (typeof node === 'string' || typeof node === 'number') {
      const strVal = String(node).trim()

      // Ignore short numbers/strings, booleans, and common false positives
      if (
        strVal.length >= 3 &&
        !COMMON_FALSE_POSITIVES.has(strVal.toLowerCase()) &&
        (typeof node === 'string' || Number(node) > 10)
      ) {
        if (keyName && isCandidateKey(keyName)) {
          candidates.push({
            stepIndex,
            key: keyName,
            jsonPath: path,
            value: strVal,
            variableName: formatVariableName(keyName, endpointPath),
          })
        }
      }
      return
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        walk(item, `${path}[${index}]`, keyName)
      })
      return
    }

    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : `$.${k}`, k)
      }
    }
  }

  walk(parsed, '$', undefined)
  return candidates
}

/**
 * Compares candidates from prior steps against a target step to find matches.
 */
export function detectVariableMatches(
  priorCandidates: CandidateValue[],
  targetStep: RecordedStep,
  targetStepIndex: number,
): SuggestedVariableBinding[] {
  const suggestions: SuggestedVariableBinding[] = []
  const seen = new Set<string>()

  function addSuggestion(
    candidate: CandidateValue,
    location: 'path' | 'query' | 'body' | 'header',
    key?: string,
  ): void {
    const signature = `${candidate.variableName}:${location}:${key ?? ''}:${candidate.value}`
    if (seen.has(signature)) return
    seen.add(signature)

    suggestions.push({
      id: `var_${candidate.stepIndex}_to_${targetStepIndex}_${suggestions.length + 1}`,
      variableName: candidate.variableName,
      extractedFromStepIndex: candidate.stepIndex,
      sourceJsonPath: candidate.jsonPath,
      originalValue: candidate.value,
      targetStepIndex,
      targetLocation: location,
      targetKey: key,
      enabled: true,
    })
  }

  for (const candidate of priorCandidates) {
    if (candidate.stepIndex >= targetStepIndex) continue

    const val = candidate.value

    // 1. Check path params
    if (targetStep.pathParams) {
      for (const [pKey, pVal] of Object.entries(targetStep.pathParams)) {
        if (pVal === val) {
          addSuggestion(candidate, 'path', pKey)
        }
      }
    }

    // 2. Check URL path segments if not found in pathParams
    if (targetStep.endpoint && targetStep.endpoint.includes(val)) {
      addSuggestion(candidate, 'path')
    }

    // 3. Check query params
    if (targetStep.queryParams) {
      for (const [qKey, qVal] of Object.entries(targetStep.queryParams)) {
        if (qVal === val) {
          addSuggestion(candidate, 'query', qKey)
        }
      }
    }

    // 4. Check headers (e.g. Bearer token or custom header)
    if (targetStep.headers) {
      for (const [hKey, hVal] of Object.entries(targetStep.headers)) {
        if (hVal.includes(val)) {
          addSuggestion(candidate, 'header', hKey)
        }
      }
    }

    // 5. Check request body
    if (targetStep.body && targetStep.body.includes(val)) {
      addSuggestion(candidate, 'body')
    }
  }

  return suggestions
}

/**
 * Analyzes an entire recorded scenario to find all variable chaining opportunities.
 */
export function analyzeScenarioVariables(steps: RecordedStep[]): SuggestedVariableBinding[] {
  const allCandidates: CandidateValue[] = []
  const allSuggestions: SuggestedVariableBinding[] = []

  steps.forEach((step, idx) => {
    // Check if previous candidates match this step
    const matches = detectVariableMatches(allCandidates, step, idx)
    allSuggestions.push(...matches)

    // Extract new candidates from this step's response
    if (step.response?.body) {
      const candidates = extractCandidatesFromResponse(step.response.body, idx, step.endpoint)
      allCandidates.push(...candidates)
    }
  })

  return allSuggestions
}
