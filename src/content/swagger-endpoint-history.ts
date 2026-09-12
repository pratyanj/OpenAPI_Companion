/**
 * Swagger UI Endpoint Quick History:
 * - 1-Click "Re-fill Last Sent Payload" for any operation (Alt+L)
 * - Captures exact path, query, header parameters and request body on Execute
 * - Restores both parameters and body with 1 click
 * - Shows button ONLY after page refresh (not immediately after executing before refresh)
 * - Automatically hides the button once values are added to the request body
 * - Zero emojis / 100% SVG vector icons
 * - Clean status feedback (never puts error strings in button label)
 */
import {
  setNativeValue,
  endpointIdOf,
  findAnyBlock,
  readParametersFromBlock,
  writeRequestBody,
  writeRequestParameters,
} from '@/adapters/swagger/swagger-request-dom'

export interface EndpointPayloadSnapshot {
  endpointId: string
  body?: string
  path?: Record<string, string>
  query?: Record<string, string>
  headers?: Record<string, string>
  timestamp: number
}

export interface SwaggerEndpointHistoryHandle {
  getLastPayload(endpointId: string): EndpointPayloadSnapshot | null
  savePayload(snapshot: EndpointPayloadSnapshot, isRestorable?: boolean): void
  refillEndpoint(endpointId: string): boolean
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

export interface EndpointHistoryOptions {
  storageKeyPrefix?: string
}

export const SVG_ICONS = {
  history: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  check: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  clock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
}

const STYLE_ID = 'oac-endpoint-history-styles'
const ATTACHED_EXECUTE_ATTR = 'data-oac-history-attached'
const ATTACHED_BAR_ATTR = 'data-oac-bar-history-attached'
const STORAGE_PREFIX = 'oac_last_payload_'

const CSS_STYLES = `
.oac-last-payload-btn {
  display: flex !important;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 6px;
  width: 100%;
  margin: 0 0 10px 0 !important;
  padding: 8px 14px;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
  line-height: 1.4;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.oac-last-payload-btn:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.15);
}

.oac-last-payload-btn:active {
  background: #dbeafe;
}

.oac-last-payload-btn.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
  color: #15803d !important;
}

.oac-last-payload-group {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.oac-last-payload-group:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 5px rgba(59, 130, 246, 0.15);
}

.oac-last-payload-group.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
}

.oac-last-payload-group.success .oac-mock-btn {
  color: #15803d !important;
}

.oac-last-payload-btn.hidden,
.oac-last-payload-group.hidden {
  display: none !important;
}

.oac-history-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.oac-history-icon svg {
  display: block;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return ''
  const diffSec = Math.floor((Date.now() - timestamp) / 1000)
  if (diffSec < 30) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return new Date(timestamp).toLocaleDateString()
}

function buildTooltip(snapshot: EndpointPayloadSnapshot): string {
  const time = formatRelativeTime(snapshot.timestamp)
  const parts: string[] = []
  if (time) parts.push(`Last sent ${time}`)

  const paramNames: string[] = [
    ...Object.keys(snapshot.path ?? {}),
    ...Object.keys(snapshot.query ?? {}),
    ...Object.keys(snapshot.headers ?? {}),
  ]

  if (paramNames.length > 0) {
    const list = paramNames.slice(0, 3).join(', ') + (paramNames.length > 3 ? '...' : '')
    parts.push(`${paramNames.length} param${paramNames.length > 1 ? 's' : ''} (${list})`)
  }
  if (snapshot.body) parts.push(`body: ${snapshot.body.length} chars`)

  return parts.length > 0 ? `Restore last sent payload (${parts.join(' - ')})` : 'Restore last sent payload'
}

export function mountSwaggerEndpointHistory(
  doc: Document = document,
  options: EndpointHistoryOptions = {},
): SwaggerEndpointHistoryHandle {
  ensureStyles(doc)

  const prefix = options.storageKeyPrefix ?? STORAGE_PREFIX
  const memoryCache = new Map<string, EndpointPayloadSnapshot>()
  // Endpoints eligible to display the restore button (loaded from storage after page refresh)
  const restorableEndpoints = new Set<string>()

  // Load any previously saved payloads from storage (fires once when the page loads / refreshes)
  function loadInitialPayloads(): void {
    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.get(null, (all) => {
        if (!all) return
        for (const [k, v] of Object.entries(all)) {
          if (k.startsWith(prefix) && v && typeof v === 'object') {
            const snap = v as EndpointPayloadSnapshot
            if (snap.endpointId) {
              memoryCache.set(snap.endpointId, snap)
              // Only payloads existing in storage when page is refreshed/opened are restorable
              restorableEndpoints.add(snap.endpointId)
              updateButtonsForEndpoint(snap.endpointId)
            }
          }
        }
      })
    } else if (typeof localStorage !== 'undefined') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(prefix)) {
            const val = localStorage.getItem(k)
            if (val) {
              const snap = JSON.parse(val) as EndpointPayloadSnapshot
              if (snap.endpointId) {
                memoryCache.set(snap.endpointId, snap)
                restorableEndpoints.add(snap.endpointId)
                updateButtonsForEndpoint(snap.endpointId)
              }
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  loadInitialPayloads()

  function persistPayload(snapshot: EndpointPayloadSnapshot, isRestorable = false): void {
    memoryCache.set(snapshot.endpointId, snapshot)
    const key = `${prefix}${snapshot.endpointId}`

    if (typeof chrome !== 'undefined' && chrome?.storage?.local) {
      chrome.storage.local.set({ [key]: snapshot }, () => {
        /* stored for future refreshes */
      })
    } else if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(snapshot))
      } catch {
        /* storage full or unavailable */
      }
    }

    if (isRestorable) {
      restorableEndpoints.add(snapshot.endpointId)
    } else {
      // Per user requirement: show that button ONLY after the refresh, not before
      // When executing in the current session, payload is saved for next refresh, but button stays hidden now
      restorableEndpoints.delete(snapshot.endpointId)
    }

    updateButtonsForEndpoint(snapshot.endpointId)
  }

  function updateButtonsForEndpoint(endpointId: string): void {
    const isRestorable = restorableEndpoints.has(endpointId)
    const snap = memoryCache.get(endpointId)
    const block = findAnyBlock(doc, endpointId)
    if (!block) return

    const shouldShow = isRestorable && snap != null
    const tooltip = snap ? buildTooltip(snap) : 'Restore last sent payload'

    // 1. Update execute-wrapper button
    const execBtn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')
    if (execBtn) {
      if (shouldShow) {
        execBtn.classList.remove('hidden')
        execBtn.title = tooltip
      } else {
        execBtn.classList.add('hidden')
      }
    }

    // 2. Update request-body toolbar button
    const barGroup = block.querySelector<HTMLElement>('.oac-last-payload-group')
    if (barGroup) {
      if (shouldShow) {
        barGroup.classList.remove('hidden')
        const barBtn = barGroup.querySelector<HTMLButtonElement>('.oac-last-payload-bar-btn')
        if (barBtn) barBtn.title = tooltip
      } else {
        barGroup.classList.add('hidden')
      }
    }
  }

  function flashSuccessAndHide(block: Element, endpointId: string): void {
    const buttons = Array.from(
      block.querySelectorAll<HTMLElement>('.oac-last-payload-btn, .oac-last-payload-group'),
    )
    for (const el of buttons) {
      el.classList.add('success')
      const label = el.querySelector<HTMLElement>('.oac-last-payload-label, .oac-mock-label')
      const icon = el.querySelector<HTMLElement>('.oac-history-icon, .oac-mock-icon')
      const prevLabel = label ? label.textContent : ''
      const prevIcon = icon ? icon.innerHTML : ''

      if (label) label.textContent = 'Restored'
      if (icon) icon.innerHTML = SVG_ICONS.check

      // After last payload adds value in request body, hide that button
      setTimeout(() => {
        el.classList.remove('success')
        if (label && prevLabel) label.textContent = prevLabel
        if (icon && prevIcon) icon.innerHTML = prevIcon
        // Remove from restorable and hide
        restorableEndpoints.delete(endpointId)
        updateButtonsForEndpoint(endpointId)
      }, 700)
    }
  }

  function refillEndpoint(endpointId: string): boolean {
    const snapshot = memoryCache.get(endpointId)
    if (!snapshot) return false

    const block = findAnyBlock(doc, endpointId)
    if (!block) return false

    // Ensure operation is open and in Try-it-out mode
    if (!block.classList.contains('is-open')) {
      const summary =
        block.querySelector<HTMLElement>('.opblock-summary-control') ??
        block.querySelector<HTMLElement>('.opblock-summary')
      summary?.click()
    }

    const tryOutBtn = block.querySelector<HTMLButtonElement>('.try-out__btn')
    if (tryOutBtn && !block.querySelector('.btn.execute')) {
      tryOutBtn.click()
    }

    let restoredAny = false

    // Restore parameters
    if (snapshot.path || snapshot.query || snapshot.headers) {
      const ok = writeRequestParameters(doc, endpointId, {
        path: snapshot.path,
        query: snapshot.query,
        headers: snapshot.headers,
      })
      if (ok) restoredAny = true
    }

    // Restore request body
    if (snapshot.body != null) {
      const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')
      if (textarea) {
        setNativeValue(textarea, snapshot.body)
        restoredAny = true
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
        textarea.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        const ok = writeRequestBody(doc, endpointId, snapshot.body)
        if (ok) restoredAny = true
      }
    }

    if (restoredAny) {
      flashSuccessAndHide(block, endpointId)
      return true
    }

    return false
  }

  // Intercept Execute clicks to capture payload
  function onExecuteClick(e: Event): void {
    const path = e.composedPath?.() ?? []
    const target = (path.length ? path : [e.target]).find(
      (node): node is Element =>
        node instanceof Element && (node.matches?.('.btn.execute') || node.matches?.('.execute')),
    )
    if (!target) return

    const block = target.closest('.opblock')
    if (!block) return

    const endpointId = endpointIdOf(block)
    if (!endpointId) return

    const bodyText = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')?.value
    const { path: pathParams, query: queryParams, headers: headerParams } = readParametersFromBlock(block)

    const hasBody = Boolean(bodyText && bodyText.trim())
    const hasPath = Object.keys(pathParams).length > 0
    const hasQuery = Object.keys(queryParams).length > 0
    const hasHeaders = Object.keys(headerParams).length > 0

    if (hasBody || hasPath || hasQuery || hasHeaders) {
      const snapshot: EndpointPayloadSnapshot = {
        endpointId,
        body: hasBody ? bodyText : undefined,
        path: hasPath ? pathParams : undefined,
        query: hasQuery ? queryParams : undefined,
        headers: hasHeaders ? headerParams : undefined,
        timestamp: Date.now(),
      }
      // Save for future session/refresh, but do not show before refresh
      persistPayload(snapshot, false)
    }
  }

  doc.addEventListener('click', onExecuteClick, true)

  // Attach button into .execute-wrapper
  function attachToExecuteWrapper(wrapper: Element): void {
    if (wrapper.hasAttribute(ATTACHED_EXECUTE_ATTR)) return
    wrapper.setAttribute(ATTACHED_EXECUTE_ATTR, 'true')

    const block = wrapper.closest('.opblock')
    const endpointId = block ? endpointIdOf(block) : null
    const snapshot = endpointId ? memoryCache.get(endpointId) : null
    const shouldShow = Boolean(endpointId && restorableEndpoints.has(endpointId) && snapshot)

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = `btn oac-last-payload-btn${shouldShow ? '' : ' hidden'}`
    btn.title = snapshot ? buildTooltip(snapshot) : 'Restore last sent payload'
    btn.innerHTML = `
      <span class="oac-history-icon">${SVG_ICONS.history}</span>
      <span class="oac-last-payload-label">Last Payload</span>
    `

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (endpointId) refillEndpoint(endpointId)
    })

    // Insert before Execute button so Last Payload is cleanly placed above it with gap
    const executeBtn = wrapper.querySelector('.btn.execute')
    if (executeBtn) {
      wrapper.insertBefore(btn, executeBtn)
    } else {
      wrapper.appendChild(btn)
    }
  }

  // Attach button into .oac-mock-data-bar (request body bar)
  function attachToMockDataBar(bar: Element): void {
    if (bar.hasAttribute(ATTACHED_BAR_ATTR)) return
    bar.setAttribute(ATTACHED_BAR_ATTR, 'true')

    const block = bar.closest('.opblock')
    const endpointId = block ? endpointIdOf(block) : null
    const snapshot = endpointId ? memoryCache.get(endpointId) : null
    const shouldShow = Boolean(endpointId && restorableEndpoints.has(endpointId) && snapshot)

    const btnContainer = bar.querySelector('.oac-body-btn-container')
    if (!btnContainer) return

    const group = doc.createElement('div')
    group.className = `oac-last-payload-group${shouldShow ? '' : ' hidden'}`

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'oac-mock-btn oac-last-payload-bar-btn'
    btn.title = snapshot ? buildTooltip(snapshot) : 'Restore last sent payload (Alt+L)'
    btn.innerHTML = `
      <span class="oac-mock-icon">${SVG_ICONS.history}</span>
      <span class="oac-mock-label">Last Payload</span>
    `

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (endpointId) refillEndpoint(endpointId)
    })

    group.appendChild(btn)

    // Insert as first button inside container (before Format and Fake Data)
    if (btnContainer.firstChild) {
      btnContainer.insertBefore(group, btnContainer.firstChild)
    } else {
      btnContainer.appendChild(group)
    }
  }

  function scanAndMount(root: ParentNode = doc): number {
    let count = 0

    // Scan execute-wrappers
    for (const wrapper of Array.from(root.querySelectorAll('.execute-wrapper'))) {
      if (!wrapper.hasAttribute(ATTACHED_EXECUTE_ATTR)) {
        attachToExecuteWrapper(wrapper)
        count++
      }
    }

    // Scan mock-data-bars
    for (const bar of Array.from(root.querySelectorAll('.oac-mock-data-bar'))) {
      if (!bar.hasAttribute(ATTACHED_BAR_ATTR)) {
        attachToMockDataBar(bar)
        count++
      }
    }

    return count
  }

  // Handle Alt+L shortcut inside opblocks
  function onKeyDown(e: KeyboardEvent): void {
    if (e.altKey && (e.key === 'l' || e.key === 'L')) {
      const activeEl = doc.activeElement
      const block = activeEl?.closest('.opblock')
      if (block) {
        const endpointId = endpointIdOf(block)
        if (endpointId) {
          e.preventDefault()
          refillEndpoint(endpointId)
        }
      }
    }
  }

  doc.addEventListener('keydown', onKeyDown)

  const observer = new MutationObserver(() => {
    scanAndMount(doc)
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  scanAndMount(doc)

  return {
    getLastPayload(endpointId: string): EndpointPayloadSnapshot | null {
      return memoryCache.get(endpointId) ?? null
    },
    savePayload(snapshot: EndpointPayloadSnapshot, isRestorable = true): void {
      persistPayload(snapshot, isRestorable)
    },
    refillEndpoint(endpointId: string): boolean {
      return refillEndpoint(endpointId)
    },
    scanAndMount(root?: ParentNode): number {
      return scanAndMount(root)
    },
    dispose(): void {
      observer.disconnect()
      doc.removeEventListener('click', onExecuteClick, true)
      doc.removeEventListener('keydown', onKeyDown)
    },
  }
}
