import type { DetectedPagination } from './types'

export interface ParameterInfo {
  name: string
  in?: string
  schema?: {
    type?: string
    default?: unknown
    example?: unknown
    minimum?: number
  }
  default?: unknown
  example?: unknown
}

const PAGE_NAMES = [
  'page',
  'page_number',
  'page_no',
  'pageno',
  'pagenumber',
  'page_num',
  'pagenum',
  'p',
]

const PAGE_SIZE_NAMES = [
  'limit',
  'page_size',
  'pagesize',
  'per_page',
  'perpage',
  'size',
  'count',
  'max_results',
  'maxresults',
  'take',
]

const OFFSET_NAMES = ['offset', 'skip', 'start', 'from', 'start_index', 'startindex']

const CURSOR_NAMES = [
  'cursor',
  'next_cursor',
  'nextcursor',
  'continuation_token',
  'continuationtoken',
  'starting_after',
  'startingafter',
  'after',
  'pointer',
]

function findParam(params: ParameterInfo[], names: string[]): ParameterInfo | undefined {
  return params.find((p) => {
    const cleanName = p.name.trim().toLowerCase()
    return names.includes(cleanName)
  })
}

function parseNumber(val: unknown): number | undefined {
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (typeof val === 'string') {
    const parsed = parseInt(val, 10)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

export function detectPagination(
  parameters: ParameterInfo[],
  _endpointPath?: string,
): DetectedPagination | null {
  if (!parameters || parameters.length === 0) {
    return null
  }

  // Filter to query or path parameters (ignore headers/cookies for detection)
  const candidateParams = parameters.filter((p) => !p.in || p.in === 'query' || p.in === 'path')

  const cursorParam = findParam(candidateParams, CURSOR_NAMES)
  const offsetParam = findParam(candidateParams, OFFSET_NAMES)
  const pageParam = findParam(candidateParams, PAGE_NAMES)
  const sizeParam = findParam(candidateParams, PAGE_SIZE_NAMES)

  const defaultSize =
    parseNumber(sizeParam?.schema?.default) ??
    parseNumber(sizeParam?.default) ??
    parseNumber(sizeParam?.schema?.example) ??
    parseNumber(sizeParam?.example) ??
    20

  // 1. Cursor strategy
  if (cursorParam) {
    return {
      strategy: 'cursor',
      cursorParam: cursorParam.name,
      pageSizeParam: sizeParam?.name,
      cursorPath: '$.next_cursor',
      confidence: 'high',
      detectedFrom: sizeParam
        ? `Cursor parameter "${cursorParam.name}" & size parameter "${sizeParam.name}"`
        : `Cursor parameter "${cursorParam.name}"`,
      suggestedPageSize: defaultSize,
    }
  }

  // 2. Limit / Offset strategy
  if (offsetParam) {
    const initialOffset =
      parseNumber(offsetParam.schema?.default) ??
      parseNumber(offsetParam.default) ??
      parseNumber(offsetParam.schema?.minimum) ??
      0

    return {
      strategy: 'offset',
      offsetParam: offsetParam.name,
      pageSizeParam: sizeParam?.name,
      confidence: sizeParam ? 'high' : 'medium',
      detectedFrom: sizeParam
        ? `Limit/Offset parameters "${offsetParam.name}", "${sizeParam.name}"`
        : `Offset parameter "${offsetParam.name}"`,
      suggestedInitialOffset: initialOffset,
      suggestedPageSize: defaultSize,
    }
  }

  // 3. Page-based strategy
  if (pageParam) {
    const initialPage =
      parseNumber(pageParam.schema?.default) ??
      parseNumber(pageParam.default) ??
      parseNumber(pageParam.schema?.minimum) ??
      1

    return {
      strategy: 'page',
      pageParam: pageParam.name,
      pageSizeParam: sizeParam?.name,
      confidence: sizeParam ? 'high' : 'medium',
      detectedFrom: sizeParam
        ? `Page parameters "${pageParam.name}", "${sizeParam.name}"`
        : `Page parameter "${pageParam.name}"`,
      suggestedInitialPage: initialPage === 0 ? 0 : 1,
      suggestedPageSize: defaultSize,
    }
  }

  // 4. Standalone page size parameter
  if (sizeParam) {
    return {
      strategy: 'page',
      pageParam: 'page',
      pageSizeParam: sizeParam.name,
      confidence: 'low',
      detectedFrom: `Size parameter "${sizeParam.name}" (inferred page-based pagination)`,
      suggestedInitialPage: 1,
      suggestedPageSize: defaultSize,
    }
  }

  return null
}
