import { describe, it, expect, vi } from 'vitest'
import {
  formatBackupDate,
  slugify,
  formatBackupFilename,
  universalDownloader,
  sanitizeSubfolder,
} from './downloader'

describe('downloader utilities', () => {
  it('formats dates as YYYY-MM-DD-HHmm', () => {
    // 2026-09-20 15:30 UTC = fixed timestamp
    const date = new Date(2026, 8, 20, 15, 30) // month is 0-indexed: 8 = Sept
    const formatted = formatBackupDate(date.getTime())
    expect(formatted).toBe('2026-09-20-1530')
  })

  it('slugifies project names for filesystem compatibility', () => {
    expect(slugify('My Swagger API!')).toBe('my-swagger-api')
    expect(slugify('  Petstore / V2  ')).toBe('petstore-v2')
    expect(slugify('---')).toBe('project')
  })

  it('generates filename for workspace backups', () => {
    const ts = new Date(2026, 8, 20, 14, 5).getTime()
    const name = formatBackupFilename('all', undefined, ts)
    expect(name).toBe('openapi-companion-backup-2026-09-20-1405.json')
  })

  it('generates filename for project backups', () => {
    const ts = new Date(2026, 8, 20, 14, 5).getTime()
    const name = formatBackupFilename('current', 'TaskUp API', ts)
    expect(name).toBe('openapi-companion-taskup-api-backup-2026-09-20-1405.json')
  })

  it('sanitizes subfolder paths safely', () => {
    expect(sanitizeSubfolder('  OpenAPI-Companion-Backups  ')).toBe('OpenAPI-Companion-Backups')
    expect(sanitizeSubfolder('My\\Backups\\2026')).toBe('My/Backups/2026')
    expect(sanitizeSubfolder('/root/sub/')).toBe('root/sub')
    expect(sanitizeSubfolder('../../../traversal')).toBe('/traversal'.replace(/^\/+/, ''))
    expect(sanitizeSubfolder('bad:name*with?"chars<bar>|')).toBe('badnamewithcharsbar')
    expect(sanitizeSubfolder('')).toBe('')
    expect(sanitizeSubfolder(undefined)).toBe('')
  })

  it('universalDownloader calls chrome.downloads.download with subfolder and saveAs: false', () => {
    const mockDownload = vi.fn()
    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      downloads: {
        download: mockDownload,
      },
    }

    universalDownloader('backup.json', '{"test":123}', 'application/json', {
      subfolder: 'MyBackups',
      saveAs: false,
    })

    expect(mockDownload).toHaveBeenCalledTimes(1)
    const callArgs = mockDownload.mock.calls[0]![0]
    expect(callArgs.filename).toBe('MyBackups/backup.json')
    expect(callArgs.saveAs).toBe(false)
    expect(callArgs.conflictAction).toBe('uniquify')
    // In Chrome, small JSON files use inline data: URI
    expect(callArgs.url).toContain('data:application/json;charset=utf-8,')

    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })

  it('universalDownloader uses Blob URL when running in Firefox', () => {
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:firefox-mock-url')
    URL.revokeObjectURL = vi.fn()

    const mockDownload = vi.fn()
    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      downloads: {
        download: mockDownload,
      },
    }

    const origUserAgent = navigator.userAgent
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      configurable: true,
    })

    universalDownloader('backup.json', '{"test":123}', 'application/json', {
      subfolder: 'FirefoxBackups',
      saveAs: false,
    })

    expect(mockDownload).toHaveBeenCalledTimes(1)
    const callArgs = mockDownload.mock.calls[0]![0]
    expect(callArgs.filename).toBe('FirefoxBackups/backup.json')
    expect(callArgs.url).toBe('blob:firefox-mock-url')

    Object.defineProperty(navigator, 'userAgent', {
      value: origUserAgent,
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
  })

  it('universalDownloader falls back to anchor download when chrome.downloads is unavailable', () => {
    // In jsdom test env, mock createObjectURL/revokeObjectURL
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    const createElementSpy = vi.spyOn(document, 'createElement')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    universalDownloader('test.json', '{"test":true}', 'application/json')
    expect(createElementSpy).toHaveBeenCalledWith('a')

    clickSpy.mockRestore()
    createElementSpy.mockRestore()
    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
  })

  it('universalDownloader calls chrome.downloads.erase when silent: true on completion', () => {
    let changeListener: ((delta: { id: number; state?: { current?: string } }) => void) | undefined
    const mockAddListener = vi.fn((cb) => {
      changeListener = cb
    })
    const mockRemoveListener = vi.fn()
    const mockErase = vi.fn()
    const mockDownload = vi.fn((_opts, cb) => {
      cb(42) // returns downloadId = 42
    })

    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { lastError: undefined },
      downloads: {
        download: mockDownload,
        erase: mockErase,
        onChanged: {
          addListener: mockAddListener,
          removeListener: mockRemoveListener,
        },
      },
    }

    universalDownloader('backup.json', '{"test":123}', 'application/json', {
      subfolder: 'MyBackups',
      saveAs: false,
      silent: true,
    })

    expect(mockDownload).toHaveBeenCalledTimes(1)
    expect(mockAddListener).toHaveBeenCalled()

    // Trigger complete state change
    changeListener?.({ id: 42, state: { current: 'complete' } })

    expect(mockRemoveListener).toHaveBeenCalled()
    expect(mockErase).toHaveBeenCalledWith({ id: 42 }, expect.any(Function))

    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })
})
