import { describe, it, expect, vi } from 'vitest'
import {
  BACKUP_ALARM_NAME,
  frequencyToMinutes,
  syncBackupAlarm,
  runScheduledBackup,
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
      expect.objectContaining({ subfolder: DEFAULT_BACKUP_FOLDER, saveAs: false }),
    )

    const updatedPrefs = await settings.getPreferences()
    expect(updatedPrefs.lastBackupAt).toBeGreaterThan(0)
    expect(updatedPrefs.lastBackupStatus).toContain('Saved')
  })
})
