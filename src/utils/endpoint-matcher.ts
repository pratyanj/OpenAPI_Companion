/**
 * OpenAPI Endpoint Template Matcher (Point 12).
 *
 * Matches a parsed cURL request (concrete path & method) against available OpenAPI
 * endpoint route templates (e.g. `/tasks/{task_id}`), extracting path parameter values.
 */

import type { EndpointListItem } from '@/modules/productivity/types'
import type { ParsedCurl } from './curl-parser'

export interface EndpointMatchResult {
  endpoint: EndpointListItem
  endpointId: string
  method: string
  pathTemplate: string
  pathParams: Record<string, string>
  score: number // Higher score = better match
}

function cleanPathSegments(path: string): string[] {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Tries to match concrete path segments against OpenAPI template segments.
 * Example:
 *   concrete:   ['tasks', '42']
 *   template:   ['tasks', '{task_id}']
 *   Result:     { task_id: '42' }
 */
function matchSegments(
  concreteSegments: string[],
  templateSegments: string[],
): { matched: boolean; pathParams: Record<string, string> } {
  if (concreteSegments.length !== templateSegments.length) {
    return { matched: false, pathParams: {} }
  }

  const pathParams: Record<string, string> = {}

  for (let i = 0; i < templateSegments.length; i++) {
    const tSeg = templateSegments[i]
    const cSeg = concreteSegments[i]
    if (!tSeg || !cSeg) {
      return { matched: false, pathParams: {} }
    }

    if (tSeg.startsWith('{') && tSeg.endsWith('}')) {
      const paramName = tSeg.slice(1, -1).trim()
      pathParams[paramName] = decodeURIComponent(cSeg)
    } else if (tSeg.toLowerCase() !== cSeg.toLowerCase()) {
      return { matched: false, pathParams: {} }
    }
  }

  return { matched: true, pathParams }
}

/**
 * Finds the best matching endpoint from a list of OpenAPI endpoints for a given parsed cURL.
 */
export function matchEndpointFromCurl(
  curl: ParsedCurl,
  availableEndpoints: EndpointListItem[],
): EndpointMatchResult | null {
  if (!curl || !curl.path || availableEndpoints.length === 0) {
    return null
  }

  const curlMethod = (curl.method || 'GET').toLowerCase()
  const curlSegments = cleanPathSegments(curl.path)

  let bestMatch: EndpointMatchResult | null = null

  for (const ep of availableEndpoints) {
    const epMethod = (ep.method || 'GET').toLowerCase()
    const methodMatches = epMethod === curlMethod

    // Prefer same method, but allow cross-method fallback if method not explicitly matched
    const methodWeight = methodMatches ? 100 : 0
    if (!methodMatches) continue

    const epSegments = cleanPathSegments(ep.path)

    // 1. Direct segment match
    const direct = matchSegments(curlSegments, epSegments)
    if (direct.matched) {
      const paramCount = Object.keys(direct.pathParams).length
      // Exact literal segments score higher than parameter wildcards
      const exactSegmentCount = epSegments.length - paramCount
      const score = methodWeight + exactSegmentCount * 10 + 20

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          endpoint: ep,
          endpointId: ep.endpointId,
          method: ep.method,
          pathTemplate: ep.path,
          pathParams: direct.pathParams,
          score,
        }
      }
      continue
    }

    // 2. Suffix match (e.g. cURL has /api/v1/tasks/42, but spec has /tasks/{task_id})
    if (curlSegments.length > epSegments.length && epSegments.length > 0) {
      const offset = curlSegments.length - epSegments.length
      const subSegments = curlSegments.slice(offset)
      const suffixMatch = matchSegments(subSegments, epSegments)

      if (suffixMatch.matched) {
        const paramCount = Object.keys(suffixMatch.pathParams).length
        const exactSegmentCount = epSegments.length - paramCount
        const score = methodWeight + exactSegmentCount * 10 + 10

        if (!bestMatch || score > bestMatch.score) {
          bestMatch = {
            endpoint: ep,
            endpointId: ep.endpointId,
            method: ep.method,
            pathTemplate: ep.path,
            pathParams: suffixMatch.pathParams,
            score,
          }
        }
      }
    }
  }

  return bestMatch
}
