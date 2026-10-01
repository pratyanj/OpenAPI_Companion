import { describe, it, expect } from 'vitest'
import { analyzePaginationIntegrity } from './integrity'
import type { PaginationConfig, PaginationStepResult } from './types'

describe('Pagination Integrity Analyzer', () => {
  const baseConfig: PaginationConfig = {
    endpointId: 'get /users',
    strategy: 'page',
    pageParam: 'page',
    pageSizeParam: 'limit',
    pageSize: 10,
    maxPages: 5,
    delayMs: 0,
  }

  it('detects clean pagination with no anomalies', () => {
    const steps: PaginationStepResult[] = [
      {
        pageNumber: 1,
        queryParams: { page: '1', limit: '10' },
        status: 200,
        durationMs: 50,
        recordsCount: 10,
        records: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
      },
      {
        pageNumber: 2,
        queryParams: { page: '2', limit: '10' },
        status: 200,
        durationMs: 45,
        recordsCount: 5, // final partial page
        records: Array.from({ length: 5 }, (_, i) => ({ id: i + 11 })),
      },
    ]

    const result = analyzePaginationIntegrity(steps, baseConfig)
    expect(result.checks.duplicatesClean).toBe(true)
    expect(result.checks.pageSizesValid).toBe(true)
    expect(result.checks.cursorProgressionValid).toBe(true)
    expect(result.checks.finalPageDetected).toBe(true)
    expect(result.totalRecordsCount).toBe(15)
    expect(result.uniqueRecordsCount).toBe(15)
    expect(result.anomalies).toHaveLength(0)
  })

  it('detects duplicate records across pages', () => {
    const steps: PaginationStepResult[] = [
      {
        pageNumber: 1,
        queryParams: { page: '1' },
        status: 200,
        durationMs: 50,
        recordsCount: 2,
        records: [{ id: 'user_1' }, { id: 'user_2' }],
      },
      {
        pageNumber: 2,
        queryParams: { page: '2' },
        status: 200,
        durationMs: 45,
        recordsCount: 2,
        records: [{ id: 'user_2' }, { id: 'user_3' }], // duplicate 'user_2'
      },
    ]

    const result = analyzePaginationIntegrity(steps, { ...baseConfig, pageSize: 2 })
    expect(result.checks.duplicatesClean).toBe(false)
    const dupAnomaly = result.anomalies.find((a) => a.type === 'duplicate')
    expect(dupAnomaly).toBeDefined()
    expect(dupAnomaly?.message).toContain('Duplicate record "user_2"')
    expect(result.totalRecordsCount).toBe(4)
    expect(result.uniqueRecordsCount).toBe(3)
  })

  it('flags page size mismatch on intermediate pages', () => {
    const steps: PaginationStepResult[] = [
      {
        pageNumber: 1,
        queryParams: { page: '1' },
        status: 200,
        durationMs: 50,
        recordsCount: 8, // expected 10 on non-final page
        records: Array.from({ length: 8 }, (_, i) => ({ id: i + 1 })),
      },
      {
        pageNumber: 2,
        queryParams: { page: '2' },
        status: 200,
        durationMs: 45,
        recordsCount: 10,
        records: Array.from({ length: 10 }, (_, i) => ({ id: i + 10 })),
      },
    ]

    const result = analyzePaginationIntegrity(steps, baseConfig)
    expect(result.checks.pageSizesValid).toBe(false)
    const sizeAnomaly = result.anomalies.find((a) => a.type === 'page_size_mismatch')
    expect(sizeAnomaly).toBeDefined()
    expect(sizeAnomaly?.message).toContain('Page 1 returned 8 records')
  })

  it('detects cursor cycles and stale cursors', () => {
    const cursorConfig: PaginationConfig = {
      ...baseConfig,
      strategy: 'cursor',
      cursorParam: 'cursor',
    }

    const steps: PaginationStepResult[] = [
      {
        pageNumber: 1,
        queryParams: {},
        status: 200,
        durationMs: 50,
        recordsCount: 10,
        records: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
        cursorValue: 'cur_abc',
      },
      {
        pageNumber: 2,
        queryParams: { cursor: 'cur_abc' },
        status: 200,
        durationMs: 50,
        recordsCount: 10,
        records: Array.from({ length: 10 }, (_, i) => ({ id: i + 11 })),
        cursorValue: 'cur_abc', // cycle!
      },
    ]

    const result = analyzePaginationIntegrity(steps, cursorConfig)
    expect(result.checks.cursorProgressionValid).toBe(false)
    const cursorAnomaly = result.anomalies.find((a) => a.type === 'stale_cursor')
    expect(cursorAnomaly).toBeDefined()
    expect(cursorAnomaly?.message).toContain('Cursor cycle detected')
  })

  it('emits heuristic info for sequential integer ID gaps', () => {
    const steps: PaginationStepResult[] = [
      {
        pageNumber: 1,
        queryParams: { page: '1' },
        status: 200,
        durationMs: 50,
        recordsCount: 6,
        records: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 5 }, { id: 6 }, { id: 7 }], // missing 4
      },
    ]

    const result = analyzePaginationIntegrity(steps, { ...baseConfig, pageSize: 6 })
    const gapAnomaly = result.anomalies.find((a) => a.type === 'id_gap')
    expect(gapAnomaly).toBeDefined()
    expect(gapAnomaly?.severity).toBe('info')
    expect(gapAnomaly?.message).toContain('Potential ID sequence gap')
  })
})
