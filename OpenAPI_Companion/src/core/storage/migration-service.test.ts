import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MigrationService } from './migration-service'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import { SCHEMA_VERSION_KEY } from './keys'
import type { AsyncStorageArea } from './types'

describe('MigrationService', () => {
  let area: AsyncStorageArea

  beforeEach(() => {
    area = createFakeArea()
  })

  it('on a fresh install: sets the marker and runs no migrations', async () => {
    const migrate = vi.fn(async () => {})
    const svc = new MigrationService({ area, targetVersion: 1 }).register({
      from: 0,
      to: 1,
      migrate,
    })

    const result = await svc.migrateIfNeeded()

    expect(result).toEqual({ ok: true, value: { from: 1, to: 1 } })
    expect(migrate).not.toHaveBeenCalled()
    const marker = await area.get(SCHEMA_VERSION_KEY)
    expect(marker[SCHEMA_VERSION_KEY]).toBe(1)
  })

  it('is a no-op when already at the target version', async () => {
    area = createFakeArea({
      [SCHEMA_VERSION_KEY]: 1,
      'projects/p1/x': { schemaVersion: 1, updatedAt: 0, data: { v: 'ok' } },
    })
    const migrate = vi.fn(async () => {})
    const svc = new MigrationService({ area, targetVersion: 1 }).register({
      from: 0,
      to: 1,
      migrate,
    })

    const result = await svc.migrateIfNeeded()

    expect(result).toEqual({ ok: true, value: { from: 1, to: 1 } })
    expect(migrate).not.toHaveBeenCalled()
  })

  it('migrates v0 → v1, bumps the marker, and emits STORAGE_MIGRATED', async () => {
    area = createFakeArea({ 'projects/p1/x': { v: 'old' } }) // no marker → detected as v0
    const bus = new EventBus()
    const migrated = vi.fn()
    bus.subscribe('STORAGE_MIGRATED', migrated)

    const svc = new MigrationService({ area, bus, targetVersion: 1 }).register({
      from: 0,
      to: 1,
      migrate: async (store) => {
        await store.set({ 'projects/p1/x': { v: 'new' } })
      },
    })

    const result = await svc.migrateIfNeeded()

    expect(result).toEqual({ ok: true, value: { from: 0, to: 1 } })
    const after = await area.get('projects/p1/x')
    expect(after['projects/p1/x']).toEqual({ v: 'new' })
    const marker = await area.get(SCHEMA_VERSION_KEY)
    expect(marker[SCHEMA_VERSION_KEY]).toBe(1)
    expect(migrated).toHaveBeenCalledWith({ from: 0, to: 1 })
  })

  it('applies a multi-step chain v0 → v1 → v2', async () => {
    area = createFakeArea({ 'projects/p1/x': { n: 0 } })
    const svc = new MigrationService({ area, targetVersion: 2 })
      .register({
        from: 0,
        to: 1,
        migrate: async (s) => void (await s.set({ 'projects/p1/x': { n: 1 } })),
      })
      .register({
        from: 1,
        to: 2,
        migrate: async (s) => void (await s.set({ 'projects/p1/x': { n: 2 } })),
      })

    const result = await svc.migrateIfNeeded()

    expect(result).toEqual({ ok: true, value: { from: 0, to: 2 } })
    const after = await area.get('projects/p1/x')
    expect(after['projects/p1/x']).toEqual({ n: 2 })
  })

  it('rolls back the whole store when a migration throws', async () => {
    area = createFakeArea({ 'projects/p1/x': { v: 'old' } })
    const bus = new EventBus()
    const migrated = vi.fn()
    bus.subscribe('STORAGE_MIGRATED', migrated)

    const svc = new MigrationService({ area, bus, targetVersion: 1 }).register({
      from: 0,
      to: 1,
      migrate: async (store) => {
        await store.set({ 'projects/p1/x': { v: 'half-written' } })
        throw new Error('boom')
      },
    })

    const result = await svc.migrateIfNeeded()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MIGRATION_FAILED')

    // store restored to its pre-migration state
    const after = await area.get('projects/p1/x')
    expect(after['projects/p1/x']).toEqual({ v: 'old' })
    // marker not advanced, backup cleaned up, no success event
    const all = await area.get(null)
    expect(all[SCHEMA_VERSION_KEY]).toBeUndefined()
    expect(Object.keys(all).some((k) => k.startsWith('backups/'))).toBe(false)
    expect(migrated).not.toHaveBeenCalled()
  })

  it('refuses to downgrade a store whose schema is newer than the build', async () => {
    area = createFakeArea({ [SCHEMA_VERSION_KEY]: 2, 'projects/p1/x': { v: 'future' } })
    const svc = new MigrationService({ area, targetVersion: 1 })

    const result = await svc.migrateIfNeeded()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('SCHEMA_TOO_NEW')
  })

  it('fails safely when no migration path exists', async () => {
    area = createFakeArea({ 'projects/p1/x': { v: 'old' } }) // v0, target 1, no migration registered
    const svc = new MigrationService({ area, targetVersion: 1 })

    const result = await svc.migrateIfNeeded()

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('MIGRATION_FAILED')
    // original data intact
    const after = await area.get('projects/p1/x')
    expect(after['projects/p1/x']).toEqual({ v: 'old' })
  })
})
