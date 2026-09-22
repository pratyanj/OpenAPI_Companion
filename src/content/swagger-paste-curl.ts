/**
 * Swagger UI Paste cURL to Auto-Fill Integration (Point 12).
 *
 * Provides:
 * - A top-level "Paste cURL" button in Swagger UI header.
 * - Interactive modal with clipboard auto-read and real-time cURL parsing preview.
 * - OpenAPI path template matching (e.g. `/tasks/42` -> `/tasks/{task_id}`).
 * - 1-Click "Auto-Fill & Open": navigates to endpoint, activates Try-it-out,
 *   populates path params, query params, headers, and request body.
 * - Strict zero-emoji compliance: 100% inline SVG vector icons.
 * - Feature toggle support: `.oac-disable-paste-curl`.
 */

import { parseCurl, type ParsedCurl } from '@/utils/curl-parser'
import { matchEndpointFromCurl, type EndpointMatchResult } from '@/utils/endpoint-matcher'
import { openEndpoint } from '@/adapters/swagger/swagger-endpoint-dom'
import {
  writeRequestParameters,
  writeRequestBody,
  findAnyBlock,
} from '@/adapters/swagger/swagger-request-dom'
import type { ProductivityService } from '@/modules/productivity/productivity-service'
import type { EndpointListItem } from '@/modules/productivity/types'
import type { ShortcutActionId, ShortcutBinding } from '@/modules/shortcuts/types'
import { matchesShortcut } from '@/modules/shortcuts/shortcut-utils'

export interface SwaggerPasteCurlOptions {
  getBinding?: (action: ShortcutActionId) => ShortcutBinding | undefined
}

export interface SwaggerPasteCurlHandle {
  openModal(initialCurl?: string): void
  closeModal(): void
  scanAndMount(root?: ParentNode): void
  dispose(): void
}

const STYLE_ID = 'oac-paste-curl-styles'
const MODAL_ID = 'oac-paste-curl-modal'
const BTN_CLASS = 'oac-paste-curl-btn'

const SVG_ICONS = {
  clipboard: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  arrowRight: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`,
  code: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
}

const CSS_STYLES = `
/* Feature disable toggle */
body.oac-disable-paste-curl .oac-paste-curl-btn,
body.oac-disable-paste-curl #oac-paste-curl-modal {
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

/* Header Action Button (in Swagger UI top bar) */
.oac-paste-curl-btn {
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

.oac-paste-curl-btn:hover {
  background: var(--oac-btn-hover-bg, #f8fafc) !important;
  border-color: #3b82f6 !important;
  color: var(--oac-text, #1e293b) !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.15) !important;
}

.oac-paste-curl-btn svg {
  width: 14px !important;
  height: 14px !important;
  color: #3b82f6 !important;
  flex-shrink: 0 !important;
  display: inline-block !important;
  vertical-align: middle !important;
}

/* Modal Overlay & Backdrop */
#oac-paste-curl-modal {
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

#oac-paste-curl-modal.oac-hidden {
  display: none !important;
}

/* Modal Card Container */
.oac-paste-modal-card {
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
.oac-paste-modal-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 16px 20px !important;
  border-bottom: 1px solid #1e293b !important;
  background: #0f172a !important;
}

.oac-paste-modal-title-wrap {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
}

.oac-paste-modal-title {
  margin: 0 !important;
  font-size: 16px !important;
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: -0.01em !important;
}

.oac-paste-modal-close-btn {
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

.oac-paste-modal-close-btn:hover {
  background: #1e293b !important;
  color: #ffffff !important;
}

/* Modal Body */
.oac-paste-modal-body {
  padding: 20px !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 16px !important;
  background: #0f172a !important;
}

.oac-paste-modal-intro {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
}

.oac-paste-modal-hint {
  font-size: 12px !important;
  color: #94a3b8 !important;
  margin: 0 !important;
  line-height: 1.5 !important;
}

.oac-clipboard-read-btn {
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
  white-space: nowrap !important;
  transition: all 0.15s ease !important;
}

.oac-clipboard-read-btn:hover {
  background: #334155 !important;
  border-color: #475569 !important;
  color: #ffffff !important;
}

.oac-clipboard-read-btn svg {
  color: #3b82f6 !important;
}

/* Textarea styling matching workflow input */
.oac-paste-textarea {
  width: 100% !important;
  height: 110px !important;
  padding: 10px 14px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  color: #f8fafc !important;
  background: #162032 !important;
  border: 1px solid #334155 !important;
  border-radius: 6px !important;
  box-sizing: border-box !important;
  resize: vertical !important;
  outline: none !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease !important;
}

.oac-paste-textarea::placeholder {
  color: #64748b !important;
}

.oac-paste-textarea:focus {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
  background: #1a253c !important;
}

/* Live Preview Box */
.oac-paste-preview-box {
  background: #131d2e !important;
  border: 1px solid #1e293b !important;
  border-radius: 8px !important;
  padding: 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;
}

.oac-preview-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  flex-wrap: wrap !important;
}

.oac-preview-match-wrap {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 0 !important;
}

.oac-preview-method-badge {
  font-size: 10px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  padding: 3px 8px !important;
  border-radius: 4px !important;
  color: #ffffff !important;
  line-height: 1.2 !important;
  letter-spacing: 0.05em !important;
}

.oac-preview-method-badge.method-get { background: #2563eb !important; }
.oac-preview-method-badge.method-post { background: #16a34a !important; }
.oac-preview-method-badge.method-put { background: #d97706 !important; }
.oac-preview-method-badge.method-delete { background: #dc2626 !important; }
.oac-preview-method-badge.method-patch { background: #0891b2 !important; }
.oac-preview-method-badge.method-options,
.oac-preview-method-badge.method-head { background: #7c3aed !important; }

.oac-preview-status-badge {
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  padding: 3px 10px !important;
  border-radius: 9999px !important;
}

.oac-preview-status-badge.matched {
  background: rgba(34, 197, 94, 0.15) !important;
  border: 1px solid rgba(34, 197, 94, 0.3) !important;
  color: #4ade80 !important;
}

.oac-preview-status-badge.unmatched {
  background: rgba(245, 158, 11, 0.15) !important;
  border: 1px solid rgba(245, 158, 11, 0.3) !important;
  color: #fbbf24 !important;
}

.oac-preview-status-badge.empty {
  background: rgba(30, 41, 59, 0.8) !important;
  border: 1px solid #334155 !important;
  color: #94a3b8 !important;
}

.oac-preview-path-text {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  color: #f1f5f9 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.oac-preview-params-list {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 6px !important;
}

.oac-preview-param-chip {
  font-size: 11px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  background: #1e293b !important;
  border: 1px solid #334155 !important;
  border-radius: 4px !important;
  padding: 3px 8px !important;
  color: #93c5fd !important;
}

/* Headers Preview Box */
.oac-preview-headers-box {
  background: #090e1a !important;
  border: 1px solid #1e293b !important;
  border-radius: 6px !important;
  padding: 8px 12px !important;
  max-height: 120px !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 5px !important;
}

.oac-preview-header-row {
  display: flex !important;
  align-items: baseline !important;
  gap: 8px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 11px !important;
  line-height: 1.45 !important;
}

.oac-preview-header-key {
  color: #c084fc !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  flex-shrink: 0 !important;
}

.oac-preview-header-val {
  color: #f1f5f9 !important;
  word-break: break-all !important;
  user-select: text !important;
}

.oac-preview-section-title {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #94a3b8 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.05em !important;
}

.oac-preview-body-box {
  background: #090e1a !important;
  border: 1px solid #1e293b !important;
  color: #38bdf8 !important;
  padding: 10px 12px !important;
  border-radius: 6px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 11px !important;
  line-height: 1.45 !important;
  max-height: 120px !important;
  overflow-y: auto !important;
  white-space: pre !important;
  margin: 0 !important;
}

/* Footer Actions */
.oac-paste-modal-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 10px !important;
  padding: 14px 20px !important;
  background: #0f172a !important;
  border-top: 1px solid #1e293b !important;
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

.oac-modal-btn-primary:hover:not(:disabled) {
  background: #1d4ed8 !important;
  border-color: #1d4ed8 !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35) !important;
  transform: translateY(-1px) !important;
}

.oac-modal-btn-primary:disabled {
  background: #1e293b !important;
  border-color: #334155 !important;
  color: #64748b !important;
  opacity: 0.7 !important;
  cursor: not-allowed !important;
  transform: none !important;
  box-shadow: none !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

export function mountSwaggerPasteCurl(
  doc: Document = document,
  productivity?: ProductivityService,
  options?: SwaggerPasteCurlOptions,
): SwaggerPasteCurlHandle {
  ensureStyles(doc)

  let modalEl: HTMLElement | null = doc.getElementById(MODAL_ID)
  let currentParsed: ParsedCurl | null = null
  let currentMatch: EndpointMatchResult | null = null

  function getAvailableEndpoints(): EndpointListItem[] {
    try {
      if (productivity && typeof productivity.search === 'function') {
        return productivity.search('')
      }
    } catch {
      // ignore
    }
    // Fallback: enumerate from DOM directly
    const blocks = Array.from(doc.querySelectorAll('.opblock'))
    const list: EndpointListItem[] = []
    blocks.forEach((b) => {
      const method = b.querySelector('.opblock-summary-method')?.textContent?.trim().toLowerCase()
      const pathEl = b.querySelector('.opblock-summary-path')
      const path = pathEl?.getAttribute('data-path') ?? pathEl?.textContent?.trim()
      if (method && path) {
        list.push({
          endpointId: `${method} ${path}`,
          method,
          path,
          tags: [],
          favorite: false,
        })
      }
    })
    return list
  }

  /**
   * Builds the modal DOM tree if not already present.
   */
  function ensureModal(): HTMLElement {
    if (modalEl && modalEl.isConnected) return modalEl

    modalEl = doc.createElement('div')
    modalEl.id = MODAL_ID
    modalEl.className = 'oac-hidden'

    const card = doc.createElement('div')
    card.className = 'oac-paste-modal-card'

    // Header
    const header = doc.createElement('div')
    header.className = 'oac-paste-modal-header'
    header.innerHTML = `
      <div class="oac-paste-modal-title-wrap">
        <span style="color: #3b82f6; display: inline-flex;">${SVG_ICONS.clipboard}</span>
        <h3 class="oac-paste-modal-title">Paste cURL to Auto-Fill</h3>
      </div>
      <button type="button" class="oac-paste-modal-close-btn" title="Close">${SVG_ICONS.close}</button>
    `

    // Body
    const body = doc.createElement('div')
    body.className = 'oac-paste-modal-body'

    const intro = doc.createElement('div')
    intro.className = 'oac-paste-modal-intro'
    intro.innerHTML = `
      <p class="oac-paste-modal-hint">Paste your cURL command to navigate to the matching endpoint and auto-fill fields.</p>
      <button type="button" class="oac-clipboard-read-btn">${SVG_ICONS.clipboard} Paste from Clipboard</button>
    `

    const textarea = doc.createElement('textarea')
    textarea.className = 'oac-paste-textarea'
    textarea.placeholder = `curl -X POST "http://127.0.0.1:8008/tasks/" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title": "Sample Task", "completed": false}'`

    const previewBox = doc.createElement('div')
    previewBox.className = 'oac-paste-preview-box'

    body.appendChild(intro)
    body.appendChild(textarea)
    body.appendChild(previewBox)

    // Footer
    const footer = doc.createElement('div')
    footer.className = 'oac-paste-modal-footer'

    const clearBtn = doc.createElement('button')
    clearBtn.type = 'button'
    clearBtn.className = 'oac-modal-btn oac-modal-btn-clear'
    clearBtn.textContent = 'Clear'

    const cancelBtn = doc.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.className = 'oac-modal-btn oac-modal-btn-cancel'
    cancelBtn.textContent = 'Cancel'

    const autoFillBtn = doc.createElement('button')
    autoFillBtn.type = 'button'
    autoFillBtn.className = 'oac-modal-btn oac-modal-btn-primary'
    autoFillBtn.disabled = true
    autoFillBtn.innerHTML = `${SVG_ICONS.arrowRight} <span>Auto-Fill & Open</span>`

    footer.appendChild(clearBtn)
    footer.appendChild(cancelBtn)
    footer.appendChild(autoFillBtn)

    card.appendChild(header)
    card.appendChild(body)
    card.appendChild(footer)
    modalEl.appendChild(card)
    doc.body.appendChild(modalEl)

    // Event Listeners
    const closeBtn = header.querySelector('.oac-paste-modal-close-btn')
    closeBtn?.addEventListener('click', () => closeModal())
    cancelBtn.addEventListener('click', () => closeModal())

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal()
    })

    clearBtn.addEventListener('click', () => {
      textarea.value = ''
      updatePreview('')
    })

    const readClipBtn = intro.querySelector('.oac-clipboard-read-btn')
    readClipBtn?.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
          const text = await navigator.clipboard.readText()
          if (text) {
            textarea.value = text
            updatePreview(text)
          }
        }
      } catch (err) {
        console.warn('[OpenAPI Companion] Clipboard read unavailable:', err)
      }
    })

    textarea.addEventListener('input', () => {
      updatePreview(textarea.value)
    })

    autoFillBtn.addEventListener('click', () => {
      if (!currentParsed || !currentMatch) return
      executeAutoFill(currentParsed, currentMatch)
      closeModal()
    })

    updatePreview('')
    return modalEl
  }

  /**
   * Updates the live preview box inside the modal.
   */
  function updatePreview(rawCurl: string): void {
    const previewBox = modalEl?.querySelector<HTMLElement>('.oac-paste-preview-box')
    const autoFillBtn = modalEl?.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')
    if (!previewBox || !autoFillBtn) return

    const parsed = parseCurl(rawCurl)
    currentParsed = parsed

    if (!rawCurl.trim()) {
      currentMatch = null
      autoFillBtn.disabled = true
      previewBox.innerHTML = `
        <div class="oac-preview-header">
          <span class="oac-preview-status-badge empty">${SVG_ICONS.code} Waiting for cURL input...</span>
        </div>
      `
      return
    }

    const availableEndpoints = getAvailableEndpoints()
    const match = matchEndpointFromCurl(parsed, availableEndpoints)
    currentMatch = match

    const methodLower = (parsed.method || 'get').toLowerCase()

    let previewHtml = `
      <div class="oac-preview-header">
        <div class="oac-preview-match-wrap">
          <span class="oac-preview-method-badge method-${methodLower}">${parsed.method}</span>
          <span class="oac-preview-path-text">${parsed.path || parsed.url || '/'}</span>
        </div>
        ${
          match
            ? `<span class="oac-preview-status-badge matched">${SVG_ICONS.check} Matched: ${match.endpointId}</span>`
            : `<span class="oac-preview-status-badge unmatched">${SVG_ICONS.alert} No matching endpoint</span>`
        }
      </div>
    `

    // Parameter pills
    const paramChips: string[] = []
    if (match && Object.keys(match.pathParams).length > 0) {
      for (const [k, v] of Object.entries(match.pathParams)) {
        paramChips.push(`<span class="oac-preview-param-chip">Path: {${k}} = ${v}</span>`)
      }
    }
    if (Object.keys(parsed.queryParams).length > 0) {
      for (const [k, v] of Object.entries(parsed.queryParams)) {
        paramChips.push(`<span class="oac-preview-param-chip">Query: ${k} = ${v}</span>`)
      }
    }
    if (paramChips.length > 0) {
      previewHtml += `<div class="oac-preview-params-list">${paramChips.join('')}</div>`
    }

    // Headers preview showing every header key and its exact value
    const headerEntries = Object.entries(parsed.headers)
    if (headerEntries.length > 0) {
      const headerRows = headerEntries
        .map(
          ([k, v]) => `
        <div class="oac-preview-header-row" title="${escapeHtml(k)}: ${escapeHtml(v)}">
          <span class="oac-preview-header-key">${escapeHtml(k)}:</span>
          <span class="oac-preview-header-val">${escapeHtml(v)}</span>
        </div>
      `,
        )
        .join('')

      previewHtml += `
        <div class="oac-preview-section-title">Headers (${headerEntries.length}):</div>
        <div class="oac-preview-headers-box">${headerRows}</div>
      `
    }

    // Body preview
    if (parsed.formattedBody) {
      previewHtml += `
        <div class="oac-preview-section-title">Request Payload Preview:</div>
        <pre class="oac-preview-body-box">${escapeHtml(parsed.formattedBody)}</pre>
      `
    }

    previewBox.innerHTML = previewHtml
    autoFillBtn.disabled = !match
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * Automatically opens endpoint, enables Try-it-out, fills parameters and body.
   */
  function executeAutoFill(curl: ParsedCurl, match: EndpointMatchResult): boolean {
    const endpointId = match.endpointId
    openEndpoint(doc, endpointId)

    // Wait slightly for Swagger UI expansion and populate fields
    const performFill = () => {
      const block = findAnyBlock(doc, endpointId)
      if (!block) return

      // Click "Try it out" if present and not already active
      const tryOutBtn = block.querySelector<HTMLButtonElement>('.try-out__btn')
      if (tryOutBtn && !block.querySelector('.btn.execute')) {
        tryOutBtn.click()
      }

      // Populate Path and Query Parameters
      if (
        Object.keys(match.pathParams).length > 0 ||
        Object.keys(curl.queryParams).length > 0 ||
        Object.keys(curl.headers).length > 0
      ) {
        writeRequestParameters(doc, endpointId, {
          path: match.pathParams,
          query: curl.queryParams,
          headers: curl.headers,
        })
      }

      // Populate Request Body
      if (curl.formattedBody || curl.body) {
        const bodyContent = curl.formattedBody || curl.body || ''
        const wrote = writeRequestBody(doc, endpointId, bodyContent)
        if (!wrote) {
          let attempts = 0
          const pollInterval = setInterval(() => {
            attempts++
            if (writeRequestBody(doc, endpointId, bodyContent) || attempts >= 8) {
              clearInterval(pollInterval)
            }
          }, 80)
        }
      }

      // Apply pulse highlight animation
      block.classList.remove('oac-pulse-highlight')
      void (block as HTMLElement).offsetWidth
      block.classList.add('oac-pulse-highlight')
      setTimeout(() => block.classList.remove('oac-pulse-highlight'), 1600)
    }

    setTimeout(performFill, 80)
    setTimeout(performFill, 250)
    return true
  }

  function openModal(initialCurl?: string): void {
    const modal = ensureModal()
    modal.classList.remove('oac-hidden')
    const textarea = modal.querySelector<HTMLTextAreaElement>('.oac-paste-textarea')
    if (textarea) {
      if (initialCurl) {
        textarea.value = initialCurl
      }
      updatePreview(textarea.value)
      setTimeout(() => textarea.focus(), 50)
    }
  }

  function closeModal(): void {
    if (modalEl) {
      modalEl.classList.add('oac-hidden')
    }
  }

  /**
   * Injects the "Paste cURL" button into the Swagger UI header.
   */
  function scanAndMount(_root: ParentNode = doc): void {
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
    btn.title = 'Paste raw cURL to auto-fill operation parameters and body (Ctrl+Shift+V)'
    btn.innerHTML = `${SVG_ICONS.clipboard}<span>Paste cURL</span>`
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

    const headersBtn = bar.querySelector('.oac-global-headers-btn')
    if (headersBtn) {
      bar.insertBefore(btn, headersBtn)
    } else {
      bar.appendChild(btn)
    }
  }

  // Keyboard shortcut listener: paste cURL when not inside an active input
  const onKeyDown = (e: KeyboardEvent) => {
    const pasteBinding = options?.getBinding?.('pasteCurl.paste') || {
      key: 'v',
      ctrlOrCmd: true,
      shift: true,
    }
    if (matchesShortcut(pasteBinding, e)) {
      const activeTag = doc.activeElement?.tagName?.toLowerCase()
      if (activeTag !== 'input' && activeTag !== 'textarea') {
        e.preventDefault()
        openModal()
      }
    }
  }
  doc.addEventListener('keydown', onKeyDown)

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
      doc.removeEventListener('keydown', onKeyDown)
      doc.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove())
      if (modalEl) modalEl.remove()
      const s = doc.getElementById(STYLE_ID)
      if (s) s.remove()
    },
  }
}
