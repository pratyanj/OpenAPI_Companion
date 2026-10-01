import type {
  PaginationConfig,
  PaginationStepResult,
  PaginationAnomaly,
  PaginationChecks,
} from './types'

const CANDIDATE_ID_KEYS = ['id', '_id', 'uuid', 'key', 'code', 'slug', 'email']

function getRecordIdentifier(record: unknown): string | null {
  if (record === null || record === undefined) return null

  if (typeof record === 'string' || typeof record === 'number') {
    return String(record)
  }

  if (typeof record === 'object') {
    const obj = record as Record<string, unknown>
    for (const key of CANDIDATE_ID_KEYS) {
      const val = obj[key]
      if (val !== undefined && val !== null && val !== '') {
        return String(val)
      }
    }

    try {
      return JSON.stringify(record)
    } catch {
      return null
    }
  }

  return null
}

export interface IntegrityAnalysisResult {
  anomalies: PaginationAnomaly[]
  checks: PaginationChecks
  totalRecordsCount: number
  uniqueRecordsCount: number
}

export function analyzePaginationIntegrity(
  steps: PaginationStepResult[],
  config: PaginationConfig,
): IntegrityAnalysisResult {
  const anomalies: PaginationAnomaly[] = []

  let totalRecordsCount = 0
  const seenIds = new Map<string, number[]>() // id -> page numbers

  // 1. HTTP Errors & Empty pages
  for (const step of steps) {
    if (step.status >= 400 || step.error) {
      anomalies.push({
        type: 'http_error',
        severity: 'error',
        pageNumber: step.pageNumber,
        message: `Page ${step.pageNumber} returned error: ${step.error || `HTTP ${step.status}`}`,
        details: { status: step.status, error: step.error },
      })
    }

    totalRecordsCount += step.recordsCount

    // Track records for duplicate detection
    for (const record of step.records) {
      const id = getRecordIdentifier(record)
      if (id !== null) {
        const pages = seenIds.get(id) ?? []
        pages.push(step.pageNumber)
        seenIds.set(id, pages)
      }
    }
  }

  // 2. Duplicate Detection
  let duplicateCount = 0
  for (const [id, pages] of seenIds.entries()) {
    if (pages.length > 1) {
      duplicateCount++
      anomalies.push({
        type: 'duplicate',
        severity: 'error',
        pageNumber: pages[1],
        message: `Duplicate record "${id}" detected across pages: ${pages.join(', ')}`,
        details: { id, pages },
      })
    }
  }

  const uniqueRecordsCount = seenIds.size > 0 ? seenIds.size : totalRecordsCount

  // 3. Page Size Consistency
  let pageSizesValid = true
  const totalSteps = steps.length

  for (let i = 0; i < totalSteps; i++) {
    const step = steps[i]!
    const isFinalPage = i === totalSteps - 1

    if (!isFinalPage) {
      if (step.recordsCount !== config.pageSize) {
        pageSizesValid = false
        anomalies.push({
          type: 'page_size_mismatch',
          severity: 'warning',
          pageNumber: step.pageNumber,
          message: `Page ${step.pageNumber} returned ${step.recordsCount} records (expected page size: ${config.pageSize})`,
          details: { actual: step.recordsCount, expected: config.pageSize },
        })
      }
    } else {
      // On final page, returning more than page size is abnormal
      if (step.recordsCount > config.pageSize) {
        pageSizesValid = false
        anomalies.push({
          type: 'page_size_mismatch',
          severity: 'warning',
          pageNumber: step.pageNumber,
          message: `Final page ${step.pageNumber} returned ${step.recordsCount} records, exceeding page size ${config.pageSize}`,
          details: { actual: step.recordsCount, expected: config.pageSize },
        })
      }
    }
  }

  // 4. Cursor Progression & Cycles
  let cursorProgressionValid = true
  if (config.strategy === 'cursor') {
    const seenCursors = new Set<string>()
    for (const step of steps) {
      if (step.cursorValue) {
        if (seenCursors.has(step.cursorValue)) {
          cursorProgressionValid = false
          anomalies.push({
            type: 'stale_cursor',
            severity: 'error',
            pageNumber: step.pageNumber,
            message: `Cursor cycle detected: page ${step.pageNumber} received repeated cursor "${step.cursorValue}"`,
            details: { cursor: step.cursorValue },
          })
        }
        seenCursors.add(step.cursorValue)
      }
    }
  }

  // 5. Sequence Gap Heuristics
  // Check if collected IDs are sequential integers
  const numericIds: number[] = []
  for (const id of seenIds.keys()) {
    if (/^\d+$/.test(id)) {
      numericIds.push(parseInt(id, 10))
    }
  }

  if (numericIds.length >= 5 && numericIds.length === seenIds.size) {
    numericIds.sort((a, b) => a - b)
    const gaps: Array<{ from: number; to: number }> = []

    for (let i = 1; i < numericIds.length; i++) {
      const prev = numericIds[i - 1]!
      const curr = numericIds[i]!
      if (curr - prev > 1 && curr - prev <= 10) {
        gaps.push({ from: prev, to: curr })
      }
    }

    if (gaps.length > 0 && gaps.length <= 5) {
      for (const gap of gaps) {
        anomalies.push({
          type: 'id_gap',
          severity: 'info',
          message: `Heuristic: Potential ID sequence gap detected between ${gap.from} and ${gap.to} (missing ${gap.to - gap.from - 1} item${gap.to - gap.from - 1 > 1 ? 's' : ''})`,
          details: gap,
        })
      }
    }
  }

  // 6. Final Page Detected
  const lastStep = steps[steps.length - 1]
  const finalPageDetected =
    !lastStep ||
    lastStep.recordsCount === 0 ||
    lastStep.recordsCount < config.pageSize ||
    (config.strategy === 'cursor' && !lastStep.cursorValue) ||
    steps.length >= config.maxPages

  const checks: PaginationChecks = {
    duplicatesClean: duplicateCount === 0,
    pageSizesValid,
    cursorProgressionValid,
    finalPageDetected,
  }

  return {
    anomalies,
    checks,
    totalRecordsCount,
    uniqueRecordsCount,
  }
}
