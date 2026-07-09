import type { StorageEnvelope } from '@/types'
import { SCHEMA_VERSION } from '@/constants'

/**
 * Every stored object is wrapped in a versioned envelope (planning/08 §3) so
 * per-object migration and debugging stay tractable.
 */
export function wrap<T>(
  data: T,
  appVersion: string,
  now: number,
  previous?: StorageEnvelope<unknown>,
): StorageEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    createdVersion: previous?.createdVersion ?? appVersion,
    updatedVersion: appVersion,
    updatedAt: now,
    data,
  }
}

/** Structural guard — distinguishes a valid envelope from corrupt/foreign data. */
export function isEnvelope(value: unknown): value is StorageEnvelope<unknown> {
  if (typeof value !== 'object' || value === null) return false
  const o = value as Record<string, unknown>
  return typeof o.schemaVersion === 'number' && typeof o.updatedAt === 'number' && 'data' in o
}
