export interface PendingUpdate {
  version: string
  at: number
}

export type UpdateCheckStatus = 'update_available' | 'no_update' | 'throttled' | 'unsupported'

export interface UpdateCheckResult {
  status: UpdateCheckStatus
  version?: string
  message?: string
}

export const UPDATE_AVAILABLE_KEY = 'oac_update_available'

/**
 * Checks whether an update has been downloaded by Chrome and is waiting to be applied.
 */
export async function getPendingUpdate(): Promise<PendingUpdate | null> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const res = await chrome.storage.local.get(UPDATE_AVAILABLE_KEY)
      const data = res[UPDATE_AVAILABLE_KEY]
      if (data && typeof data === 'object' && typeof data.version === 'string') {
        return data as PendingUpdate
      }
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Records that a new version has been downloaded and is available for reload.
 */
export async function setPendingUpdate(version: string): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        [UPDATE_AVAILABLE_KEY]: {
          version,
          at: Date.now(),
        },
      })
    }
  } catch {
    // ignore
  }
}

/**
 * Clears the pending update notification flag.
 */
export async function clearPendingUpdate(): Promise<void> {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(UPDATE_AVAILABLE_KEY)
    }
  } catch {
    // ignore
  }
}

/**
 * Requests an immediate update check from the Chrome Web Store / browser extension engine.
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.requestUpdateCheck) {
      return {
        status: 'unsupported',
        message: 'Update checks are only supported in Chrome/Edge browsers.',
      }
    }

    return await new Promise<UpdateCheckResult>((resolve) => {
      chrome.runtime.requestUpdateCheck((status, details) => {
        if (chrome.runtime.lastError) {
          resolve({
            status: 'unsupported',
            message:
              'Running unpacked extension. Click the circular reload button (⟳) in chrome://extensions to update.',
          })
          return
        }

        if (status === 'update_available' && details?.version) {
          void setPendingUpdate(details.version)
          resolve({
            status: 'update_available',
            version: details.version,
          })
        } else if (status === 'throttled') {
          resolve({
            status: 'throttled',
            message: 'Checked recently. Please wait a few minutes before checking again.',
          })
        } else {
          resolve({ status: 'no_update' })
        }
      })
    })
  } catch (err) {
    return {
      status: 'unsupported',
      message: err instanceof Error ? err.message : 'Failed to check for updates.',
    }
  }
}

/**
 * Safely applies the downloaded update by reloading the extension.
 * Crucially, chrome.runtime.reload() retains 100% of chrome.storage.local data.
 */
export async function applyUpdateAndReload(): Promise<void> {
  await clearPendingUpdate()
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.reload) {
      chrome.runtime.reload()
    }
  } catch {
    // ignore
  }
}
