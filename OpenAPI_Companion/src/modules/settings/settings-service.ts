import { ok, type Result } from '@/types'
import { settingsKey, projectPrefix, type StorageService } from '@/core/storage'
import { STORAGE_ROOTS } from '@/constants'
import type { EventBus } from '@/core/events'
import { DEFAULT_PREFERENCES, type Preferences, type StorageMetrics } from './types'

export interface SettingsServiceOptions {
  storage: StorageService
  bus?: EventBus
}

const PREFS_KEY = settingsKey('preferences')

/** The surface SettingsPanel needs (eases testing). */
export interface SettingsApi {
  getPreferences(): Promise<Preferences>
  setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): Promise<Result<void>>
  resetPreferences(): Promise<Result<void>>
  getStorageMetrics(): Promise<StorageMetrics>
  clearProject(projectId: string): Promise<Result<number>>
  clearAll(): Promise<Result<void>>
}

/**
 * Global settings + storage management (FDD-010, EPIC-09). Preferences live at
 * `settings/preferences` (theme is owned by ThemeManager). Storage metrics and
 * the destructive clear operations run through StorageService, so they honor the
 * same envelope/quota rules. Preferences apply immediately (business rule).
 */
export class SettingsService implements SettingsApi {
  private readonly storage: StorageService
  private readonly bus: EventBus | undefined

  constructor(options: SettingsServiceOptions) {
    this.storage = options.storage
    this.bus = options.bus
  }

  async getPreferences(): Promise<Preferences> {
    const got = await this.storage.getData<Partial<Preferences>>(PREFS_KEY)
    // Merge over defaults so a partial/old record still yields every field.
    return { ...DEFAULT_PREFERENCES, ...(got.ok && got.value ? got.value : {}) }
  }

  async setPreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K],
  ): Promise<Result<void>> {
    const next = { ...(await this.getPreferences()), [key]: value }
    const written = await this.storage.set(PREFS_KEY, next, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('SETTINGS_UPDATED', { keys: [String(key)] })
    return ok(undefined)
  }

  async resetPreferences(): Promise<Result<void>> {
    const written = await this.storage.set(PREFS_KEY, DEFAULT_PREFERENCES, { immediate: true })
    if (!written.ok) return written
    this.bus?.publish('SETTINGS_UPDATED', { keys: Object.keys(DEFAULT_PREFERENCES) })
    return ok(undefined)
  }

  async getStorageMetrics(): Promise<StorageMetrics> {
    const total = await this.storage.getBytesInUse()
    const keys = await this.storage.list(`${STORAGE_ROOTS.projects}/`)
    const ids = new Set<string>()
    if (keys.ok)
      for (const k of keys.value) {
        const id = k.split('/')[1]
        if (id) ids.add(id)
      }
    const projects: StorageMetrics['projects'] = []
    for (const id of ids) {
      const bytes = await this.storage.getBytesInUse(projectPrefix(id))
      projects.push({ projectId: id, bytes: bytes.ok ? bytes.value : 0 })
    }
    projects.sort((a, b) => b.bytes - a.bytes)
    return { totalBytes: total.ok ? total.value : 0, projects }
  }

  /** Remove all keys for one project. Returns how many were removed. */
  async clearProject(projectId: string): Promise<Result<number>> {
    const keys = await this.storage.list(projectPrefix(projectId))
    if (!keys.ok) return keys
    for (const k of keys.value) {
      const removed = await this.storage.remove(k)
      if (!removed.ok) return removed
    }
    await this.storage.flush()
    return ok(keys.value.length)
  }

  /** Wipe every extension key (settings, projects, meta, …) and emit DATA_RESET. */
  async clearAll(): Promise<Result<void>> {
    const keys = await this.storage.list('')
    if (!keys.ok) return keys
    for (const k of keys.value) {
      const removed = await this.storage.remove(k)
      if (!removed.ok) return removed
    }
    const flushed = await this.storage.flush()
    if (!flushed.ok) return flushed
    this.bus?.publish('DATA_RESET', {})
    return ok(undefined)
  }
}
