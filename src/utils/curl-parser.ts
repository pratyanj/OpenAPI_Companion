/**
 * Robust cURL command parser (Point 12).
 *
 * Extracts:
 * - HTTP Method (GET, POST, PUT, DELETE, PATCH, etc.)
 * - Full URL and path
 * - Query parameters dictionary
 * - Request headers dictionary
 * - Request body (raw and formatted JSON if valid)
 */

export interface ParsedCurl {
  raw: string
  method: string
  url: string
  path: string
  queryParams: Record<string, string>
  headers: Record<string, string>
  body?: string
  isJsonBody: boolean
  formattedBody?: string
}

/**
 * Normalizes cURL command string by handling line continuations (\\ or ` in PowerShell),
 * leading/trailing whitespace, and multiple whitespace characters.
 */
export function normalizeCurlString(raw: string): string {
  if (!raw) return ''
  return (
    raw
      // Normalize Windows PowerShell backtick continuations (absorbing surrounding whitespace)
      .replace(/\s*`\r?\n\s*/g, ' ')
      // Normalize Unix backslash continuations (absorbing surrounding whitespace)
      .replace(/\s*\\\r?\n\s*/g, ' ')
      .trim()
  )
}

/**
 * Parses raw cURL command into a structured ParsedCurl object.
 */
export function parseCurl(rawInput: string): ParsedCurl {
  const normalized = normalizeCurlString(rawInput)

  if (!normalized) {
    return {
      raw: '',
      method: 'GET',
      url: '',
      path: '',
      queryParams: {},
      headers: {},
      isJsonBody: false,
    }
  }

  // 1. Extract Method
  let method = 'GET'
  const methodMatch = normalized.match(/(?:-X|--request)\s+['"]?([A-Za-z]+)['"]?/i)
  if (methodMatch) {
    method = methodMatch[1].toUpperCase()
  }

  // 2. Extract Headers (-H or --header)
  const headers: Record<string, string> = {}
  const headerRegex = /(?:-H|--header)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/g
  let hMatch: RegExpExecArray | null
  while ((hMatch = headerRegex.exec(normalized)) !== null) {
    const rawHeader = hMatch[1] ?? hMatch[2] ?? hMatch[3] ?? ''
    const colonIdx = rawHeader.indexOf(':')
    if (colonIdx > 0) {
      const key = rawHeader.slice(0, colonIdx).trim()
      const val = rawHeader.slice(colonIdx + 1).trim()
      headers[key] = val
    }
  }

  // 3. Extract Body (-d, --data, --data-raw, --data-binary, --data-urlencode)
  let body: string | undefined
  const bodyRegex =
    /(?:-d|--data|--data-raw|--data-binary|--data-urlencode)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/
  const bodyMatch = normalized.match(bodyRegex)
  if (bodyMatch) {
    body = bodyMatch[1] ?? bodyMatch[2] ?? bodyMatch[3]
    if (body) {
      // Unescape escaped quotes
      body = body.replace(/\\'/g, "'").replace(/\\"/g, '"')
    }
  }

  // If data is provided but no explicit -X, cURL defaults to POST
  if (!methodMatch && body !== undefined) {
    method = 'POST'
  }

  // 4. Extract URL
  let url = ''
  // Try finding explicit --url flag first
  const explicitUrlMatch = normalized.match(/(?:--url)\s+['"]?([^\s'"]+)['"]?/)
  if (explicitUrlMatch) {
    url = explicitUrlMatch[1]
  } else {
    // Look for HTTP(S) URL or root-relative path
    const urlMatch = normalized.match(/['"]?(https?:\/\/[^\s'"\\]+)['"]?/)
    if (urlMatch) {
      url = urlMatch[1]
    } else {
      // Fallback: search for tokens starting with / that aren't flags
      const tokens = normalized.split(/\s+/)
      for (const token of tokens) {
        const cleanToken = token.replace(/^['"]|['"]$/g, '')
        if (cleanToken.startsWith('/') && !cleanToken.startsWith('--')) {
          url = cleanToken
          break
        }
      }
    }
  }

  // 5. Parse Path and Query Parameters from URL
  let path = url
  const queryParams: Record<string, string> = {}

  if (url) {
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsedUrl = new URL(url)
        path = parsedUrl.pathname
        parsedUrl.searchParams.forEach((val, key) => {
          queryParams[key] = val
        })
      } else {
        const qIdx = url.indexOf('?')
        if (qIdx >= 0) {
          path = url.slice(0, qIdx)
          const searchParams = new URLSearchParams(url.slice(qIdx + 1))
          searchParams.forEach((val, key) => {
            queryParams[key] = val
          })
        }
      }
    } catch {
      // Fallback manual query string parsing
      const qIdx = url.indexOf('?')
      if (qIdx >= 0) {
        path = url.slice(0, qIdx)
        const qs = url.slice(qIdx + 1)
        qs.split('&').forEach((pair) => {
          const [k, v] = pair.split('=')
          if (k) queryParams[decodeURIComponent(k)] = v ? decodeURIComponent(v) : ''
        })
      }
    }
  }

  // 6. JSON Body Validation & Pretty Formatting
  let isJsonBody = false
  let formattedBody: string | undefined

  if (body) {
    try {
      const parsedJson = JSON.parse(body)
      isJsonBody = true
      formattedBody = JSON.stringify(parsedJson, null, 2)
    } catch {
      isJsonBody = false
      formattedBody = body
    }
  }

  return {
    raw: rawInput,
    method,
    url,
    path,
    queryParams,
    headers,
    body,
    isJsonBody,
    formattedBody,
  }
}
