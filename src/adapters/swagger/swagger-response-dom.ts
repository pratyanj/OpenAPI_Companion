import type { ExecutedResponse } from '../types'
import { endpointIdOf, readParametersFromBlock } from './swagger-request-dom'
import { parseCurl } from '@/utils/curl-parser'

/**
 * Reads executed responses from Swagger UI's rendered "live response" DOM
 * (DD-033: capture from the DOM, never intercept the network). Selectors match
 * standard Swagger UI markup and are the part most likely to need per-version
 * tuning (risk R-01) — isolated here and unit-tested against a synthetic block.
 */

const OPEN_BLOCK = '.opblock.is-open'
const LIVE_RESPONSE = '.live-responses-table, .responses-table.live-responses-table'
// Swagger's live-response table has a HEADER row whose cells also carry
// `.response-col_status` ("Code") / `.response-col_description` ("Details") —
// exclude it with `:not(.col_header)` so we read the actual data row.
const STATUS = '.response-col_status:not(.col_header)'
// `pre` first: Swagger nests the Download / Copy buttons INSIDE the highlight
// wrapper, so reading the wrapper's textContent prefixes the body with their
// labels ("Download{\"success\":…") — which is not parseable JSON. The <pre>
// holds just the code; the button-stripping below covers versions that differ.
const BODY =
  '.response-col_description:not(.col_header) pre, .response-col_description:not(.col_header) .microlight, .response-col_description:not(.col_header) .highlight-code'
/** Controls Swagger renders next to the body, whose text is not part of it. */
const NON_BODY = 'button, .copy-to-clipboard, .download-contents, svg'

/**
 * The response body as text, with Swagger's own controls stripped. Read from a
 * clone so the page's DOM is never mutated.
 */
function bodyTextOf(scope: Element): string | undefined {
  const node = scope.querySelector(BODY)
  if (!node) return undefined
  const clone = node.cloneNode(true) as Element
  for (const control of Array.from(clone.querySelectorAll(NON_BODY))) control.remove()
  return clone.textContent?.trim() || undefined
}

function parseStatus(text: string | null | undefined): number | null {
  const match = (text ?? '').match(/\d{3}/)
  return match ? Number(match[0]) : null
}

export function readExecutedResponses(doc: Document = document): ExecutedResponse[] {
  const results: ExecutedResponse[] = []
  for (const block of Array.from(doc.querySelectorAll(OPEN_BLOCK))) {
    const live = block.querySelector(LIVE_RESPONSE)
    if (!live) continue // not executed yet

    const endpointId = endpointIdOf(block)
    if (!endpointId) continue
    const status = parseStatus(live.querySelector(STATUS)?.textContent)
    if (status == null) continue

    const method = endpointId.split(' ')[0] ?? 'unknown'
    const endpoint = endpointId.slice(method.length + 1)
    const responseBody = bodyTextOf(live)
    const requestBody = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')?.value

    // Read parameters directly from Swagger UI inputs
    const { path: rawPath, query: rawQuery, headers: rawHeaders } = readParametersFromBlock(block)
    const queryParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawQuery)) {
      if (v != null && v !== '') queryParams[k] = v.trim()
    }
    const pathParams: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawPath)) {
      if (v != null && v !== '') pathParams[k] = v.trim()
    }
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(rawHeaders)) {
      if (v != null && v !== '') headers[k] = v.trim()
    }

    // Look for rendered executed Request URL or cURL command in the block/responses
    const urlNode = block.querySelector(
      '.request-url pre, .responses-inner .url pre, .responses-inner .request-url pre, .request-url, .responses-inner .url',
    )
    let requestUrl = urlNode?.textContent?.trim() || undefined

    // Fallback: check cURL command pre
    const curlNode = block.querySelector('.curl-command pre, .curl pre')
    const curlText = curlNode?.textContent?.trim()
    if (curlText) {
      try {
        const parsedCurl = parseCurl(curlText)
        if (!requestUrl && parsedCurl.url) {
          requestUrl = parsedCurl.url
        }
        if (parsedCurl.queryParams) {
          for (const [k, v] of Object.entries(parsedCurl.queryParams)) {
            if (v != null && v !== '') queryParams[k] = v
          }
        }
        if (parsedCurl.headers) {
          for (const [k, v] of Object.entries(parsedCurl.headers)) {
            if (v != null && v !== '' && !headers[k]) headers[k] = v
          }
        }
      } catch {
        // ignore curl parse failure
      }
    }

    // Parse searchParams from requestUrl
    if (requestUrl) {
      try {
        const dummyBase = 'http://localhost'
        const parsedUrl = new URL(requestUrl.startsWith('http') ? requestUrl : `${dummyBase}${requestUrl}`)
        parsedUrl.searchParams.forEach((val, key) => {
          if (val != null && val !== '') {
            queryParams[key] = val
          }
        })
      } catch {
        const qIdx = requestUrl.indexOf('?')
        if (qIdx >= 0) {
          const searchParams = new URLSearchParams(requestUrl.slice(qIdx + 1))
          searchParams.forEach((val, key) => {
            if (val != null && val !== '') {
              queryParams[key] = val
            }
          })
        }
      }
    }

    // Extract path parameters from URL path if template has {param} and pathParams is incomplete
    if (requestUrl && endpoint.includes('{')) {
      try {
        const dummyBase = 'http://localhost'
        const parsedUrl = new URL(requestUrl.startsWith('http') ? requestUrl : `${dummyBase}${requestUrl}`)
        const epSegments = endpoint.split('/').filter(Boolean)
        const urlSegments = parsedUrl.pathname.split('/').filter(Boolean)
        const offset = urlSegments.length - epSegments.length
        if (offset >= 0) {
          for (let i = 0; i < epSegments.length; i++) {
            const epSeg = epSegments[i]
            if (epSeg.startsWith('{') && epSeg.endsWith('}')) {
              const paramName = epSeg.slice(1, -1).trim()
              const segVal = urlSegments[offset + i]
              if (segVal && !pathParams[paramName]) {
                pathParams[paramName] = decodeURIComponent(segVal)
              }
            }
          }
        }
      } catch {
        // ignore path extraction failure
      }
    }

    const res: ExecutedResponse = {
      endpointId,
      method,
      endpoint,
      requestBody: requestBody || undefined,
      status,
      responseBody: responseBody || undefined,
    }
    if (Object.keys(queryParams).length > 0) res.queryParams = queryParams
    if (Object.keys(pathParams).length > 0) res.pathParams = pathParams
    if (Object.keys(headers).length > 0) res.headers = headers
    if (requestUrl) res.requestUrl = requestUrl

    results.push(res)
  }
  return results
}
