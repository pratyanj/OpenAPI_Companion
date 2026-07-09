import type { AsyncStorageArea } from '@/core/storage'

/**
 * In-memory AsyncStorageArea for unit tests — mirrors chrome.storage.local
 * semantics (returns copies, computes byte size from JSON). Spy on its methods
 * with `vi.spyOn(area, 'set')` to assert batching.
 */
export function createFakeArea(initial?: Record<string, unknown>): AsyncStorageArea {
  let store: Record<string, unknown> = structuredClone(initial ?? {})

  const sizeOf = (obj: Record<string, unknown>): number =>
    new TextEncoder().encode(JSON.stringify(obj)).length

  return {
    async get(keys) {
      if (keys == null) return structuredClone(store)
      const list = Array.isArray(keys) ? keys : [keys]
      const out: Record<string, unknown> = {}
      for (const k of list) if (k in store) out[k] = structuredClone(store[k])
      return out
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) store[k] = structuredClone(v)
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys]
      for (const k of list) delete store[k]
    },
    async clear() {
      store = {}
    },
    async getBytesInUse(keys) {
      if (keys == null) return sizeOf(store)
      const list = Array.isArray(keys) ? keys : [keys]
      const subset: Record<string, unknown> = {}
      for (const k of list) if (k in store) subset[k] = store[k]
      return sizeOf(subset)
    },
  }
}
