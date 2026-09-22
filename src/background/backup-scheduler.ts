/**
 * Automated backup background scheduler for Manifest V3.
 * Manages chrome.alarms registration, delta change detection, and periodic backup exports.
 */
import { chromeLocalArea, StorageService } from '@/core/storage'
import { bus } from '@/core/events'
import { SettingsService } from '@/modules/settings/settings-service'
import { ImportExportService } from '@/modules/settings/import-export-service'
import {
  DEFAULT_BACKUP_FOLDER,
  type BackupFrequency,
  type Preferences,
} from '@/modules/settings/types'
import { universalDownloader } from '@/modules/settings/downloader'

export const BACKUP_ALARM_NAME = 'oac-auto-backup-alarm'

/** Convert backup frequency setting to alarm interval in minutes. */
export function frequencyToMinutes(frequency: BackupFrequency, customMinutes?: number): number {
  switch (frequency) {
    case '30m':
      return 30
    case '2h':
      return 120
    case '6h':
      return 360
    case '12h':
      return 720
    case '24h':
      return 1440
    case 'custom':
      return Math.max(1, Math.round(customMinutes ?? 60))
    case 'off':
    default:
      return 0
  }
}

/** Synchronize chrome.alarms with the user's current backup preferences. */
export async function syncBackupAlarm(
  prefs: Preferences,
  alarmsApi = typeof chrome !== 'undefined' ? chrome.alarms : undefined,
): Promise<void> {
  if (!alarmsApi) return

  if (!prefs.autoBackup || prefs.autoBackupFrequency === 'off') {
    await alarmsApi.clear(BACKUP_ALARM_NAME)
    return
  }

  const periodInMinutes = frequencyToMinutes(
    prefs.autoBackupFrequency,
    prefs.autoBackupCustomMinutes,
  )

  if (periodInMinutes <= 0) {
    await alarmsApi.clear(BACKUP_ALARM_NAME)
    return
  }

  // Register periodic alarm
  alarmsApi.create(BACKUP_ALARM_NAME, {
    periodInMinutes,
    delayInMinutes: periodInMinutes,
  })
}

export interface ScheduledBackupResult {
  executed: boolean
  reason?: string
  filename?: string
}

/**
 * Executes a scheduled backup tick:
 * 1. Checks if auto-backup is active.
 * 2. Runs delta detection: if no changes occurred since last backup and skipUnchanged is true, skips.
 * 3. Triggers export, universal download, and updates lastBackupAt and lastBackupStatus in settings.
 */
export async function runScheduledBackup(deps?: {
  storage?: StorageService
  settings?: SettingsService
  io?: ImportExportService
}): Promise<ScheduledBackupResult> {
  const storage = deps?.storage ?? new StorageService({ area: chromeLocalArea(), bus })
  const settings = deps?.settings ?? new SettingsService({ storage, bus })
  const io =
    deps?.io ??
    new ImportExportService({
      storage,
      bus,
      download: universalDownloader,
    })

  const prefs = await settings.getPreferences()
  if (!prefs.autoBackup || prefs.autoBackupFrequency === 'off') {
    return { executed: false, reason: 'Auto-backup is disabled' }
  }

  // Delta detection: check whether any data changed since lastBackupAt
  if (prefs.autoBackupSkipUnchanged && prefs.lastBackupAt && prefs.lastBackupAt > 0) {
    const hasChanges = await io.hasChangesSince(prefs.lastBackupAt)
    if (!hasChanges) {
      const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const status = `Skipped at ${nowTime} (no changes)`
      await settings.setPreference('lastBackupStatus', status)
      return { executed: false, reason: status }
    }
  }

  // Execute backup
  const res = await io.backup(
    true,
    undefined,
    undefined,
    undefined,
    prefs.backupFolder ?? DEFAULT_BACKUP_FOLDER,
  )
  if (res.ok) {
    const filename = res.value
    await settings.setPreference('lastBackupAt', Date.now())
    await settings.setPreference('lastBackupStatus', `Saved ${filename}`)
    return { executed: true, filename }
  } else {
    const errMsg = `Failed: ${res.error.message}`
    await settings.setPreference('lastBackupStatus', errMsg)
    return { executed: false, reason: errMsg }
  }
}
