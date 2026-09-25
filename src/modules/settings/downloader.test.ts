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

    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })

  it('universalDownloader falls back to anchor download when chrome.downloads is unavailable', () => {
    // In jsdom test env, mock createObjectURL/revokeObjectURL
    const origCreateObjectURL = URL.createObjectURL
    const origRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:mock-url')
    URL.revokeObjectURL = vi.fn()

    const createElementSpy = vi.spyOn(document, 'createElement')
    universalDownloader('test.json', '{"test":true}', 'application/json')
    expect(createElementSpy).toHaveBeenCalledWith('a')

    createElementSpy.mockRestore()
    URL.createObjectURL = origCreateObjectURL
    URL.revokeObjectURL = origRevokeObjectURL
  })
})
