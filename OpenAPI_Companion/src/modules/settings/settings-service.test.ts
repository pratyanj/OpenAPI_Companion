import { describe, it, expect, vi } from 'vitest'
import { StorageService, projectKey, settingsKey } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import { SettingsService } from './settings-service'
import { DEFAULT_PREFERENCES } from './types'

function setup(bus = new EventBus()) {
  const storage = new StorageService({ area: createFakeArea(), now: () => 1 })
  const service = new SettingsService({ storage, bus })
  return { storage, service, bus }
}

describe('SettingsService preferences', () => {
  it('returns defaults when nothing is stored', async () => {
    const { service } = setup()
    expect(await service.getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })

  it('sets a preference, persists it, and emits SETTINGS_UPDATED', async () => {
    const bus = new EventBus()
    const updated = vi.fn()
    bus.subscribe('SETTINGS_UPDATED', updated)
    const { service, storage } = setup(bus)

    const r = await service.setPreference('autoBackup', true)
    expect(r.ok).toBe(true)
    expect((await service.getPreferences()).autoBackup).toBe(true)
    expect(updated).toHaveBeenCalledWith({ keys: ['autoBackup'] })

    // Persisted under settings/preferences.
    const stored = await storage.getData<{ autoBackup: boolean }>(settingsKey('preferences'))
    expect(stored.ok && stored.value?.autoBackup).toBe(true)
  })

  it('resets to defaults', async () => {
    const { service } = setup()
    await service.setPreference('autoBackup', true)
    await service.resetPreferences()
    expect(await service.getPreferences()).toEqual(DEFAULT_PREFERENCES)
  })
})

describe('SettingsService storage management', () => {
  async function seed(storage: StorageService) {
    await storage.set(projectKey('p1', 'auth', 'default'), { token: 'x' }, { immediate: true })
    await storage.set(projectKey('p1', 'history', 'index'), [1, 2, 3], { immediate: true })
    await storage.set(projectKey('p2', 'requests', 'draft'), { body: 'y' }, { immediate: true })
    await storage.set(settingsKey('theme'), 'dark', { immediate: true })
  }

  it('reports total + per-project usage', async () => {
    const { service, storage } = setup()
    await seed(storage)
    const metrics = await service.getStorageMetrics()
    expect(metrics.totalBytes).toBeGreaterThan(0)
    expect(metrics.projects.map((p) => p.projectId).sort()).toEqual(['p1', 'p2'])
  })

  it('clears a single project without touching others or settings', async () => {
    const { service, storage } = setup()
    await seed(storage)

    const cleared = await service.clearProject('p1')
    expect(cleared.ok && cleared.value).toBe(2)
    const p1After = await storage.list('projects/p1/')
    expect(p1After.ok && p1After.value).toEqual([])
    // p2 + settings survive.
    const p2 = await storage.list('projects/p2/')
    expect(p2.ok && p2.value.length).toBe(1)
    expect((await storage.getData(settingsKey('theme'))).ok).toBe(true)
  })

  it('clears everything and emits DATA_RESET', async () => {
    const bus = new EventBus()
    const reset = vi.fn()
    bus.subscribe('DATA_RESET', reset)
    const { service, storage } = setup(bus)
    await seed(storage)

    const r = await service.clearAll()
    expect(r.ok).toBe(true)
    const all = await storage.list('')
    expect(all.ok && all.value).toEqual([])
    expect(reset).toHaveBeenCalled()
  })
})
