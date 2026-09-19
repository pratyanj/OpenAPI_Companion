import { describe, it, expect, vi } from 'vitest'
import {
  escapeCsvField,
  isCsvExportable,
  extractTabularData,
  jsonToCsv,
  sanitizeExportFilename,
  triggerDownload,
} from './export-utils'

describe('escapeCsvField', () => {
  it('handles null and undefined', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('leaves simple strings untouched', () => {
    expect(escapeCsvField('hello_world')).toBe('hello_world')
    expect(escapeCsvField(123)).toBe('123')
    expect(escapeCsvField(true)).toBe('true')
  })

  it('escapes fields with commas, quotes, and newlines', () => {
    expect(escapeCsvField('Smith, John')).toBe('"Smith, John"')
    expect(escapeCsvField('He said "Hello"')).toBe('"He said ""Hello"""')
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"')
  })

  it('serializes objects as JSON and escapes them if needed', () => {
    const res = escapeCsvField({ key: 'val' })
    expect(res).toBe('"{""key"":""val""}"')
  })
})

describe('isCsvExportable', () => {
  it('returns false for primitives and null', () => {
    expect(isCsvExportable(null)).toBe(false)
    expect(isCsvExportable(undefined)).toBe(false)
    expect(isCsvExportable('string')).toBe(false)
    expect(isCsvExportable(123)).toBe(false)
  })

  it('returns false for empty arrays', () => {
    expect(isCsvExportable([])).toBe(false)
  })

  it('returns true for non-empty arrays and objects', () => {
    expect(isCsvExportable([1, 2, 3])).toBe(true)
    expect(isCsvExportable([{ id: 1 }])).toBe(true)
    expect(isCsvExportable({ key: 'value' })).toBe(true)
  })
})

describe('extractTabularData', () => {
  it('returns arrays directly', () => {
    const arr = [{ a: 1 }, { a: 2 }]
    expect(extractTabularData(arr)).toEqual({ rows: arr })
  })

  it('extracts nested array from items, data, or results property', () => {
    const items = [{ id: 1 }, { id: 2 }]
    expect(extractTabularData({ total: 2, items })).toEqual({
      rows: items,
      extractedFromKey: 'items',
    })
    expect(extractTabularData({ count: 2, data: items })).toEqual({
      rows: items,
      extractedFromKey: 'data',
    })
    expect(extractTabularData({ results: items })).toEqual({
      rows: items,
      extractedFromKey: 'results',
    })
  })

  it('wraps flat object in an array', () => {
    const obj = { id: 1, name: 'Root' }
    expect(extractTabularData(obj)).toEqual({ rows: [obj] })
  })
})

describe('jsonToCsv', () => {
  it('converts array of objects into RFC 4180 CSV with BOM', () => {
    const data = [
      { id: 1, name: 'Alice', role: 'admin' },
      { id: 2, name: 'Bob', role: 'user', extra: 'yes' },
    ]
    const { csv, error } = jsonToCsv(data)
    expect(error).toBeUndefined()
    expect(csv).toBeDefined()
    expect(csv!.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('id,name,role,extra')
    expect(csv).toContain('1,Alice,admin,')
    expect(csv).toContain('2,Bob,user,yes')
  })

  it('converts array of primitives', () => {
    const data = ['alpha', 'beta, with comma', 'gamma']
    const { csv } = jsonToCsv(data)
    expect(csv).toContain('\uFEFFvalue')
    expect(csv).toContain('alpha')
    expect(csv).toContain('"beta, with comma"')
    expect(csv).toContain('gamma')
  })

  it('returns error for empty or non-tabular data', () => {
    expect(jsonToCsv(null).error).toBeDefined()
    expect(jsonToCsv([]).error).toBeDefined()
  })
})

describe('sanitizeExportFilename', () => {
  const testDate = new Date('2026-09-17T12:00:00Z')

  it('sanitizes method and path into clean filename', () => {
    expect(sanitizeExportFilename('GET', '/tasks', 'json', testDate)).toBe(
      'get_tasks_2026-09-17.json',
    )
    expect(sanitizeExportFilename('POST', '/auth/token', 'csv', testDate)).toBe(
      'post_auth_token_2026-09-17.csv',
    )
  })

  it('removes origin, path variable brackets, and query parameters', () => {
    expect(
      sanitizeExportFilename(
        'GET',
        'http://127.0.0.1:8008/api/tasks/{task_id}/items?limit=10',
        'csv',
        testDate,
      ),
    ).toBe('get_api_tasks_task_id_items_2026-09-17.csv')
  })

  it('provides fallbacks when method or path is empty', () => {
    expect(sanitizeExportFilename('', '', 'json', testDate)).toBe('response_2026-09-17.json')
  })
})

describe('triggerDownload', () => {
  it('creates an object URL, clicks a temporary anchor tag, and cleans up', () => {
    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    global.URL.createObjectURL = createObjectURLMock
    global.URL.revokeObjectURL = revokeObjectURLMock

    const appendChildSpy = vi.spyOn(document.body, 'appendChild')
    const clickMock = vi.fn()

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = originalCreateElement(tagName)
      if (tagName === 'a') {
        el.click = clickMock
      }
      return el
    })

    triggerDownload('test.json', '{"ok":true}', 'application/json', document)

    expect(createObjectURLMock).toHaveBeenCalledTimes(1)
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(appendChildSpy).toHaveBeenCalled()
  })
})
