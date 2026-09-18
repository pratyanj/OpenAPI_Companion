/**
 * Swagger UI Global Debug Headers Injector (Point 13).
 *
 * Provides:
 * - A top-level "Headers" action button in Swagger UI header with active count badge.
 * - Interactive dark-themed in-page modal dialog.
 * - Add, edit, toggle (enable/disable), and delete global headers.
 * - Presets for common enterprise headers (X-Tenant-ID, X-Debug, X-Request-ID, Accept-Language).
 * - Variable interpolation support (e.g. {{TENANT_ID}}, {{$uuid}}).
 * - Multi-channel network injection into fetch, XMLHttpRequest, and Swagger requestInterceptor.
 * - Strict zero-emoji compliance: 100% inline SVG vector icons.
 * - Feature toggle support: .oac-disable-global-headers.
 */

import { BRIDGE_TAG } from './swagger-protocol'
import type { HeadersService } from '@/modules/headers/headers-service'
import type { GlobalHeaderItem } from '@/modules/headers/types'
import { stableId } from '@/utils'

export interface SwaggerGlobalHeadersHandle {
  openModal(): void
  closeModal(): void
  scanAndMount(root?: ParentNode): void
  dispose(): void
}

const STYLE_ID = 'oac-global-headers-styles'
const MODAL_ID = 'oac-global-headers-modal'
const BTN_CLASS = 'oac-global-headers-btn'

const SVG_ICONS = {
  globe: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>`,
  plus: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
  trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
}

const COMMON_PRESETS = [
  { name: 'X-Tenant-ID', value: '{{TENANT_ID}}', description: 'Multi-tenant partition' },
  { name: 'X-Debug', value: 'true', description: 'Enable debug mode' },
  { name: 'X-Request-ID', value: '{{$uuid}}', description: 'Trace request identifier' },
  { name: 'Accept-Language', value: 'en-US,en;q=0.9', description: 'Preferred locale' },
]

const CSS_STYLES = `
/* Feature disable toggle */
body.oac-disable-global-headers .oac-global-headers-btn,
body.oac-disable-global-headers #oac-global-headers-modal {
  display: none !important;
}

/* Header Actions Bar */
.oac-header-actions-bar {
  margin-top: 14px !important;
  margin-bottom: 8px !important;
  display: flex !important;
  align-items: center !important;
  gap: 12px !important;
  flex-wrap: wrap !important;
}

.oac-header-actions-bar:empty {
  display: none !important;
}

/* Header Action Button */
.oac-global-headers-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 7px !important;
  height: 32px !important;
  min-height: 32px !important;
  max-height: 32px !important;
  line-height: 30px !important;
  box-sizing: border-box !important;
  margin: 0 !important;
  padding: 0 13px !important;
  background: var(--oac-btn-bg, #ffffff) !important;
  color: var(--oac-btn-text, #1e293b) !important;
  border: 1px solid var(--oac-btn-border, #cbd5e1) !important;
  border-radius: 6px !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  box-shadow: var(--oac-shadow, 0 1px 3px rgba(0, 0, 0, 0.08)) !important;
  vertical-align: middle !important;
  user-select: none !important;
}

.oac-global-headers-btn:hover {
  background: var(--oac-btn-hover-bg, #f8fafc) !important;
  border-color: #3b82f6 !important;
  color: var(--oac-text, #1e293b) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15) !important;
}

.oac-global-headers-btn svg {
  width: 14px !important;
  height: 14px !important;
  color: #3b82f6 !important;
  flex-shrink: 0 !important;
  display: inline-block !important;
  vertical-align: middle !important;
}

.oac-gh-count-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #2563eb !important;
  color: #ffffff !important;
  font-size: 10px !important;
  font-weight: 700 !important;
  border-radius: 9999px !important;
  padding: 0 6px !important;
  height: 18px !important;
  min-width: 18px !important;
  line-height: 18px !important;
  box-sizing: border-box !important;
}

/* Modal Overlay & Backdrop */
#oac-global-headers-modal {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 999999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(10, 15, 29, 0.78) !important;
  backdrop-filter: blur(4px) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  box-sizing: border-box !important;
  opacity: 1 !important;
  transition: opacity 0.2s ease !important;
}

#oac-global-headers-modal.oac-hidden {
  display: none !important;
}

/* Modal Card */
.oac-gh-modal-card {
  width: 90% !important;
  max-width: 680px !important;
  max-height: 90vh !important;
  background: #0f172a !important;
  border-radius: 12px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06) !important;
  border: 1px solid #1e293b !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  color: #f8fafc !important;
}

/* Modal Header */
.oac-gh-modal-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 16px 20px !important;
  border-bottom: 1px solid #1e293b !important;
  background: #0f172a !important;
}

.oac-gh-modal-title-wrap {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

.oac-gh-modal-title {
  margin: 0 !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: -0.01em !important;
}

.oac-gh-modal-close-btn {
  background: transparent !important;
  border: none !important;
  padding: 6px !important;
  cursor: pointer !important;
  color: #94a3b8 !important;
  border-radius: 6px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.15s ease !important;
}

.oac-gh-modal-close-btn:hover {
  background: #1e293b !important;
  color: #ffffff !important;
}

/* Modal Body */
.oac-gh-modal-body {
  padding: 20px !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  background: #0f172a !important;
}

.oac-gh-hint {
  font-size: 12px !important;
  color: #94a3b8 !important;
  margin: 0 !important;
  line-height: 1.5 !important;
}

/* Presets Bar */
.oac-gh-presets-bar {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  flex-wrap: wrap !important;
}

.oac-gh-presets-label {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #64748b !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}

.oac-gh-preset-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 3px 8px !important;
  background: #1e293b !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  color: #93c5fd !important;
  font-size: 11px !important;
  font-family: ui-monospace, monospace !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.oac-gh-preset-btn:hover {
  background: #334155 !important;
  color: #ffffff !important;
  border-color: #3b82f6 !important;
}

/* Headers List */
.oac-gh-list {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
  min-height: 80px !important;
}

.oac-gh-empty {
  border: 1px dashed #334155 !important;
  border-radius: 8px !important;
  padding: 24px !important;
  text-align: center !important;
  color: #94a3b8 !important;
  font-size: 12px !important;
}

.oac-gh-row {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  background: #131d2e !important;
  border: 1px solid #1e293b !important;
  border-radius: 6px !important;
  padding: 8px 10px !important;
  transition: border-color 0.15s ease !important;
}

.oac-gh-row:hover {
  border-color: #334155 !important;
}

.oac-gh-toggle {
  width: 16px !important;
  height: 16px !important;
  accent-color: #2563eb !important;
  cursor: pointer !important;
  flex-shrink: 0 !important;
}

.oac-gh-input-name {
  width: 38% !important;
  padding: 6px 10px !important;
  background: #162032 !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  color: #c084fc !important;
  font-family: ui-monospace, monospace !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  outline: none !important;
}

.oac-gh-input-name:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
}

.oac-gh-input-value {
  flex: 1 !important;
  padding: 6px 10px !important;
  background: #162032 !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  color: #f8fafc !important;
  font-family: ui-monospace, monospace !important;
  font-size: 12px !important;
  outline: none !important;
}

.oac-gh-input-value:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
}

.oac-gh-del-btn {
  background: transparent !important;
  border: none !important;
  padding: 6px !important;
  cursor: pointer !important;
  color: #ef4444 !important;
  border-radius: 4px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  transition: all 0.15s ease !important;
  flex-shrink: 0 !important;
}

.oac-gh-del-btn:hover {
  background: rgba(239, 68, 68, 0.15) !important;
}

.oac-gh-add-btn {
  align-self: flex-start !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 12px !important;
  background: #1e293b !important;
  color: #f1f5f9 !important;
  border: 1px solid #334155 !important;
  border-radius: 6px !important;
  font-size: 12px !important;
  font-weight: 500 !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
}

.oac-gh-add-btn:hover {
  background: #334155 !important;
  color: #ffffff !important;
}

/* Footer Actions */
.oac-gh-modal-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 14px 20px !important;
  background: #0f172a !important;
  border-top: 1px solid #1e293b !important;
}

.oac-gh-status-info {
  font-size: 12px !important;
  color: #94a3b8 !important;
}

.oac-gh-footer-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
}

.oac-modal-btn {
  padding: 8px 16px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  border: 1px solid transparent !important;
}

.oac-modal-btn-cancel {
  background: transparent !important;
  border-color: transparent !important;
  color: #cbd5e1 !important;
}

.oac-modal-btn-cancel:hover {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #ffffff !important;
}

.oac-modal-btn-clear {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #94a3b8 !important;
  font-size: 12px !important;
  padding: 7px 12px !important;
}

.oac-modal-btn-clear:hover {
  background: #334155 !important;
  color: #f1f5f9 !important;
}

.oac-modal-btn-primary {
  background: #2563eb !important;
  border-color: #2563eb !important;
  color: #ffffff !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3) !important;
}

.oac-modal-btn-primary:hover {
  background: #1d4ed8 !important;
  border-color: #1d4ed8 !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35) !important;
  transform: translateY(-1px) !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function mountSwaggerGlobalHeaders(
  doc: Document = document,
  headersService?: HeadersService,
  onSyncHeaders?: (headers: Record<string, string>) => void,
): SwaggerGlobalHeadersHandle {
  ensureStyles(doc)

  let modalEl: HTMLElement | null = doc.getElementById(MODAL_ID)
  let currentHeaders: GlobalHeaderItem[] = []

  // Load existing headers asynchronously
  if (headersService) {
    headersService.load().then((items) => {
      if (currentHeaders.length === 0) {
        currentHeaders = [...items]
        updateHeaderButton()
        dispatchSync()
        if (modalEl && !modalEl.classList.contains('oac-hidden')) {
          renderRows()
        }
      }
    }).catch((err) => {
      console.warn('[OpenAPI Companion] Failed to load global headers:', err)
    })
  }

  function dispatchSync(): void {
    const activeRecord: Record<string, string> = {}
    for (const h of currentHeaders) {
      if (h.enabled && h.name.trim()) {
        activeRecord[h.name.trim()] = h.value ?? ''
      }
    }

    onSyncHeaders?.(activeRecord)

    // Notify main-world network interceptor via window.postMessage
    try {
      window.postMessage(
        {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncGlobalHeaders',
          headers: activeRecord,
        },
        '*',
      )
    } catch {
      // ignore
    }
  }

  function getActiveCount(): number {
    return currentHeaders.filter((h) => h.enabled && h.name.trim()).length
  }

  function updateHeaderButton(): void {
    const btn = doc.querySelector<HTMLButtonElement>(`.${BTN_CLASS}`)
    if (!btn) return

    const activeCount = getActiveCount()
    if (activeCount > 0) {
      btn.innerHTML = `${SVG_ICONS.globe}<span>Headers</span><span class="oac-gh-count-badge">${activeCount}</span>`
      btn.title = `${activeCount} global header(s) active - click to configure`
    } else {
      btn.innerHTML = `${SVG_ICONS.globe}<span>Headers</span>`
      btn.title = 'Configure global debug headers automatically injected into outgoing requests'
    }
  }

  function renderRows(): void {
    const listEl = modalEl?.querySelector<HTMLElement>('.oac-gh-list')
    const statusEl = modalEl?.querySelector<HTMLElement>('.oac-gh-status-info')
    if (!listEl) return

    if (statusEl) {
      const activeCount = getActiveCount()
      statusEl.textContent = activeCount === 1 ? '1 active header' : `${activeCount} active headers`
    }

    if (currentHeaders.length === 0) {
      listEl.innerHTML = `<div class="oac-gh-empty">No global headers configured. Click "+ Add Header" or a preset above to create one.</div>`
      return
    }

    listEl.innerHTML = ''
    currentHeaders.forEach((item, idx) => {
      const row = doc.createElement('div')
      row.className = 'oac-gh-row'

      const checkbox = doc.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'oac-gh-toggle'
      checkbox.checked = Boolean(item.enabled)
      checkbox.title = item.enabled ? 'Enabled - uncheck to disable' : 'Disabled - check to enable'
      checkbox.addEventListener('change', () => {
        item.enabled = checkbox.checked
        updateHeaderButton()
        if (statusEl) {
          const count = getActiveCount()
          statusEl.textContent = count === 1 ? '1 active header' : `${count} active headers`
        }
      })

      const nameInput = doc.createElement('input')
      nameInput.type = 'text'
      nameInput.className = 'oac-gh-input-name'
      nameInput.placeholder = 'Header Name'
      nameInput.value = item.name
      nameInput.addEventListener('input', () => {
        item.name = nameInput.value
      })

      const valInput = doc.createElement('input')
      valInput.type = 'text'
      valInput.className = 'oac-gh-input-value'
      valInput.placeholder = 'Header Value (supports {{VAR}})'
      valInput.value = item.value
      valInput.addEventListener('input', () => {
        item.value = valInput.value
      })

      const delBtn = doc.createElement('button')
      delBtn.type = 'button'
      delBtn.className = 'oac-gh-del-btn'
      delBtn.title = 'Remove header'
      delBtn.innerHTML = SVG_ICONS.trash
      delBtn.addEventListener('click', () => {
        currentHeaders.splice(idx, 1)
        renderRows()
        updateHeaderButton()
      })

      row.appendChild(checkbox)
      row.appendChild(nameInput)
      row.appendChild(valInput)
      row.appendChild(delBtn)
      listEl.appendChild(row)
    })
  }

  function ensureModal(): HTMLElement {
    if (modalEl && modalEl.isConnected) return modalEl

    modalEl = doc.createElement('div')
    modalEl.id = MODAL_ID
    modalEl.className = 'oac-hidden'

    const card = doc.createElement('div')
    card.className = 'oac-gh-modal-card'

    // Header
    const header = doc.createElement('div')
    header.className = 'oac-gh-modal-header'
    header.innerHTML = `
      <div class="oac-gh-modal-title-wrap">
        <span style="color: #3b82f6; display: inline-flex;">${SVG_ICONS.globe}</span>
        <h3 class="oac-gh-modal-title">Global Debug Headers</h3>
      </div>
      <button type="button" class="oac-gh-modal-close-btn" title="Close">${SVG_ICONS.close}</button>
    `

    // Body
    const body = doc.createElement('div')
    body.className = 'oac-gh-modal-body'

    const hint = doc.createElement('p')
    hint.className = 'oac-gh-hint'
    hint.textContent =
      'Configure global request headers automatically attached to all outgoing Swagger UI requests (fetch, XMLHttpRequest, and Swagger requestInterceptor). Supports variables like {{TOKEN}} or {{$uuid}}.'

    // Presets Bar
    const presetsBar = doc.createElement('div')
    presetsBar.className = 'oac-gh-presets-bar'
    presetsBar.innerHTML = `<span class="oac-gh-presets-label">Presets:</span>`

    COMMON_PRESETS.forEach((preset) => {
      const pBtn = doc.createElement('button')
      pBtn.type = 'button'
      pBtn.className = 'oac-gh-preset-btn'
      pBtn.title = preset.description
      pBtn.textContent = `+ ${preset.name}`
      pBtn.addEventListener('click', () => {
        currentHeaders.push({
          id: stableId('gh', preset.name, String(Date.now())),
          name: preset.name,
          value: preset.value,
          enabled: true,
          description: preset.description,
        })
        renderRows()
        updateHeaderButton()
      })
      presetsBar.appendChild(pBtn)
    })

    const listContainer = doc.createElement('div')
    listContainer.className = 'oac-gh-list'

    const addBtn = doc.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'oac-gh-add-btn'
    addBtn.innerHTML = `${SVG_ICONS.plus}<span>Add Header</span>`
    addBtn.addEventListener('click', () => {
      currentHeaders.push({
        id: stableId('gh', 'header', String(Date.now())),
        name: '',
        value: '',
        enabled: true,
      })
      renderRows()
      const lastInput = listContainer.querySelector<HTMLInputElement>('.oac-gh-row:last-child .oac-gh-input-name')
      lastInput?.focus()
    })

    body.appendChild(hint)
    body.appendChild(presetsBar)
    body.appendChild(listContainer)
    body.appendChild(addBtn)

    // Footer
    const footer = doc.createElement('div')
    footer.className = 'oac-gh-modal-footer'

    const statusSpan = doc.createElement('span')
    statusSpan.className = 'oac-gh-status-info'
    statusSpan.textContent = '0 active headers'

    const actionsWrap = doc.createElement('div')
    actionsWrap.className = 'oac-gh-footer-actions'

    const clearBtn = doc.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'oac-modal-btn oac-modal-btn-clear'
    clearBtn.textContent = 'Clear All'
    clearBtn.addEventListener('click', () => {
      currentHeaders = []
      renderRows()
      updateHeaderButton()
    })

    const cancelBtn = doc.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'oac-modal-btn oac-modal-btn-cancel'
    cancelBtn.textContent = 'Cancel'
    cancelBtn.addEventListener('click', () => closeModal())

    const saveBtn = doc.createElement('button')
    saveBtn.type = 'button'
    saveBtn.className = 'oac-modal-btn oac-modal-btn-primary'
    saveBtn.innerHTML = `${SVG_ICONS.check}<span>Save & Apply</span>`
    saveBtn.addEventListener('click', async () => {
      const rows = listContainer.querySelectorAll('.oac-gh-row')
      const updatedList: GlobalHeaderItem[] = []
      rows.forEach((row, idx) => {
        const toggle = row.querySelector<HTMLInputElement>('.oac-gh-toggle')
        const nameInput = row.querySelector<HTMLInputElement>('.oac-gh-input-name')
        const valInput = row.querySelector<HTMLInputElement>('.oac-gh-input-value')
        const name = nameInput?.value.trim() ?? ''
        if (name) {
          updatedList.push({
            id: currentHeaders[idx]?.id || stableId('gh', name, String(idx)),
            name,
            value: valInput?.value ?? '',
            enabled: toggle ? toggle.checked : true,
          })
        }
      })
      currentHeaders = updatedList
      if (headersService) {
        await headersService.saveHeaders(currentHeaders)
      }
      updateHeaderButton()
      dispatchSync()
      closeModal()
    })

    actionsWrap.appendChild(clearBtn)
    actionsWrap.appendChild(cancelBtn)
    actionsWrap.appendChild(saveBtn)

    footer.appendChild(statusSpan)
    footer.appendChild(actionsWrap)

    card.appendChild(header)
    card.appendChild(body)
    card.appendChild(footer)
    modalEl.appendChild(card)
    doc.body.appendChild(modalEl)

    const closeBtn = header.querySelector('.oac-gh-modal-close-btn')
    closeBtn?.addEventListener('click', () => closeModal())

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal()
    })

    renderRows()
    return modalEl
  }

  function openModal(): void {
    const modal = ensureModal()
    modal.classList.remove('oac-hidden')
    renderRows()
  }

  function closeModal(): void {
    if (modalEl) {
      modalEl.classList.add('oac-hidden')
    }
  }

  function scanAndMount(root: ParentNode = doc): void {
    if (doc.querySelector(`.${BTN_CLASS}`)) return

    const infoEl = doc.querySelector('.swagger-ui .info')
    const infoContainer = doc.querySelector('.swagger-ui .information-container')
    const schemeContainer = doc.querySelector('.swagger-ui .scheme-container')
    const wrapper = doc.querySelector('.swagger-ui .wrapper')

    const anchor = infoEl ?? infoContainer ?? schemeContainer ?? wrapper
    if (!anchor) return

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = BTN_CLASS
    btn.title = 'Configure global debug headers automatically injected into outgoing requests'
    btn.innerHTML = `${SVG_ICONS.globe}<span>Headers</span>`
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      openModal()
    })

    let bar = doc.querySelector<HTMLElement>('.oac-header-actions-bar')
    if (!bar) {
      bar = doc.createElement('div')
      bar.className = 'oac-header-actions-bar'
      if (infoEl) {
        infoEl.appendChild(bar)
      } else if (infoContainer) {
        const block = infoContainer.querySelector('.block') ?? infoContainer
        block.appendChild(bar)
      } else if (schemeContainer) {
        schemeContainer.insertBefore(bar, schemeContainer.firstChild)
      } else if (wrapper) {
        wrapper.insertBefore(bar, wrapper.firstChild)
      }
    }

    bar.appendChild(btn)
    updateHeaderButton()
  }

  // MutationObserver for dynamic OpenAPI 3 rendering
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  const observer = new MutationObserver(() => {
    if (doc.querySelector(`.${BTN_CLASS}`)) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      scanAndMount()
    }, 100)
  })
  if (doc.body) {
    observer.observe(doc.body, { childList: true, subtree: true })
  }

  // Periodic startup retries for async spec loads
  const t1 = setTimeout(() => scanAndMount(), 300)
  const t2 = setTimeout(() => scanAndMount(), 800)
  const t3 = setTimeout(() => scanAndMount(), 2000)

  scanAndMount()

  return {
    openModal,
    closeModal,
    scanAndMount,
    dispose: () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      doc.getElementById(STYLE_ID)?.remove()
      doc.getElementById(MODAL_ID)?.remove()
      doc.querySelectorAll(`.${BTN_CLASS}`).forEach((el) => el.remove())
    },
  }
}
