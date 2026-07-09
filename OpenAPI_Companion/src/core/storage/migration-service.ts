import { ok, err, type Result, type AppError } from '@/types'
import { SCHEMA_VERSION, STORAGE_ROOTS } from '@/constants'
import type { EventBus } from '@/core/events'
import type { AsyncStorageArea, Migration, MigrationServiceOptions, RawStore } from './types'
import { SCHEMA_VERSION_KEY, backupKey } from './keys'

const errors = {
  failed: (cause?: unknown): AppError => ({
    code: 'MIGRATION_FAILED',
    message: 'Storage migration failed and was rolled back',
    recoverable: true,
    cause,
  }),
  tooNew: (current: number, target: number): AppError => ({
    code: 'SCHEMA_TOO_NEW',
    message: `Stored schema v${current} is newer than this build (v${target}); refusing to downgrade`,
    recoverable: false,
  }),
  noPath: (from: number, target: number): AppError => ({
    code: 'MIGRATION_NO_PATH',
    message: `No migration path from v${from} to v${target}`,
    recoverable: false,
  }),
}

/**
 * Runs ordered storage migrations on extension update (planning/08 §7).
 *
 * Safety contract: snapshot everything BEFORE migrating, and roll back the
 * entire store on any failure — a migration must never leave data partially
 * transformed (EC-022, EC-042). A stored schema newer than this build is
 * refused rather than downgraded (EC-034).
 */
export class MigrationService {
  private readonly area: AsyncStorageArea
  private readonly bus: EventBus | undefined
  private readonly targetVersion: number
  private readonly migrations: Migration[] = []

  constructor(options: MigrationServiceOptions) {
    this.area = options.area
    this.bus = options.bus
    this.targetVersion = options.targetVersion ?? SCHEMA_VERSION
  }

  register(migration: Migration): this {
    this.migrations.push(migration)
    this.migrations.sort((a, b) => a.from - b.from)
    return this
  }

  async migrateIfNeeded(): Promise<Result<{ from: number; to: number }>> {
    let all: Record<string, unknown>
    try {
      all = await this.area.get(null)
    } catch (cause) {
      return err(errors.failed(cause))
    }

    const current = this.detectVersion(all)

    // Up to date (or fresh install) — just ensure the marker is present.
    if (current === this.targetVersion) {
      try {
        if (all[SCHEMA_VERSION_KEY] !== this.targetVersion) {
          await this.area.set({ [SCHEMA_VERSION_KEY]: this.targetVersion })
        }
      } catch (cause) {
        return err(errors.failed(cause))
      }
      return ok({ from: current, to: this.targetVersion })
    }

    if (current > this.targetVersion) {
      return err(errors.tooNew(current, this.targetVersion))
    }

    // Snapshot BEFORE any change (deep clone so later mutations can't corrupt it).
    const snapshot = structuredClone(all)
    try {
      await this.area.set({ [backupKey('pre-migration')]: snapshot })
    } catch (cause) {
      return err(errors.failed(cause))
    }

    try {
      const store = this.rawStore()
      let version = current
      while (version < this.targetVersion) {
        const step = this.migrations.find((m) => m.from === version)
        if (!step) throw new Error(errors.noPath(version, this.targetVersion).message)
        await step.migrate(store)
        version = step.to
      }
      await this.area.set({ [SCHEMA_VERSION_KEY]: this.targetVersion })
      this.bus?.publish('STORAGE_MIGRATED', { from: current, to: this.targetVersion })
      return ok({ from: current, to: this.targetVersion })
    } catch (cause) {
      await this.rollback(snapshot)
      return err(errors.failed(cause))
    }
  }

  async snapshot(): Promise<Result<Record<string, unknown>>> {
    try {
      return ok(structuredClone(await this.area.get(null)))
    } catch (cause) {
      return err(errors.failed(cause))
    }
  }

  async rollback(snapshot: Record<string, unknown>): Promise<Result<void>> {
    try {
      await this.area.clear()
      await this.area.set(snapshot)
      return ok(undefined)
    } catch (cause) {
      return err(errors.failed(cause))
    }
  }

  /**
   * Determine the stored schema version. A raw number marker wins; otherwise a
   * store that already holds project/settings data predates versioning (v0); a
   * truly empty store is a fresh install (already at target).
   */
  private detectVersion(all: Record<string, unknown>): number {
    const marker = all[SCHEMA_VERSION_KEY]
    if (typeof marker === 'number') return marker
    const hasData = Object.keys(all).some(
      (k) =>
        k.startsWith(`${STORAGE_ROOTS.projects}/`) || k.startsWith(`${STORAGE_ROOTS.settings}/`),
    )
    return hasData ? 0 : this.targetVersion
  }

  private rawStore(): RawStore {
    const area = this.area
    return {
      getAll: () => area.get(null),
      get: async (key) => (await area.get(key))[key],
      set: (items) => area.set(items),
      remove: (keys) => area.remove(keys),
    }
  }
}
