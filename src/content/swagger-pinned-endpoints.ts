/**
 * Swagger UI Endpoint Favorites & Top Pinning Tray Integration (Point 11).
 *
 * Provides:
 * - 1-Click star favorite buttons to the left of HTTP method badges on operation headers.
 * - Event propagation protection: clicking the star never toggles the Swagger accordion.
 * - Top-level "Pinned Operations" tray above Swagger UI tag sections.
 * - 1-Click "Jump & Open": smoothly scrolls to any pinned operation and auto-expands it with a pulse highlight.
 * - Full real-time synchronization with ProductivityService and FAVORITE_TOGGLED events.
 * - Strict zero-emoji compliance: 100% inline SVG vector icons.
 * - High performance: debounced, filtered MutationObserver, memoized tray rendering, zero infinite loops.
 */

import { endpointIdOf, findAnyBlock } from '@/adapters/swagger/swagger-request-dom'
import type { ProductivityService } from '@/modules/productivity/productivity-service'
import type { EndpointListItem } from '@/modules/productivity/types'

export interface SwaggerPinnedEndpointsHandle {
  scanAndMount(root?: ParentNode): number
  renderTray(): void
  dispose(): void
}

const STYLE_ID = 'oac-pinned-endpoints-styles'
const TRAY_ID = 'oac-pinned-endpoints-tray'
const STAR_ATTACHED_ATTR = 'data-oac-star-attached'

const SVG_ICONS = {
  starOutline: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  starFilled: `<svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  jump: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  chevronUp: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
}

const CSS_STYLES = `
/* Feature disable toggle */
body.oac-disable-pinned-endpoints .oac-endpoint-star-btn,
body.oac-disable-pinned-endpoints #oac-pinned-endpoints-tray {
  display: none !important;
}

/* Star button placed directly to the left of HTTP method badge */
.swagger-ui .oac-endpoint-star-btn,
.oac-endpoint-star-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 22px !important;
  height: 22px !important;
  margin-right: 6px !important;
  margin-left: 2px !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 4px !important;
  color: #94a3b8 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  vertical-align: middle !important;
  outline: none !important;
  flex-shrink: 0 !important;
  z-index: 5 !important;
}

.swagger-ui .oac-endpoint-star-btn:hover,
.oac-endpoint-star-btn:hover {
  color: #f59e0b !important;
  background: rgba(245, 158, 11, 0.12) !important;
  transform: scale(1.15) !important;
}

.swagger-ui .oac-endpoint-star-btn.oac-starred,
.oac-endpoint-star-btn.oac-starred {
  color: #f59e0b !important;
}

/* Pinned Operations Top Tray */
#oac-pinned-endpoints-tray {
  box-sizing: border-box !important;
  margin: 14px 0 20px 0 !important;
  padding: 12px 16px !important;
  background: #ffffff !important;
  border: 1px solid #e2e8f0 !important;
  border-left: 4px solid #f59e0b !important;
  border-radius: 6px !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  transition: all 0.2s ease !important;
}

#oac-pinned-endpoints-tray.oac-tray-hidden {
  display: none !important;
}

.oac-pinned-tray-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  user-select: none !important;
}

.oac-pinned-tray-title-group {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

.oac-pinned-tray-title {
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #1e293b !important;
  letter-spacing: -0.01em !important;
  margin: 0 !important;
}

.oac-pinned-count-badge {
  font-size: 10px !important;
  font-weight: 600 !important;
  padding: 2px 7px !important;
  background: #fef3c7 !important;
  color: #b45309 !important;
  border-radius: 9999px !important;
}

.oac-pinned-tray-toggle-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 22px !important;
  height: 22px !important;
  background: transparent !important;
  border: none !important;
  color: #64748b !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  transition: background 0.15s ease !important;
}

.oac-pinned-tray-toggle-btn:hover {
  background: #f1f5f9 !important;
  color: #0f172a !important;
}

.oac-pinned-cards-grid {
  display: grid !important;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)) !important;
  gap: 8px !important;
  margin-top: 10px !important;
}

.oac-pinned-cards-grid.oac-collapsed {
  display: none !important;
}

/* Individual Pinned Card */
.oac-pinned-card {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 7px 10px !important;
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  gap: 8px !important;
  box-sizing: border-box !important;
}

.oac-pinned-card:hover {
  background: #f1f5f9 !important;
  border-color: #cbd5e1 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 3px 6px rgba(0, 0, 0, 0.05) !important;
}

.oac-pinned-card-main {
  display: flex !important;
  align-items: center !important;
  gap: 7px !important;
  min-width: 0 !important;
  flex: 1 !important;
}

.oac-pinned-method-badge {
  font-size: 9px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  padding: 3px 6px !important;
  border-radius: 3px !important;
  color: #ffffff !important;
  line-height: 1 !important;
  flex-shrink: 0 !important;
}

.oac-pinned-method-badge.method-get { background: #61affe !important; }
.oac-pinned-method-badge.method-post { background: #49cc90 !important; }
.oac-pinned-method-badge.method-put { background: #fca130 !important; }
.oac-pinned-method-badge.method-delete { background: #f93e3e !important; }
.oac-pinned-method-badge.method-patch { background: #50e3c2 !important; }
.oac-pinned-method-badge.method-options,
.oac-pinned-method-badge.method-head { background: #9012fe !important; }

.oac-pinned-path-wrap {
  display: flex !important;
  flex-direction: column !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.oac-pinned-path {
  font-family: monospace !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #1e293b !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.oac-pinned-summary {
  font-size: 10px !important;
  color: #64748b !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.oac-pinned-card-actions {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  flex-shrink: 0 !important;
}

.oac-pinned-jump-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 3px !important;
  padding: 3px 6px !important;
  font-size: 10px !important;
  font-weight: 500 !important;
  color: #3b82f6 !important;
  background: #eff6ff !important;
  border: 1px solid #bfdbfe !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  transition: all 0.12s ease !important;
}

.oac-pinned-jump-btn:hover {
  background: #dbeafe !important;
  color: #1d4ed8 !important;
}

.oac-pinned-unpin-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 20px !important;
  height: 20px !important;
  background: transparent !important;
  border: none !important;
  border-radius: 4px !important;
  color: #f59e0b !important;
  cursor: pointer !important;
  transition: background 0.12s ease !important;
}

.oac-pinned-unpin-btn:hover {
  background: rgba(245, 158, 11, 0.18) !important;
}

/* Smooth jump highlight animation */
@keyframes oac-pulse-highlight {
  0% { box-shadow: 0 0 0 0 rgba(97, 175, 254, 0.7); border-color: #3b82f6; }
  50% { box-shadow: 0 0 0 8px rgba(97, 175, 254, 0); border-color: #60a5fa; }
  100% { box-shadow: 0 0 0 0 rgba(97, 175, 254, 0); }
}

.oac-pulse-highlight {
  animation: oac-pulse-highlight 1.5s ease-out !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/**
 * Scrolls smoothly to the operation block in Swagger UI and auto-expands it.
 */
export function jumpToOperation(doc: Document, endpointId: string): boolean {
  const block = findAnyBlock(doc, endpointId)
  if (!block) return false

  // If collapsed, expand it
  if (!block.classList.contains('is-open')) {
    const summaryControl =
      block.querySelector<HTMLElement>('.opblock-summary-control') ??
      block.querySelector<HTMLElement>('.opblock-summary')
    if (summaryControl) {
      summaryControl.click()
    }
  }

  // Smooth scroll
  block.scrollIntoView({ behavior: 'smooth', block: 'center' })

  // Pulse animation highlight
  block.classList.remove('oac-pulse-highlight')
  // Force reflow
  void (block as HTMLElement).offsetWidth
  block.classList.add('oac-pulse-highlight')
  setTimeout(() => {
    block.classList.remove('oac-pulse-highlight')
  }, 1600)

  return true
}

export function mountSwaggerPinnedEndpoints(
  productivity: ProductivityService,
  doc: Document = document,
): SwaggerPinnedEndpointsHandle {
  ensureStyles(doc)

  let trayElement: HTMLElement | null = doc.getElementById(TRAY_ID)
  let isTrayCollapsed = false
  let lastRenderedFingerprint = ''
  let isScanning = false
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  function getFavoritesList(): EndpointListItem[] {
    try {
      return productivity.getFavorites()
    } catch {
      return []
    }
  }

  function isEndpointStarred(endpointId: string): boolean {
    try {
      return productivity.isFavorite(endpointId)
    } catch {
      return false
    }
  }

  /**
   * Renders or updates the top Pinned Operations tray safely.
   */
  function renderTray(): void {
    const favorites = getFavoritesList()
    const fingerprint = `${favorites.length}:${favorites.map((f) => f.endpointId).join(',')}:${isTrayCollapsed}`

    // Ensure tray container exists and is anchored at the top of Swagger
    if (!trayElement || !trayElement.isConnected) {
      if (!trayElement) {
        trayElement = doc.createElement('div')
        trayElement.id = TRAY_ID
      }

      const anchor = doc.querySelector(
        '.opblock-tag-section, .opblock, .swagger-ui .wrapper:not(.information-container)',
      )
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(trayElement, anchor)
      } else {
        const mainContainer = doc.querySelector('.swagger-ui .wrapper, .swagger-ui')
        if (mainContainer) {
          mainContainer.insertBefore(trayElement, mainContainer.firstChild)
        } else {
          doc.body?.appendChild(trayElement)
        }
      }
    }

    // Auto-hide when 0 items are pinned
    if (favorites.length === 0) {
      trayElement.classList.add('oac-tray-hidden')
      if (trayElement.children.length > 0) {
        trayElement.innerHTML = ''
      }
      lastRenderedFingerprint = fingerprint
      return
    }

    // If already rendered with exact same favorites and state, skip to avoid touching DOM
    if (fingerprint === lastRenderedFingerprint) {
      return
    }
    lastRenderedFingerprint = fingerprint

    trayElement.classList.remove('oac-tray-hidden')
    trayElement.innerHTML = ''

    // Header
    const header = doc.createElement('div')
    header.className = 'oac-pinned-tray-header'

    const titleGroup = doc.createElement('div')
    titleGroup.className = 'oac-pinned-tray-title-group'
    titleGroup.innerHTML = `
      <span style="color: #f59e0b; display: inline-flex; align-items: center;">${SVG_ICONS.starFilled}</span>
      <h3 class="oac-pinned-tray-title">Pinned Operations</h3>
      <span class="oac-pinned-count-badge">${favorites.length}</span>
    `

    const toggleBtn = doc.createElement('button')
    toggleBtn.type = 'button'
    toggleBtn.className = 'oac-pinned-tray-toggle-btn'
    toggleBtn.title = isTrayCollapsed ? 'Expand pinned operations' : 'Collapse pinned operations'
    toggleBtn.innerHTML = isTrayCollapsed ? SVG_ICONS.chevronDown : SVG_ICONS.chevronUp
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      isTrayCollapsed = !isTrayCollapsed
      lastRenderedFingerprint = '' // force re-render
      renderTray()
    })

    header.appendChild(titleGroup)
    header.appendChild(toggleBtn)
    trayElement.appendChild(header)

    // Grid of cards
    const grid = doc.createElement('div')
    grid.className = `oac-pinned-cards-grid${isTrayCollapsed ? ' oac-collapsed' : ''}`

    favorites.forEach((fav) => {
      const card = doc.createElement('div')
      card.className = 'oac-pinned-card'
      card.setAttribute('data-endpoint-id', fav.endpointId)

      const methodLower = (fav.method || 'get').toLowerCase()

      const main = doc.createElement('div')
      main.className = 'oac-pinned-card-main'

      const badge = doc.createElement('span')
      badge.className = `oac-pinned-method-badge method-${methodLower}`
      badge.textContent = fav.method.toUpperCase()

      const pathWrap = doc.createElement('div')
      pathWrap.className = 'oac-pinned-path-wrap'

      const pathEl = doc.createElement('span')
      pathEl.className = 'oac-pinned-path'
      pathEl.textContent = fav.path

      pathWrap.appendChild(pathEl)
      if (fav.summary) {
        const sumEl = doc.createElement('span')
        sumEl.className = 'oac-pinned-summary'
        sumEl.textContent = fav.summary
        pathWrap.appendChild(sumEl)
      }

      main.appendChild(badge)
      main.appendChild(pathWrap)

      // Actions
      const actions = doc.createElement('div')
      actions.className = 'oac-pinned-card-actions'

      const jumpBtn = doc.createElement('button')
      jumpBtn.type = 'button'
      jumpBtn.className = 'oac-pinned-jump-btn'
      jumpBtn.title = `Jump to ${fav.method.toUpperCase()} ${fav.path} in Swagger`
      jumpBtn.innerHTML = `${SVG_ICONS.jump} <span>Open</span>`
      jumpBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        jumpToOperation(doc, fav.endpointId)
      })

      const unpinBtn = doc.createElement('button')
      unpinBtn.type = 'button'
      unpinBtn.className = 'oac-pinned-unpin-btn'
      unpinBtn.title = 'Unpin operation'
      unpinBtn.innerHTML = SVG_ICONS.starFilled
      unpinBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        await productivity.toggleFavorite({
          endpointId: fav.endpointId,
          method: fav.method,
          path: fav.path,
        })
        lastRenderedFingerprint = ''
        renderTray()
        updateStarButtons()
      })

      actions.appendChild(jumpBtn)
      actions.appendChild(unpinBtn)

      card.appendChild(main)
      card.appendChild(actions)

      // Entire card clicks jump to operation
      card.addEventListener('click', () => {
        jumpToOperation(doc, fav.endpointId)
      })

      grid.appendChild(card)
    })

    trayElement.appendChild(grid)
  }

  /**
   * Updates all rendered star buttons to reflect current favorite state.
   */
  function updateStarButtons(): void {
    const buttons = doc.querySelectorAll<HTMLButtonElement>('.oac-endpoint-star-btn')
    buttons.forEach((btn) => {
      const endpointId = btn.getAttribute('data-endpoint-id')
      if (!endpointId) return
      const isStarred = isEndpointStarred(endpointId)
      if (isStarred) {
        btn.classList.add('oac-starred')
        btn.innerHTML = SVG_ICONS.starFilled
        btn.title = 'Unpin from top (Favorited)'
      } else {
        btn.classList.remove('oac-starred')
        btn.innerHTML = SVG_ICONS.starOutline
        btn.title = 'Pin to top (Favorite)'
      }
    })
  }

  /**
   * Scans .opblock elements and attaches star buttons directly to the left of the method badge.
   * NOTE: This does NOT call renderTray() — star button attachment is isolated and pure.
   */
  function scanAndMount(root: ParentNode = doc): number {
    if (isScanning) return 0
    isScanning = true

    let count = 0
    try {
      const blocks = root.querySelectorAll<HTMLElement>('.opblock')

      blocks.forEach((block) => {
        const summary = block.querySelector('.opblock-summary')
        if (!summary) return
        if (summary.getAttribute(STAR_ATTACHED_ATTR) === 'true') return

        const methodEl = summary.querySelector('.opblock-summary-method')
        if (!methodEl || !methodEl.parentNode) return

        const endpointId = endpointIdOf(block)
        if (!endpointId) return

        const pathEl = summary.querySelector(
          '.opblock-summary-path a span, .opblock-summary-path span, .opblock-summary-path',
        )
        const pathText = pathEl?.textContent?.trim() || endpointId.split(' ')[1] || ''
        const methodText = methodEl.textContent?.trim().toLowerCase() || endpointId.split(' ')[0] || 'get'
        const summaryDesc = summary.querySelector('.opblock-summary-description')?.textContent?.trim()

        const starBtn = doc.createElement('button')
        starBtn.type = 'button'
        starBtn.className = 'oac-endpoint-star-btn'
        starBtn.setAttribute('data-endpoint-id', endpointId)

        const isStarred = isEndpointStarred(endpointId)
        if (isStarred) {
          starBtn.classList.add('oac-starred')
          starBtn.innerHTML = SVG_ICONS.starFilled
          starBtn.title = 'Unpin from top (Favorited)'
        } else {
          starBtn.innerHTML = SVG_ICONS.starOutline
          starBtn.title = 'Pin to top (Favorite)'
        }

        // Starring toggle click handler: STOP PROPAGATION to prevent accordion toggle!
        starBtn.addEventListener('click', async (e) => {
          e.stopPropagation()
          e.preventDefault()

          await productivity.toggleFavorite({
            endpointId,
            method: methodText,
            path: pathText,
            summary: summaryDesc,
          })

          updateStarButtons()
          lastRenderedFingerprint = ''
          renderTray()
        })

        // Insert directly to the LEFT of .opblock-summary-method
        methodEl.parentNode.insertBefore(starBtn, methodEl)
        summary.setAttribute(STAR_ATTACHED_ATTR, 'true')
        count++
      })
    } finally {
      isScanning = false
    }

    return count
  }

  // Initial mounts
  scanAndMount()
  renderTray()

  // Subscribe to EventBus if available
  const busUnsub = (productivity as any).bus?.subscribe('FAVORITE_TOGGLED', () => {
    updateStarButtons()
    lastRenderedFingerprint = ''
    renderTray()
  })

  // Watch DOM mutations for newly rendered operations, filtered and debounced
  const observer = new MutationObserver((mutations) => {
    // Ignore mutations that originated inside our own tray or star buttons
    const hasRelevantMutation = mutations.some((m) => {
      if (trayElement && (m.target === trayElement || trayElement.contains(m.target))) {
        return false
      }
      for (let i = 0; i < m.addedNodes.length; i++) {
        const node = m.addedNodes[i] as HTMLElement
        if (node.nodeType === 1) {
          if (node.classList?.contains('oac-endpoint-star-btn') || node.id === TRAY_ID) {
            return false
          }
          if (node.classList?.contains('opblock') || node.querySelector?.('.opblock')) {
            return true
          }
        }
      }
      return false
    })

    if (!hasRelevantMutation) return

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const addedCount = scanAndMount()
      if (addedCount > 0 && getFavoritesList().length > 0) {
        lastRenderedFingerprint = ''
        renderTray()
      }
    }, 150)
  })

  try {
    observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    })
  } catch {
    /* ignore */
  }

  return {
    scanAndMount,
    renderTray: () => {
      lastRenderedFingerprint = ''
      renderTray()
    },
    dispose: () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      observer.disconnect()
      if (typeof busUnsub === 'function') busUnsub()
      if (trayElement) trayElement.remove()
      doc.querySelectorAll('.oac-endpoint-star-btn').forEach((el) => el.remove())
      doc.querySelectorAll(`[${STAR_ATTACHED_ATTR}]`).forEach((el) => el.removeAttribute(STAR_ATTACHED_ATTR))
      const s = doc.getElementById(STYLE_ID)
      if (s) s.remove()
    },
  }
}
