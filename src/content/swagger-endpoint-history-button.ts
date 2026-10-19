/**
 * In-Page Swagger Endpoint History Button Integration.
 *
 * Injects a clean, method-styled [History (N)] button into Swagger UI operation
 * blocks inside the .try-out toolbar, displaying dynamic execution counts and
 * opening the in-page HistoryDetailModal pre-filtered to that specific endpoint.
 */

import { endpointIdOf } from '@/adapters/swagger/swagger-request-dom'
import type { HistoryPanelService } from '@/modules/history'
import type { EventBus } from '@/core/events'

export interface SwaggerEndpointHistoryButtonHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

export interface SwaggerEndpointHistoryButtonOptions {
  onOpenHistory?: (options: { endpointId: string }) => void | Promise<void>
}

const STYLE_ID = 'oac-endpoint-history-button-styles'
const ATTACHED_ATTR = 'data-oac-history-btn-attached'

export const SVG_ICONS = {
  clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
}

const CSS_STYLES = `
/* Feature toggle in Config */
body.oac-disable-endpoint-history-button .oac-endpoint-history-btn,
body.oac-disable-endpoint-history .oac-endpoint-history-btn {
  display: none !important;
}

.oac-endpoint-history-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  height: 26px !important;
  padding: 0 9px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: var(--oac-btn-text, #334155) !important;
  background: var(--oac-btn-bg, #f8fafc) !important;
  border: 1px solid var(--oac-btn-border, #cbd5e1) !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  line-height: 1 !important;
  transition: all 0.15s ease !important;
  user-select: none !important;
  outline: none !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  vertical-align: middle !important;
  margin-left: auto !important;
  margin-right: 8px !important;
  flex-shrink: 0 !important;
}

.oac-endpoint-history-btn:hover {
  background: #f1f5f9 !important;
  border-color: #94a3b8 !important;
  color: #0f172a !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
}

.oac-endpoint-history-btn:active {
  background: #e2e8f0 !important;
}

.oac-history-btn-icon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: currentColor !important;
}

.oac-history-btn-icon svg {
  display: block !important;
}

.oac-history-count-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #e2e8f0 !important;
  color: #334155 !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  padding: 1px 5px !important;
  border-radius: 9999px !important;
  line-height: 1 !important;
}

body.oac-dark-mode .oac-endpoint-history-btn {
  color: #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border-color: rgba(255, 255, 255, 0.15) !important;
}

body.oac-dark-mode .oac-endpoint-history-btn:hover {
  background: rgba(255, 255, 255, 0.12) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
  color: #ffffff !important;
}

body.oac-dark-mode .oac-history-count-badge {
  background: rgba(255, 255, 255, 0.18) !important;
  color: #f1f5f9 !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  ;(doc.head || doc.documentElement).appendChild(style)
}
/**
 * Finds the earliest native right-side control direct child inside .opblock-summary
 * (such as Swagger's CopyToClipboardBtn, AuthorizeOperationBtn, or opblock-control-arrow).
 * Inserting before this anchor places the History button on the right side
 * (after the operation method/path/description, exactly before the lock/arrow controls).
 */
function findRightControlsAnchor(summary: Element): Element | null {
  // First, check direct children of summary
  for (const child of Array.from(summary.children)) {
    // NEVER match the main operation summary control (which contains method, path, description, star)
    if (child.classList.contains('opblock-summary-control')) {
      continue
    }
    // NEVER match our own button
    if (child.classList.contains('oac-endpoint-history-btn')) {
      continue
    }
    // Match native right-side controls
    if (
      child.classList.contains('copy-to-clipboard') ||
      child.classList.contains('authorization__btn') ||
      child.classList.contains('opblock-control-arrow') ||
      child.classList.contains('view-line-link') ||
      child.querySelector(
        '.authorization__btn, .opblock-control-arrow, .copy-to-clipboard, svg.arrow',
      )
    ) {
      return child
    }
  }

  // Fallback: if .opblock-summary-control is present, insert right after it
  const summaryControl = summary.querySelector('.opblock-summary-control')
  if (summaryControl && summaryControl.nextElementSibling) {
    if (!summaryControl.nextElementSibling.classList.contains('oac-endpoint-history-btn')) {
      return summaryControl.nextElementSibling
    }
  }

  return null
}

export function mountSwaggerEndpointHistoryButton(
  service: HistoryPanelService,
  bus?: EventBus,
  doc: Document = document,
  options?: SwaggerEndpointHistoryButtonOptions,
): SwaggerEndpointHistoryButtonHandle {
  ensureStyles(doc)

  // In-memory cache of execution counts per endpointId
  const counts = new Map<string, number>()

  function updateCountBadge(btn: HTMLButtonElement, count: number): void {
    const badge = btn.querySelector('.oac-history-count-badge')
    if (count > 0) {
      if (badge) {
        badge.textContent = String(count)
      } else {
        const newBadge = doc.createElement('span')
        newBadge.className = 'oac-history-count-badge'
        newBadge.textContent = String(count)
        btn.appendChild(newBadge)
      }
      btn.title = `View execution history (${count} past call${count === 1 ? '' : 's'})`
    } else {
      if (badge) badge.remove()
      btn.title = 'View execution history'
    }
  }

  function refreshAllButtonCounts(): void {
    scanAndMount(doc)
  }

  async function loadInitialCounts(): Promise<void> {
    try {
      const res = await service.list()
      if (res.ok && Array.isArray(res.value)) {
        counts.clear()
        for (const entry of res.value) {
          if (entry.endpointId) {
            counts.set(entry.endpointId, (counts.get(entry.endpointId) ?? 0) + 1)
          }
        }
        refreshAllButtonCounts()
      }
    } catch {
      // non-critical if initial fetch fails
    }
  }

  void loadInitialCounts()

  // EventBus listeners for reactive real-time count updates
  const unsubs: Array<() => void> = []

  if (bus) {
    unsubs.push(
      bus.subscribe('HISTORY_RECORDED', (payload) => {
        if (payload.endpointId) {
          counts.set(payload.endpointId, (counts.get(payload.endpointId) ?? 0) + 1)
          refreshAllButtonCounts()
        }
      }),
    )

    unsubs.push(
      bus.subscribe('REQUEST_REPLAYED', () => {
        void loadInitialCounts()
      }),
    )

    unsubs.push(
      bus.subscribe('HISTORY_CLEARED', () => {
        counts.clear()
        for (const el of Array.from(doc.querySelectorAll('.oac-endpoint-history-btn'))) {
          el.remove()
        }
      }),
    )
  }

  function scanAndMount(root: ParentNode = doc): number {
    let mountedCount = 0

    const targetEl = root instanceof Element ? root : null
    const candidateBlocks: Element[] = []

    if (targetEl?.classList.contains('opblock')) {
      candidateBlocks.push(targetEl)
    }
    const closest = targetEl?.closest('.opblock')
    if (closest) {
      candidateBlocks.push(closest)
    }
    if ('querySelectorAll' in root) {
      candidateBlocks.push(...Array.from(root.querySelectorAll('.opblock')))
    }

    const blocks = Array.from(new Set(candidateBlocks))

    for (const block of blocks) {
      const endpointId = endpointIdOf(block)
      if (!endpointId) continue

      const count = counts.get(endpointId) ?? 0
      const existingBtn = block.querySelector<HTMLButtonElement>('.oac-endpoint-history-btn')

      // ONLY show if there is past execution history for this API!
      if (count <= 0) {
        if (existingBtn) existingBtn.remove()
        continue
      }

      // Find action toolbar container inside the operation block
      const tryOutWrapper =
        block.querySelector('.try-out') ??
        block.querySelector('.parameters-container') ??
        block.querySelector('.opblock-summary')

      if (!tryOutWrapper) continue

      if (existingBtn) {
        updateCountBadge(existingBtn, count)
        if (tryOutWrapper.classList.contains('opblock-summary')) {
          const anchor = findRightControlsAnchor(tryOutWrapper)
          if (anchor && existingBtn.nextElementSibling !== anchor) {
            tryOutWrapper.insertBefore(existingBtn, anchor)
          }
        }
        continue
      }

      block.setAttribute(ATTACHED_ATTR, 'true')

      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'btn oac-endpoint-history-btn'
      btn.title = `View execution history (${count} past call${count === 1 ? '' : 's'})`
      btn.innerHTML = `
        <span class="oac-history-btn-icon">${SVG_ICONS.clock}</span>
        <span>History</span>
        <span class="oac-history-count-badge">${count}</span>
      `

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()

        if (options?.onOpenHistory) {
          void options.onOpenHistory({ endpointId })
        }
      })

      if (tryOutWrapper.classList.contains('opblock-summary')) {
        const anchor = findRightControlsAnchor(tryOutWrapper)
        if (anchor) {
          tryOutWrapper.insertBefore(btn, anchor)
        } else {
          tryOutWrapper.appendChild(btn)
        }
      } else {
        tryOutWrapper.appendChild(btn)
      }
      mountedCount++
    }

    return mountedCount
  }

  scanAndMount(doc)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false
    for (const m of mutations) {
      if (m.type === 'childList' && m.addedNodes.length > 0) {
        shouldScan = true
        break
      }
    }
    if (shouldScan) {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        scanAndMount(doc)
      }, 120)
    }
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  return {
    scanAndMount: (root?: ParentNode) => scanAndMount(root ?? doc),
    dispose: () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
      for (const unsub of unsubs) unsub()
      for (const el of Array.from(doc.querySelectorAll('.oac-endpoint-history-btn'))) {
        el.remove()
      }
      doc.getElementById(STYLE_ID)?.remove()
    },
  }
}
