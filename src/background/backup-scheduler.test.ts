import { describe, it, expect, vi } from 'vitest'
import {
  BACKUP_ALARM_NAME,
  frequencyToMinutes,
  syncBackupAlarm,
  runScheduledBackup,
  isScheduledBackupSupported,
} from './backup-scheduler'
import { StorageService } from '@/core/storage'
import { SettingsService } from '@/modules/settings/settings-service'
import { ImportExportService } from '@/modules/settings/import-export-service'
import { createFakeArea } from '@/tests/fake-storage'
import {
  DEFAULT_PREFERENCES,
  DEFAULT_BACKUP_FOLDER,
  type Preferences,
} from '@/modules/settings/types'

describe('backup-scheduler', () => {
  it('converts backup frequency to minutes accurately', () => {
    expect(frequencyToMinutes('30m')).toBe(30)
    expect(frequencyToMinutes('2h')).toBe(120)
    expect(frequencyToMinutes('6h')).toBe(360)
    expect(frequencyToMinutes('12h')).toBe(720)
    expect(frequencyToMinutes('24h')).toBe(1440)
    expect(frequencyToMinutes('custom', 45)).toBe(45)
    expect(frequencyToMinutes('custom', 0)).toBe(1) // minimum 1 minute
    expect(frequencyToMinutes('off')).toBe(0)
  })

  it('syncBackupAlarm registers chrome.alarms when auto-backup is enabled', async () => {
    const clearMock = vi.fn(async () => true)
    const createMock = vi.fn()
    const alarmsMock = {
      clear: clearMock,
      create: createMock,
    } as unknown as typeof chrome.alarms

    const prefs: Preferences = {
      ...DEFAULT_PREFERENCES,
      autoBackup: true,
      autoBackupFrequency: '2h',
    }

    await syncBackupAlarm(prefs, alarmsMock)
    expect(createMock).toHaveBeenCalledWith(BACKUP_ALARM_NAME, {
      periodInMinutes: 120,
      delayInMinutes: 120,
    })
  })

  it('syncBackupAlarm clears alarms when auto-backup is disabled', async () => {
    const clearMock = vi.fn(async () => true)
    const createMock = vi.fn()
    const alarmsMock = {
      clear: clearMock,
      create: createMock,
    } as unknown as typeof chrome.alarms

    const prefs: Preferences = {
      ...DEFAULT_PREFERENCES,
      autoBackup: false,
    }

    await syncBackupAlarm(prefs, alarmsMock)
    expect(clearMock).toHaveBeenCalledWith(BACKUP_ALARM_NAME)
    expect(createMock).not.toHaveBeenCalled()
  })

  it('runScheduledBackup skips export when no changes occurred and autoBackupSkipUnchanged is true', async () => {
    const area = createFakeArea()
    const storage = new StorageService({ area, now: () => 100 })
    const settings = new SettingsService({ storage })
    const io = new ImportExportService({ storage, now: () => 100 })

    await settings.setPreference('autoBackup', true)
    await settings.setPreference('autoBackupFrequency', '24h')
    await settings.setPreference('autoBackupSkipUnchanged', true)
    await settings.setPreference('lastBackupAt', 200)

    const backupSpy = vi.spyOn(io, 'backup')

    const res = await runScheduledBackup({ storage, settings, io })
    expect(res.executed).toBe(false)
    expect(res.reason).toContain('Skipped')
    expect(backupSpy).not.toHaveBeenCalled()
  })

  it('runScheduledBackup executes export and records status when data has changed', async () => {
    const area = createFakeArea()
    const storage = new StorageService({ area, now: () => 250 })
    const settings = new SettingsService({ storage })
    const downloadMock = vi.fn()
    const io = new ImportExportService({ storage, now: () => 250, download: downloadMock })

    await settings.setPreference('autoBackup', true)
    await settings.setPreference('autoBackupFrequency', '24h')
    await settings.setPreference('autoBackupSkipUnchanged', true)
    await settings.setPreference('lastBackupAt', 100)

    // Write a change at t=250
    await storage.set('projects/p1/requests/template/t1', { name: 'Preset' }, { immediate: true })

    const res = await runScheduledBackup({ storage, settings, io })
    expect(res.executed).toBe(true)
    expect(res.filename).toBeDefined()
    expect(downloadMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'application/json',
      expect.objectContaining({
        subfolder: DEFAULT_BACKUP_FOLDER,
        saveAs: false,
        silent: true,
      }),
    )

    const updatedPrefs = await settings.getPreferences()
    expect(updatedPrefs.lastBackupAt).toBeGreaterThan(0)
    expect(updatedPrefs.lastBackupStatus).toContain('Saved')
  })

  it('chrome.downloads.onDeterminingFilename suggests filename and uniquify when byExtensionId matches', () => {
    let capturedListener:
      | ((
          item: { byExtensionId?: string; filename?: string },
          suggest: (opts?: { filename: string; conflictAction: string }) => void,
        ) => void)
      | undefined
    const mockAddListener = vi.fn((fn) => {
      capturedListener = fn
    })

    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { id: 'test-ext-id' },
      downloads: {
        onDeterminingFilename: {
          addListener: mockAddListener,
        },
      },
    }

    if (chrome.downloads?.onDeterminingFilename) {
      chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
        if (item.byExtensionId === chrome.runtime.id && item.filename) {
          suggest({
            filename: item.filename,
            conflictAction: 'uniquify',
          })
          return
        }
        suggest()
      })
    }

    expect(mockAddListener).toHaveBeenCalled()

    const suggestMock = vi.fn()
    capturedListener?.(
      {
        byExtensionId: 'test-ext-id',
        filename: 'MyBackups/openapi-companion-backup.json',
      },
      suggestMock,
    )

    expect(suggestMock).toHaveBeenCalledWith({
      filename: 'MyBackups/openapi-companion-backup.json',
      conflictAction: 'uniquify',
    })

    const otherSuggestMock = vi.fn()
    capturedListener?.(
      {
        byExtensionId: 'other-ext',
        filename: 'other.pdf',
      },
      otherSuggestMock,
    )
    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })

  it('isScheduledBackupSupported returns true for Firefox and false for Chrome with sidePanel', () => {
    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    const origUserAgent = navigator.userAgent

    // Firefox
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
      configurable: true,
    })
    expect(isScheduledBackupSupported()).toBe(true)

    // Chrome
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      sidePanel: {},
    }
    expect(isScheduledBackupSupported()).toBe(false)

    Object.defineProperty(navigator, 'userAgent', {
      value: origUserAgent,
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })

  it('syncBackupAlarm clears alarms and does not register in Chrome', async () => {
    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    const origUserAgent = navigator.userAgent

    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      sidePanel: {},
    }

    const clearMock = vi.fn(async () => true)
    const createMock = vi.fn()
    const alarmsMock = {
      clear: clearMock,
      create: createMock,
    } as unknown as typeof chrome.alarms

    const prefs: Preferences = {
      ...DEFAULT_PREFERENCES,
      autoBackup: true,
      autoBackupFrequency: '2h',
    }

    await syncBackupAlarm(prefs, alarmsMock)
    expect(clearMock).toHaveBeenCalledWith(BACKUP_ALARM_NAME)
    expect(createMock).not.toHaveBeenCalled()

    Object.defineProperty(navigator, 'userAgent', {
      value: origUserAgent,
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })

  it('runScheduledBackup returns reason and aborts in Chrome', async () => {
    const origChrome = (globalThis as unknown as { chrome: unknown }).chrome
    const origUserAgent = navigator.userAgent

    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = {
      sidePanel: {},
    }

    const res = await runScheduledBackup()
    expect(res.executed).toBe(false)
    expect(res.reason).toContain('only supported in Firefox')

    Object.defineProperty(navigator, 'userAgent', {
      value: origUserAgent,
      configurable: true,
    })
    ;(globalThis as unknown as { chrome: unknown }).chrome = origChrome
  })
})
