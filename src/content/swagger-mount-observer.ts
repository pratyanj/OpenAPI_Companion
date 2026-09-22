/**
 * Asynchronous Swagger UI mounting observer for SPAs and dynamically loaded Swagger UIs.
 * Provides fast-path detection and asynchronous waiting with timeout for Swagger UI mounts.
 */

/**
 * Checks if Swagger UI is present in the document.
 * Checks for common Swagger UI container selectors.
 */
export function isSwaggerPresent(doc: Document = document): boolean {
  if (!doc) return false

  // Common Swagger UI container selectors
  const selectors = [
    '#swagger-ui',
    '.swagger-ui',
    'meta[name="swagger-ui"]',
    '.swagger-container',
    '#swagger-ui-container',
    '.swagger-ui-wrap',
  ]

  return selectors.some((selector) => doc.querySelector(selector) !== null)
}

/**
 * Options for waiting for Swagger UI mount.
 */
export interface WaitForSwaggerMountOptions {
  /** Timeout in milliseconds (default: 3500) */
  timeoutMs?: number
  /** Document to observe (default: current document) */
  doc?: Document
}

/**
 * Waits for Swagger UI to mount in the DOM.
 * Resolves to true if Swagger UI is detected within timeout, false if timeout expires.
 *
 * @param options - Wait options
 * @returns Promise that resolves to true if Swagger UI detected, false on timeout
 */
export function waitForSwaggerMount(options: WaitForSwaggerMountOptions = {}): Promise<boolean> {
  const { timeoutMs = 3500, doc = document } = options

  // Fast path: if already present, resolve immediately
  if (isSwaggerPresent(doc)) {
    return Promise.resolve(true)
  }

  return new Promise<boolean>((resolve) => {
    let observer: MutationObserver | null = null
    let timeoutId: NodeJS.Timeout | null = null

    const cleanup = () => {
      if (observer) {
        observer.disconnect()
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }
    }

    const onMount = () => {
      cleanup()
      resolve(true)
    }

    const onTimeout = () => {
      cleanup()
      resolve(false)
    }

    // Set up timeout
    timeoutId = setTimeout(onTimeout, timeoutMs)

    // Set up MutationObserver to watch for DOM changes
    try {
      const target = doc.documentElement || doc.body
      if (target) {
        observer = new MutationObserver((mutations) => {
          for (const mutation of mutations) {
            if (mutation.type === 'childList') {
              // Check added nodes
              for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                  const element = node as HTMLElement
                  // Check if this element or its children match Swagger UI selectors
                  if (isSwaggerPresent(element.ownerDocument || doc)) {
                    onMount()
                    return
                  }
                }
              }
              // Also check if the mutation target itself contains Swagger UI
              if (isSwaggerPresent(doc)) {
                onMount()
                return
              }
            }
          }
        })

        observer.observe(target, {
          childList: true,
          subtree: true,
        })
      } else {
        // Fallback: just use timeout
        timeoutId = setTimeout(onTimeout, timeoutMs)
      }
    } catch {
      // If MutationObserver fails, fall back to timeout
      cleanup()
      timeoutId = setTimeout(onTimeout, timeoutMs)
    }
  })
}

/**
 * Watches for SPA navigation events (pushState, replaceState, popstate, hashchange).
 * Calls the onNavigate callback when navigation occurs.
 *
 * @param onNavigate - Callback to invoke when SPA navigation detected
 * @returns Cleanup function to stop watching
 */
export function watchSpaNavigation(onNavigate: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  let wrappedPushState: typeof history.pushState
  let wrappedReplaceState: typeof history.replaceState

  const historyChangeHandler = () => {
    // Small delay to let DOM update after navigation
    setTimeout(() => {
      onNavigate()
    }, 0)
  }

  // Listen for popstate and hashchange events
  window.addEventListener('popstate', historyChangeHandler)
  window.addEventListener('hashchange', historyChangeHandler)

  // Wrap history.pushState and history.replaceState
  if (history.pushState) {
    wrappedPushState = history.pushState
    history.pushState = function (state: unknown, title: string, url?: string | URL | null) {
      const result = wrappedPushState.apply(this, [state, title, url])
      historyChangeHandler()
      return result
    }
  }

  if (history.replaceState) {
    wrappedReplaceState = history.replaceState
    history.replaceState = function (state: unknown, title: string, url?: string | URL | null) {
      const result = wrappedReplaceState.apply(this, [state, title, url])
      historyChangeHandler()
      return result
    }
  }

  // Return cleanup function
  return () => {
    window.removeEventListener('popstate', historyChangeHandler)
    window.removeEventListener('hashchange', historyChangeHandler)

    if (wrappedPushState) {
      history.pushState = wrappedPushState
    }
    if (wrappedReplaceState) {
      history.replaceState = wrappedReplaceState
    }
  }
}
