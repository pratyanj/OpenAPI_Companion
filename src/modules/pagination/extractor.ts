import { extractJsonPath } from '../workflows/assertions/jsonpath'

export interface ExtractedPaginationData {
  records: any[]
  rootPath?: string
  nextCursor?: string | null
}

const COMMON_COLLECTION_KEYS = [
  'data',
  'items',
  'results',
  'records',
  'content',
  'rows',
  'entities',
  'list',
  'elements',
]

const COMMON_CURSOR_KEYS = [
  'next_cursor',
  'nextCursor',
  'cursor',
  'next',
  'continuation_token',
  'continuationToken',
  'pointer',
]

const NESTED_CURSOR_PATHS = [
  '$.meta.next_cursor',
  '$.meta.nextCursor',
  '$.meta.cursor',
  '$.pagination.next_cursor',
  '$.pagination.nextCursor',
  '$.pagination.cursor',
  '$.links.next',
]

export function extractRecordsFromResponse(
  rawBody: unknown,
  explicitCursorPath?: string,
): ExtractedPaginationData {
  let parsed: unknown = rawBody

  if (typeof rawBody === 'string') {
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      return { records: [], nextCursor: null }
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { records: [], nextCursor: null }
  }

  // 1. Direct Array
  if (Array.isArray(parsed)) {
    return {
      records: parsed,
      rootPath: '$',
      nextCursor: null,
    }
  }

  const obj = parsed as Record<string, unknown>
  let records: any[] = []
  let rootPath: string | undefined

  // 2. Check prioritized collection keys
  for (const key of COMMON_COLLECTION_KEYS) {
    if (Array.isArray(obj[key])) {
      records = obj[key] as any[]
      rootPath = `$.${key}`
      break
    }
  }

  // 3. Fallback: inspect any top-level key that is an array
  if (!rootPath) {
    for (const [key, val] of Object.entries(obj)) {
      if (Array.isArray(val) && val.length > 0) {
        records = val
        rootPath = `$.${key}`
        break
      }
    }
  }

  // 4. Extract cursor if requested or discoverable
  let nextCursor: string | null = null

  if (explicitCursorPath) {
    const extracted = extractJsonPath(parsed, explicitCursorPath)
    if (extracted !== undefined && extracted !== null) {
      nextCursor = typeof extracted === 'string' ? extracted : String(extracted)
    }
  } else {
    // Check top-level cursor keys
    for (const key of COMMON_CURSOR_KEYS) {
      const val = obj[key]
      if (val !== undefined && val !== null && val !== '') {
        nextCursor = typeof val === 'string' ? val : String(val)
        break
      }
    }

    // Check nested cursor paths
    if (!nextCursor) {
      for (const path of NESTED_CURSOR_PATHS) {
        const extracted = extractJsonPath(parsed, path)
        if (extracted !== undefined && extracted !== null && extracted !== '') {
          nextCursor = typeof extracted === 'string' ? extracted : String(extracted)
          break
        }
      }
    }
  }

  return {
    records,
    rootPath,
    nextCursor,
  }
}
