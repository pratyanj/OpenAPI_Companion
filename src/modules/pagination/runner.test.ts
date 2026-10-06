import { describe, it, expect, vi } from 'vitest'
import { PaginationRunner, type PaginationRequestExecutor } from './runner'
import type { PaginationConfig } from './types'

describe('Pagination Runner', () => {
  const instantDelay = vi.fn().mockResolvedValue(undefined)

  it('runs page-based progression until short page and stops', async () => {
    const executedPages: Array<Record<string, string>> = []

    const executor: PaginationRequestExecutor = async ({ queryParams }) => {
      executedPages.push({ ...queryParams })
      const page = parseInt(queryParams['page'] || '1', 10)

      if (page === 1) {
        return {
          status: 200,
          responseBody: JSON.stringify({
            data: Array.from({ length: 5 }, (_, i) => ({ id: i + 1 })),
          }),
        }
      } else if (page === 2) {
        return {
          status: 200,
          responseBody: JSON.stringify({
            data: Array.from({ length: 3 }, (_, i) => ({ id: i + 6 })), // short page (3 < 5)
          }),
        }
      }

      return {
        status: 200,
        responseBody: JSON.stringify({ data: [] }),
      }
    }

    const runner = new PaginationRunner(executor, instantDelay)
    const config: PaginationConfig = {
      endpointId: 'get /items',
      strategy: 'page',
      pageParam: 'page',
      pageSizeParam: 'limit',
      pageSize: 5,
      maxPages: 10,
      delayMs: 10,
    }

    const report = await runner.run(config)

    expect(report.totalPages).toBe(2)
    expect(report.totalRecords).toBe(8)
    expect(report.stoppedReason).toBe('short_page')
    expect(report.checks.pageSizesValid).toBe(true)
    expect(report.checks.duplicatesClean).toBe(true)
    expect(executedPages).toEqual([
      { page: '1', limit: '5' },
      { page: '2', limit: '5' },
    ])
  })

  it('runs offset-based progression and stops on empty page', async () => {
    const executedOffsets: number[] = []

    const executor: PaginationRequestExecutor = async ({ queryParams }) => {
      const offset = parseInt(queryParams['offset'] || '0', 10)
      executedOffsets.push(offset)

      if (offset < 20) {
        return {
          status: 200,
          responseBody: JSON.stringify({
            items: Array.from({ length: 10 }, (_, i) => ({ id: offset + i + 1 })),
          }),
        }
      }

      return {
        status: 200,
        responseBody: JSON.stringify({ items: [] }), // empty
      }
    }

    const runner = new PaginationRunner(executor, instantDelay)
    const config: PaginationConfig = {
      endpointId: 'get /products',
      strategy: 'offset',
      offsetParam: 'offset',
      pageSizeParam: 'limit',
      pageSize: 10,
      maxPages: 10,
      delayMs: 0,
    }

    const report = await runner.run(config)

    expect(report.totalPages).toBe(3)
    expect(report.totalRecords).toBe(20)
    expect(report.stoppedReason).toBe('empty_page')
    expect(executedOffsets).toEqual([0, 10, 20])
  })

  it('runs cursor-based progression passing extracted cursor to next call', async () => {
    const executedCursors: string[] = []

    const executor: PaginationRequestExecutor = async ({ queryParams }) => {
      const cur = queryParams['cursor'] || ''
      executedCursors.push(cur)

      if (!cur) {
        return {
          status: 200,
          responseBody: JSON.stringify({
            records: [{ id: 1 }, { id: 2 }],
            next_cursor: 'cur_page_2',
          }),
        }
      } else if (cur === 'cur_page_2') {
        return {
          status: 200,
          responseBody: JSON.stringify({
            records: [{ id: 3 }, { id: 4 }],
            next_cursor: null, // end of cursor
          }),
        }
      }

      return { status: 200, responseBody: JSON.stringify({ records: [] }) }
    }

    const runner = new PaginationRunner(executor, instantDelay)
    const config: PaginationConfig = {
      endpointId: 'get /feed',
      strategy: 'cursor',
      cursorParam: 'cursor',
      pageSize: 2,
      maxPages: 10,
      delayMs: 0,
    }

    const report = await runner.run(config)

    expect(report.totalPages).toBe(2)
    expect(report.totalRecords).toBe(4)
    expect(report.stoppedReason).toBe('cursor_null')
    expect(executedCursors).toEqual(['', 'cur_page_2'])
  })

  it('stops when AbortSignal is triggered', async () => {
    const controller = new AbortController()

    let callCount = 0
    const executor: PaginationRequestExecutor = async () => {
      callCount++
      if (callCount === 2) {
        controller.abort()
      }
      return {
        status: 200,
        responseBody: JSON.stringify({ data: [{ id: callCount }] }),
      }
    }

    const runner = new PaginationRunner(executor, instantDelay)
    const config: PaginationConfig = {
      endpointId: 'get /stream',
      strategy: 'page',
      pageParam: 'page',
      pageSize: 1,
      maxPages: 10,
      delayMs: 0,
    }

    const report = await runner.run(config, { signal: controller.signal })
    expect(report.stoppedReason).toBe('cancelled')
    expect(report.totalPages).toBe(2)
  })

  it('stops and reports cycle when identical page response repeats', async () => {
    const executor: PaginationRequestExecutor = async () => {
      return {
        status: 200,
        responseBody: JSON.stringify({ data: [{ id: 'stuck_id' }] }),
      }
    }

    const runner = new PaginationRunner(executor, instantDelay)
    const config: PaginationConfig = {
      endpointId: 'get /infinite-bug',
      strategy: 'page',
      pageParam: 'page',
      pageSize: 1,
      maxPages: 10,
      delayMs: 0,
    }

    const report = await runner.run(config)
    expect(report.stoppedReason).toBe('cycle_detected')
    expect(report.totalPages).toBe(2)
  })
})
