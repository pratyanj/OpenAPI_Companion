import { describe, it, expect } from 'vitest'
import { detectPagination } from './detector'

describe('Pagination Detector', () => {
  it('returns null when parameters list is empty', () => {
    expect(detectPagination([])).toBeNull()
  })

  it('detects page-based pagination with page and limit parameters', () => {
    const params = [
      { name: 'page', in: 'query', schema: { default: 1 } },
      { name: 'limit', in: 'query', schema: { default: 25 } },
      { name: 'sort', in: 'query' },
    ]

    const result = detectPagination(params)
    expect(result).not.toBeNull()
    expect(result?.strategy).toBe('page')
    expect(result?.pageParam).toBe('page')
    expect(result?.pageSizeParam).toBe('limit')
    expect(result?.confidence).toBe('high')
    expect(result?.suggestedInitialPage).toBe(1)
    expect(result?.suggestedPageSize).toBe(25)
  })

  it('detects 0-indexed page parameter when default is 0', () => {
    const params = [
      { name: 'pageNo', in: 'query', schema: { default: 0 } },
      { name: 'pageSize', in: 'query', schema: { default: 50 } },
    ]

    const result = detectPagination(params)
    expect(result?.strategy).toBe('page')
    expect(result?.pageParam).toBe('pageNo')
    expect(result?.suggestedInitialPage).toBe(0)
    expect(result?.suggestedPageSize).toBe(50)
  })

  it('detects offset-based pagination with offset and limit', () => {
    const params = [
      { name: 'offset', in: 'query', default: 0 },
      { name: 'limit', in: 'query', default: 10 },
    ]

    const result = detectPagination(params)
    expect(result?.strategy).toBe('offset')
    expect(result?.offsetParam).toBe('offset')
    expect(result?.pageSizeParam).toBe('limit')
    expect(result?.confidence).toBe('high')
    expect(result?.suggestedInitialOffset).toBe(0)
    expect(result?.suggestedPageSize).toBe(10)
  })

  it('detects cursor-based pagination with cursor or next_cursor', () => {
    const params = [
      { name: 'starting_after', in: 'query' },
      { name: 'limit', in: 'query', default: 100 },
    ]

    const result = detectPagination(params)
    expect(result?.strategy).toBe('cursor')
    expect(result?.cursorParam).toBe('starting_after')
    expect(result?.pageSizeParam).toBe('limit')
    expect(result?.confidence).toBe('high')
    expect(result?.cursorPath).toBe('$.next_cursor')
    expect(result?.suggestedPageSize).toBe(100)
  })

  it('infers page pagination when only per_page is present', () => {
    const params = [{ name: 'per_page', in: 'query', default: 15 }]

    const result = detectPagination(params)
    expect(result?.strategy).toBe('page')
    expect(result?.confidence).toBe('low')
    expect(result?.pageSizeParam).toBe('per_page')
    expect(result?.suggestedPageSize).toBe(15)
  })

  it('returns null when parameters do not match any pagination patterns', () => {
    const params = [
      { name: 'id', in: 'path' },
      { name: 'filter', in: 'query' },
      { name: 'status', in: 'query' },
    ]

    expect(detectPagination(params)).toBeNull()
  })
})
