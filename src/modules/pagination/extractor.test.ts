import { describe, it, expect } from 'vitest'
import { extractRecordsFromResponse } from './extractor'

describe('Pagination Extractor', () => {
  it('returns empty records when body is invalid JSON or non-object', () => {
    expect(extractRecordsFromResponse('')).toEqual({ records: [], nextCursor: null })
    expect(extractRecordsFromResponse('not a json')).toEqual({ records: [], nextCursor: null })
    expect(extractRecordsFromResponse(1234)).toEqual({ records: [], nextCursor: null })
  })

  it('extracts records directly from a root JSON array', () => {
    const raw = JSON.stringify([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])

    const result = extractRecordsFromResponse(raw)
    expect(result.records).toHaveLength(2)
    expect(result.rootPath).toBe('$')
    expect(result.records[0].name).toBe('Alice')
    expect(result.nextCursor).toBeNull()
  })

  it('extracts records from common container keys (data, items, results)', () => {
    const rawData = JSON.stringify({
      data: [{ id: 10 }, { id: 11 }],
      total: 2,
    })
    expect(extractRecordsFromResponse(rawData).rootPath).toBe('$.data')
    expect(extractRecordsFromResponse(rawData).records).toHaveLength(2)

    const rawItems = JSON.stringify({
      items: [{ id: 20 }],
      page: 1,
    })
    expect(extractRecordsFromResponse(rawItems).rootPath).toBe('$.items')

    const rawResults = JSON.stringify({
      results: [{ id: 30 }, { id: 31 }, { id: 32 }],
    })
    expect(extractRecordsFromResponse(rawResults).rootPath).toBe('$.results')
  })

  it('extracts top-level next_cursor if available', () => {
    const raw = JSON.stringify({
      data: [{ id: 101 }],
      next_cursor: 'cursor_xyz987',
    })

    const result = extractRecordsFromResponse(raw)
    expect(result.records).toHaveLength(1)
    expect(result.nextCursor).toBe('cursor_xyz987')
  })

  it('extracts nested meta.next_cursor or pagination.next_cursor', () => {
    const raw = JSON.stringify({
      items: [{ id: 201 }],
      meta: {
        next_cursor: 'meta_cur_456',
      },
    })

    const result = extractRecordsFromResponse(raw)
    expect(result.nextCursor).toBe('meta_cur_456')
  })

  it('extracts custom cursor via explicit JSONPath', () => {
    const raw = JSON.stringify({
      records: [{ id: 501 }],
      custom: {
        pagination: {
          token: 'token_abc',
        },
      },
    })

    const result = extractRecordsFromResponse(raw, '$.custom.pagination.token')
    expect(result.nextCursor).toBe('token_abc')
  })
})
