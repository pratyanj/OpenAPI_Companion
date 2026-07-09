/**
 * Shared types. Kept minimal in Sprint 1 — feature/domain types live in each
 * module's `types.ts`. See planning/08_STORAGE_PLAN.md and 11_SERVICE_PLAN.md.
 */

/** Every stored object is wrapped in this envelope (planning/08 §3). */
export interface StorageEnvelope<T> {
  /** schema version of THIS object */
  schemaVersion: number
  /** extension semver at creation */
  createdVersion: string
  /** extension semver at last write */
  updatedVersion: string
  /** epoch ms of last write */
  updatedAt: number
  data: T
}

/** Structured error carried by Result (planning/11 §Result). */
export interface AppError {
  code: string
  message: string
  recoverable: boolean
  cause?: unknown
}

/** No thrown errors cross service boundaries — services return a Result. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: AppError }

export const ok = <T>(value: T): Result<T> => ({ ok: true, value })
export const err = (error: AppError): Result<never> => ({ ok: false, error })

/** Returned by subscribe()/observe() to detach a listener. */
export type Unsubscribe = () => void
