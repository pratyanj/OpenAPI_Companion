import type { AsyncStorageArea } from './types'

/**
 * Adapts `chrome.storage.local` to the AsyncStorageArea interface. MV3 exposes
 * promise-returning storage methods when called without a callback. This is the
 * only place that touches `chrome.storage` directly — everything else goes
 * through StorageService (planning/07 dependency rule).
 */
export function chromeLocalArea(): AsyncStorageArea {
  const area = chrome.storage.local
  return {
    get: (keys) => area.get(keys ?? null),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
    clear: () => area.clear(),
    getBytesInUse: (keys) => area.getBytesInUse(keys ?? null),
  }
}
