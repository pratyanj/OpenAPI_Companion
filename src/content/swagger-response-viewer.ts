/**
 * Swagger UI Response JSON Viewer & Interactive Tree with Real-Time Search.
 *
 * Automatically detects executed JSON response bodies in Swagger UI and mounts
 * an interactive, high-performance collapsible tree view with:
 * - Real-time keyword search across keys and values
 * - Match counter (e.g. 2 / 5 matches) and Prev/Next keyboard navigation (Enter / Shift+Enter)
 * - Auto-expansion of collapsed parent nodes when matches occur inside them
 * - Expand All and Collapse All toolbar actions
 * - Tree View vs Raw View switcher
 * - 1-Click "Copy JSON" with formatted 2-space indentation and checkmark feedback
 * - JSON path hover tooltips and 1-click path copy
 * - 100% inline SVG vector icons (strict zero-emoji policy)
 */

import {
  jsonToCsv,
  sanitizeExportFilename,
  triggerDownload,
  isCsvExportable,
} from '@/utils/export-utils'

export interface SwaggerResponseViewerHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-response-viewer-styles'
const ATTACHED_ATTR = 'data-oac-response-viewer-attached'

// Clean SVG Icons
const SVG_ICONS = {
  search: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`,
  clear: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  chevronUp: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>`,
  chevronDown: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  chevronRight: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`,
  expandAll: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`,
  collapseAll: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>`,
  copy: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
  check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  download: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
}

const CSS_STYLES = `
/* Feature disable toggle */
body.oac-disable-response-export .oac-resp-export-container {
  display: none !important;
}

.swagger-ui .oac-resp-export-container,
.oac-resp-export-container {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
}

.swagger-ui .oac-resp-export-dropdown,
.oac-resp-export-dropdown {
  position: absolute !important;
  top: calc(100% + 4px) !important;
  right: 0 !important;
  z-index: 99999 !important;
  min-width: 160px !important;
  background: #202224 !important;
  border: 1px solid #4a4d52 !important;
  border-radius: 5px !important;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45) !important;
  padding: 4px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  box-sizing: border-box !important;
}

.swagger-ui .oac-resp-export-dropdown.oac-hidden,
.oac-resp-export-dropdown.oac-hidden {
  display: none !important;
}

.swagger-ui .oac-resp-export-item,
.oac-resp-export-item {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  padding: 6px 9px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #e2e8f0 !important;
  border-radius: 4px !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer !important;
  text-align: left !important;
  box-sizing: border-box !important;
  transition: background 0.12s ease, color 0.12s ease !important;
}

.swagger-ui .oac-resp-export-item:hover:not(:disabled),
.oac-resp-export-item:hover:not(:disabled) {
  background: #2d3034 !important;
  color: #38bdf8 !important;
}

.swagger-ui .oac-resp-export-item:disabled,
.oac-resp-export-item:disabled {
  opacity: 0.4 !important;
  cursor: not-allowed !important;
}

.swagger-ui .oac-resp-export-badge,
.oac-resp-export-badge {
  font-size: 9px !important;
  font-weight: 600 !important;
  padding: 1px 5px !important;
  border-radius: 3px !important;
  background: #33363b !important;
  color: #94a3b8 !important;
  text-transform: uppercase !important;
}

body.oac-disable-response-json-search .oac-response-viewer-container {
  display: none !important;
}
body.oac-disable-response-json-search .oac-swagger-raw-hidden {
  display: block !important;
}

.swagger-ui .oac-response-viewer-container,
.oac-response-viewer-container {
  display: flex !important;
  flex-direction: column !important;
  width: 100% !important;
  box-sizing: border-box !important;
  margin: 8px 0 14px 0 !important;
  background: #292b2c !important; /* Matches Swagger native dark background */
  border: 1px solid #41444e !important;
  border-radius: 4px !important;
  overflow: hidden !important;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}

.swagger-ui .oac-response-viewer-toolbar,
.oac-response-viewer-toolbar {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 10px !important;
  padding: 7px 12px !important;
  background: #202224 !important; /* Dark toolbar header */
  border-bottom: 1px solid #383b40 !important;
  font-size: 11px !important;
  box-sizing: border-box !important;
  width: 100% !important;
}

.swagger-ui .oac-resp-toolbar-left,
.oac-resp-toolbar-left,
.swagger-ui .oac-resp-toolbar-right,
.oac-resp-toolbar-right {
  display: flex !important;
  align-items: center !important;
  flex-wrap: wrap !important;
  gap: 8px !important;
}

.swagger-ui .oac-resp-search-box,
.oac-resp-search-box {
  position: relative !important;
  display: inline-flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}

.swagger-ui .oac-resp-search-icon,
.oac-resp-search-icon {
  position: absolute !important;
  left: 10px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  color: #8c939d !important;
  pointer-events: none !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 14px !important;
  height: 14px !important;
  z-index: 2 !important;
}

.swagger-ui input.oac-resp-search-input,
.oac-resp-search-input {
  box-sizing: border-box !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 4px 28px 4px 34px !important;
  font-size: 11px !important;
  line-height: 1.4 !important;
  color: #f1f5f9 !important;
  background: #17191b !important;
  border: 1px solid #3e444c !important;
  border-radius: 4px !important;
  width: 250px !important;
  min-width: 240px !important;
  transition: all 0.15s ease !important;
  outline: none !important;
  margin: 0 !important;
}

.swagger-ui input.oac-resp-search-input:focus,
.oac-resp-search-input:focus {
  border-color: #60a5fa !important;
  box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.25) !important;
  width: 280px !important;
  background: #131517 !important;
}

.swagger-ui .oac-resp-search-clear,
.oac-resp-search-clear {
  position: absolute !important;
  right: 6px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  display: none;
  align-items: center !important;
  justify-content: center !important;
  width: 16px !important;
  height: 16px !important;
  padding: 0 !important;
  background: #33383f !important;
  border: none !important;
  border-radius: 50% !important;
  color: #94a3b8 !important;
  cursor: pointer !important;
  z-index: 2 !important;
}

.swagger-ui .oac-resp-search-clear:hover,
.oac-resp-search-clear:hover {
  background: #47505a !important;
  color: #f8fafc !important;
}

.swagger-ui .oac-resp-match-badge,
.oac-resp-match-badge {
  display: none;
  align-items: center !important;
  padding: 2px 7px !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  border-radius: 4px !important;
  background: #14324f !important;
  color: #38bdf8 !important;
  border: 1px solid #0284c7 !important;
  white-space: nowrap !important;
  height: 24px !important;
  box-sizing: border-box !important;
}

.swagger-ui .oac-resp-match-badge.no-match,
.oac-resp-match-badge.no-match {
  background: #451a1a !important;
  color: #f87171 !important;
  border-color: #ef4444 !important;
}

.swagger-ui .oac-resp-nav-btn,
.oac-resp-nav-btn,
.swagger-ui .oac-resp-tool-btn,
.oac-resp-tool-btn,
.swagger-ui .oac-resp-copy-btn,
.oac-resp-copy-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  height: 28px !important;
  min-height: 28px !important;
  padding: 3px 9px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #cbd5e1 !important;
  background: #33373d !important;
  border: 1px solid #484e57 !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  line-height: 1.2 !important;
  outline: none !important;
  transition: all 0.15s ease !important;
  user-select: none !important;
  white-space: nowrap !important;
  box-sizing: border-box !important;
  margin: 0 !important;
}

.swagger-ui .oac-resp-nav-btn:hover:not(:disabled),
.oac-resp-nav-btn:hover:not(:disabled),
.swagger-ui .oac-resp-tool-btn:hover,
.oac-resp-tool-btn:hover,
.swagger-ui .oac-resp-copy-btn:hover,
.oac-resp-copy-btn:hover {
  background: #3f454d !important;
  border-color: #64748b !important;
  color: #ffffff !important;
}

.swagger-ui .oac-resp-nav-btn:disabled,
.oac-resp-nav-btn:disabled {
  opacity: 0.35 !important;
  cursor: not-allowed !important;
}

.swagger-ui .oac-resp-copy-btn.copied,
.oac-resp-copy-btn.copied {
  background: #14532d !important;
  border-color: #22c55e !important;
  color: #86efac !important;
}

.swagger-ui .oac-resp-view-toggle,
.oac-resp-view-toggle {
  display: inline-flex !important;
  align-items: center !important;
  height: 28px !important;
  background: #17191b !important;
  border: 1px solid #3e444c !important;
  border-radius: 4px !important;
  padding: 2px !important;
  gap: 2px !important;
  box-sizing: border-box !important;
}

.swagger-ui .oac-resp-view-btn,
.oac-resp-view-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 22px !important;
  padding: 0 9px !important;
  font-size: 10px !important;
  font-weight: 600 !important;
  color: #94a3b8 !important;
  background: transparent !important;
  border: none !important;
  border-radius: 3px !important;
  cursor: pointer !important;
  outline: none !important;
  transition: all 0.15s ease !important;
  margin: 0 !important;
  white-space: nowrap !important;
}

.swagger-ui .oac-resp-view-btn.active,
.oac-resp-view-btn.active {
  background: #3b424c !important;
  color: #ffffff !important;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3) !important;
}

.oac-resp-tree-view {
  padding: 12px 16px;
  max-height: 520px;
  overflow: auto;
  font-family: 'Fira Code', 'JetBrains Mono', Consolas, Monaco, monospace;
  font-size: 12px;
  line-height: 1.55;
  background: #292b2c; /* Exact dark background matching Swagger UI */
  color: #f1f5f9;
}

.oac-tree-row {
  display: flex;
  align-items: baseline;
  white-space: pre-wrap;
  word-break: break-word;
}

.oac-tree-node {
  position: relative;
}

.oac-tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-right: 2px;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  padding: 0;
  border-radius: 2px;
  vertical-align: middle;
}

.oac-tree-toggle:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
}

.oac-tree-toggle-spacer {
  display: inline-block;
  width: 16px;
  flex-shrink: 0;
}

.oac-tree-key {
  color: #38bdf8; /* Bright cyan for keys on dark */
  font-weight: 500;
  cursor: pointer;
  border-radius: 2px;
  padding: 0 1px;
}

.oac-tree-key:hover {
  background: rgba(56, 189, 248, 0.15);
  text-decoration: underline;
}

.oac-tree-colon {
  color: #94a3b8;
  margin-right: 4px;
}

.oac-tree-summary {
  display: none;
  margin: 0 4px;
  padding: 0 6px;
  font-size: 10px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 3px;
  cursor: pointer;
  user-select: none;
}

.oac-tree-node.collapsed > .oac-tree-row .oac-tree-summary {
  display: inline-block;
}

.oac-tree-node.collapsed > .oac-tree-children {
  display: none !important;
}

.oac-tree-node.collapsed > .oac-tree-closing {
  display: none !important;
}

.oac-tree-children {
  margin-left: 14px;
  padding-left: 6px;
  border-left: 1px dashed rgba(255, 255, 255, 0.16);
}

.oac-tree-children:hover {
  border-left-color: rgba(255, 255, 255, 0.35);
}

/* Syntax Highlighting on Dark */
.oac-val-string {
  color: #4ade80; /* Emerald green */
}
.oac-val-number {
  color: #c084fc; /* Lavender purple */
}
.oac-val-boolean {
  color: #fb923c; /* Orange */
  font-weight: 600;
}
.oac-val-null {
  color: #94a3b8; /* Slate gray */
  font-style: italic;
}
.oac-tree-comma {
  color: #64748b;
}

/* Search Highlights */
.swagger-ui mark.oac-json-match,
mark.oac-json-match {
  background: #facc15 !important;
  color: #000000 !important;
  font-weight: 700 !important;
  border-radius: 2px !important;
  padding: 0 2px !important;
}

.swagger-ui mark.oac-json-match.active,
mark.oac-json-match.active {
  background: #f97316 !important;
  color: #ffffff !important;
  font-weight: 800 !important;
  box-shadow: 0 0 0 2px rgba(249, 115, 22, 0.7) !important;
}

.oac-swagger-raw-hidden {
  display: none !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/** Extracts clean response body text from a cell. */
export function extractRawJsonText(cell: Element): string | null {
  const pre = cell.querySelector('pre, .microlight, .highlight-code pre, .highlight-code')
  if (!pre) return null

  const clone = pre.cloneNode(true) as Element
  for (const control of Array.from(
    clone.querySelectorAll(
      'button, .copy-to-clipboard, .download-contents, svg, .oac-save-var-btn, .oac-response-action-bar, .oac-response-viewer-container',
    ),
  )) {
    control.remove()
  }
  const text = clone.textContent?.trim()
  return text || null
}

/** Escapes special regex characters in search string. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function mountSwaggerResponseViewer(doc: Document = document): SwaggerResponseViewerHandle {
  ensureStyles(doc)

  function attachToResponseCell(cell: Element): void {
    const rawText = extractRawJsonText(cell)
    if (!rawText) {
      const existingContainer = cell.querySelector('.oac-response-viewer-container')
      if (existingContainer) existingContainer.remove()
      const nativeCode = cell.querySelector('.oac-swagger-raw-hidden')
      if (nativeCode) nativeCode.classList.remove('oac-swagger-raw-hidden')
      cell.removeAttribute(ATTACHED_ATTR)
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(rawText)
    } catch {
      // Not valid JSON (e.g. HTML, plain text error, empty); keep native view
      const existingContainer = cell.querySelector('.oac-response-viewer-container')
      if (existingContainer) existingContainer.remove()
      const nativeCode = cell.querySelector('.oac-swagger-raw-hidden')
      if (nativeCode) nativeCode.classList.remove('oac-swagger-raw-hidden')
      cell.removeAttribute(ATTACHED_ATTR)
      return
    }

    // Check if container already exists and content changed
    const existingContainer = cell.querySelector<HTMLElement>('.oac-response-viewer-container')
    if (existingContainer) {
      const lastRaw = existingContainer.getAttribute('data-oac-last-raw')
      if (lastRaw === rawText) {
        return
      }
      existingContainer.setAttribute('data-oac-last-raw', rawText)
      const updateFn = (existingContainer as any).__oacUpdateResponse
      if (typeof updateFn === 'function') {
        updateFn(parsed, rawText)
        return
      }
    }

    // Identify native code container to hide/show
    const nativeCodeContainer =
      cell.querySelector<HTMLElement>('.highlight-code') ||
      cell.querySelector<HTMLElement>('pre.microlight') ||
      cell.querySelector<HTMLElement>('pre')
    if (!nativeCodeContainer) return

    cell.setAttribute(ATTACHED_ATTR, 'true')
    nativeCodeContainer.classList.add('oac-swagger-raw-hidden')

    // Create container
    const container = doc.createElement('div')
    container.className = 'oac-response-viewer-container'
    container.setAttribute('data-oac-last-raw', rawText)

    // --- TOOLBAR ---
    const toolbar = doc.createElement('div')
    toolbar.className = 'oac-response-viewer-toolbar'

    // Left side: Search & Match navigation
    const leftSide = doc.createElement('div')
    leftSide.className = 'oac-resp-toolbar-left'

    const searchBox = doc.createElement('div')
    searchBox.className = 'oac-resp-search-box'

    const searchIcon = doc.createElement('span')
    searchIcon.className = 'oac-resp-search-icon'
    searchIcon.innerHTML = SVG_ICONS.search

    const searchInput = doc.createElement('input')
    searchInput.type = 'text'
    searchInput.className = 'oac-resp-search-input'
    searchInput.placeholder = 'Search JSON (keys, values)...'
    searchInput.setAttribute('aria-label', 'Search Response JSON')

    const searchClear = doc.createElement('button')
    searchClear.type = 'button'
    searchClear.className = 'oac-resp-search-clear'
    searchClear.title = 'Clear search'
    searchClear.innerHTML = SVG_ICONS.clear

    searchBox.appendChild(searchIcon)
    searchBox.appendChild(searchInput)
    searchBox.appendChild(searchClear)

    const matchBadge = doc.createElement('span')
    matchBadge.className = 'oac-resp-match-badge'
    matchBadge.textContent = '0 / 0'

    const prevBtn = doc.createElement('button')
    prevBtn.type = 'button'
    prevBtn.className = 'oac-resp-nav-btn prev'
    prevBtn.title = 'Previous match (Shift+Enter)'
    prevBtn.innerHTML = `${SVG_ICONS.chevronUp} Prev`
    prevBtn.disabled = true

    const nextBtn = doc.createElement('button')
    nextBtn.type = 'button'
    nextBtn.className = 'oac-resp-nav-btn next'
    nextBtn.title = 'Next match (Enter)'
    nextBtn.innerHTML = `${SVG_ICONS.chevronDown} Next`
    nextBtn.disabled = true

    leftSide.appendChild(searchBox)
    leftSide.appendChild(matchBadge)
    leftSide.appendChild(prevBtn)
    leftSide.appendChild(nextBtn)

    // Right side: Expand/Collapse All, Tree/Raw toggle, Copy JSON
    const rightSide = doc.createElement('div')
    rightSide.className = 'oac-resp-toolbar-right'

    const expandAllBtn = doc.createElement('button')
    expandAllBtn.type = 'button'
    expandAllBtn.className = 'oac-resp-tool-btn'
    expandAllBtn.title = 'Expand all nodes'
    expandAllBtn.innerHTML = `${SVG_ICONS.expandAll} Expand All`

    const collapseAllBtn = doc.createElement('button')
    collapseAllBtn.type = 'button'
    collapseAllBtn.className = 'oac-resp-tool-btn'
    collapseAllBtn.title = 'Collapse all nodes'
    collapseAllBtn.innerHTML = `${SVG_ICONS.collapseAll} Collapse All`

    // View mode switch
    const viewToggle = doc.createElement('div')
    viewToggle.className = 'oac-resp-view-toggle'

    const treeViewBtn = doc.createElement('button')
    treeViewBtn.type = 'button'
    treeViewBtn.className = 'oac-resp-view-btn active'
    treeViewBtn.textContent = 'Tree'

    const rawViewBtn = doc.createElement('button')
    rawViewBtn.type = 'button'
    rawViewBtn.className = 'oac-resp-view-btn'
    rawViewBtn.textContent = 'Raw'

    viewToggle.appendChild(treeViewBtn)
    viewToggle.appendChild(rawViewBtn)

    // Copy JSON button
    const copyBtn = doc.createElement('button')
    copyBtn.type = 'button'
    copyBtn.className = 'oac-resp-copy-btn'
    copyBtn.title = 'Copy formatted JSON (2 spaces)'
    copyBtn.innerHTML = `${SVG_ICONS.copy} <span>Copy JSON</span>`

    rightSide.appendChild(expandAllBtn)
    rightSide.appendChild(collapseAllBtn)
    rightSide.appendChild(viewToggle)
    rightSide.appendChild(copyBtn)

    // Export Dropdown
    const exportContainer = doc.createElement('div')
    exportContainer.className = 'oac-resp-export-container'

    const exportBtn = doc.createElement('button')
    exportBtn.type = 'button'
    exportBtn.className = 'oac-resp-copy-btn oac-resp-export-btn'
    exportBtn.title = 'Export response as JSON or CSV file'
    exportBtn.innerHTML = `${SVG_ICONS.download} <span>Export</span> ${SVG_ICONS.chevronDown}`

    const exportDropdown = doc.createElement('div')
    exportDropdown.className = 'oac-resp-export-dropdown oac-hidden'

    const jsonExportItem = doc.createElement('button')
    jsonExportItem.type = 'button'
    jsonExportItem.className = 'oac-resp-export-item'
    jsonExportItem.innerHTML = `<span>Export JSON</span><span class="oac-resp-export-badge">.json</span>`

    const csvExportItem = doc.createElement('button')
    csvExportItem.type = 'button'
    csvExportItem.className = 'oac-resp-export-item'
    csvExportItem.innerHTML = `<span>Export CSV</span><span class="oac-resp-export-badge">.csv</span>`
    if (!isCsvExportable(parsed)) {
      csvExportItem.disabled = true
      csvExportItem.title = 'Requires array or object payload'
    }

    exportDropdown.appendChild(jsonExportItem)
    exportDropdown.appendChild(csvExportItem)
    exportContainer.appendChild(exportBtn)
    exportContainer.appendChild(exportDropdown)
    rightSide.appendChild(exportContainer)

    toolbar.appendChild(leftSide)
    toolbar.appendChild(rightSide)

    // --- TREE VIEW ---
    const treeView = doc.createElement('div')
    treeView.className = 'oac-resp-tree-view'

    // Build the tree nodes
    const rootNode = renderJsonNode(parsed, '', true, doc)
    treeView.appendChild(rootNode)

    // Method to dynamically update viewer when a new response arrives for the same endpoint
    ;(container as any).__oacUpdateResponse = (newParsed: unknown, newRawText: string) => {
      parsed = newParsed
      csvExportItem.disabled = !isCsvExportable(newParsed)
      csvExportItem.title = isCsvExportable(newParsed)
        ? 'Export as RFC 4180 CSV'
        : 'Requires array or object payload'
      treeView.innerHTML = ''
      const newRoot = renderJsonNode(newParsed, '', true, doc)
      treeView.appendChild(newRoot)
      updateMatchHighlighting(searchInput.value)
    }

    container.appendChild(toolbar)
    container.appendChild(treeView)

    // Insert container before nativeCodeContainer
    nativeCodeContainer.parentElement?.insertBefore(container, nativeCodeContainer)

    // --- VIEW MODE & SEARCH STATE ---
    let currentViewMode: 'tree' | 'raw' = 'tree'
    let matches: HTMLElement[] = []
    let currentMatchIndex = -1

    function clearAllMarks(): void {
      const treeMarks = treeView.querySelectorAll('mark.oac-json-match')
      for (const m of Array.from(treeMarks)) {
        const textNode = doc.createTextNode(m.textContent || '')
        m.replaceWith(textNode)
      }
      treeView.normalize()

      const rawMarks = nativeCodeContainer.querySelectorAll('mark.oac-json-match')
      for (const m of Array.from(rawMarks)) {
        const textNode = doc.createTextNode(m.textContent || '')
        m.replaceWith(textNode)
      }
      nativeCodeContainer.normalize()
    }

    function updateMatchHighlighting(query: string): void {
      const q = query.trim()
      clearAllMarks()

      matches = []
      currentMatchIndex = -1

      if (!q) {
        matchBadge.style.display = 'none'
        searchClear.style.display = 'none'
        prevBtn.disabled = true
        nextBtn.disabled = true
        return
      }

      searchClear.style.display = 'flex'
      const regex = new RegExp(`(${escapeRegex(q)})`, 'gi')

      if (currentViewMode === 'tree') {
        const targets = treeView.querySelectorAll<HTMLElement>('.oac-tree-key, .oac-tree-val')
        for (const target of Array.from(targets)) {
          const original = target.textContent || ''
          if (!regex.test(original)) continue

          // Auto-expand any collapsed ancestors
          let ancestor: HTMLElement | null = target.closest('.oac-tree-node')
          while (ancestor) {
            if (ancestor.classList.contains('collapsed')) {
              ancestor.classList.remove('collapsed')
              const toggle = ancestor.querySelector<HTMLButtonElement>(
                ':scope > .oac-tree-row > .oac-tree-toggle',
              )
              if (toggle) toggle.innerHTML = SVG_ICONS.chevronDown
            }
            ancestor = ancestor.parentElement?.closest('.oac-tree-node') || null
          }

          // Replace matched text with <mark>
          const parts = original.split(regex)
          target.innerHTML = ''
          for (const part of parts) {
            if (part.toLowerCase() === q.toLowerCase()) {
              const mark = doc.createElement('mark')
              mark.className = 'oac-json-match'
              mark.textContent = part
              target.appendChild(mark)
              matches.push(mark)
            } else if (part) {
              target.appendChild(doc.createTextNode(part))
            }
          }
        }
      } else {
        // Raw view search
        const rawTarget = nativeCodeContainer.querySelector('pre, code') || nativeCodeContainer
        const walker = doc.createTreeWalker(rawTarget, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (
              node.parentElement?.closest('button, .copy-to-clipboard, .download-contents, svg')
            ) {
              return NodeFilter.FILTER_REJECT
            }
            return NodeFilter.FILTER_ACCEPT
          },
        })
        const textNodes: Text[] = []
        let textNode: Node | null
        while ((textNode = walker.nextNode())) {
          textNodes.push(textNode as Text)
        }

        for (const tn of textNodes) {
          const original = tn.nodeValue || ''
          if (!regex.test(original)) continue

          const parts = original.split(regex)
          const frag = doc.createDocumentFragment()
          for (const part of parts) {
            if (part.toLowerCase() === q.toLowerCase()) {
              const mark = doc.createElement('mark')
              mark.className = 'oac-json-match'
              mark.textContent = part
              frag.appendChild(mark)
              matches.push(mark)
            } else if (part) {
              frag.appendChild(doc.createTextNode(part))
            }
          }
          tn.replaceWith(frag)
        }
      }

      const total = matches.length
      matchBadge.style.display = 'inline-flex'
      if (total > 0) {
        matchBadge.classList.remove('no-match')
        currentMatchIndex = 0
        setActiveMatch(currentMatchIndex)
        prevBtn.disabled = false
        nextBtn.disabled = false
      } else {
        matchBadge.classList.add('no-match')
        matchBadge.textContent = 'No matches'
        prevBtn.disabled = true
        nextBtn.disabled = true
      }
    }

    function setActiveMatch(index: number): void {
      if (matches.length === 0) return
      for (const m of matches) {
        m.classList.remove('active')
      }
      const active = matches[index]
      if (active) {
        active.classList.add('active')
        if (typeof active.scrollIntoView === 'function') {
          active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
        matchBadge.textContent = `${index + 1} / ${matches.length}`
      }
    }

    searchInput.addEventListener('input', () => {
      updateMatchHighlighting(searchInput.value)
    })

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        if (matches.length === 0) return
        if (e.shiftKey) {
          currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length
        } else {
          currentMatchIndex = (currentMatchIndex + 1) % matches.length
        }
        setActiveMatch(currentMatchIndex)
      } else if (e.key === 'Escape') {
        searchInput.value = ''
        updateMatchHighlighting('')
      }
    })

    prevBtn.addEventListener('click', () => {
      if (matches.length === 0) return
      currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length
      setActiveMatch(currentMatchIndex)
    })

    nextBtn.addEventListener('click', () => {
      if (matches.length === 0) return
      currentMatchIndex = (currentMatchIndex + 1) % matches.length
      setActiveMatch(currentMatchIndex)
    })

    searchClear.addEventListener('click', () => {
      searchInput.value = ''
      updateMatchHighlighting('')
      searchInput.focus()
    })

    // --- EXPAND / COLLAPSE ALL ---
    expandAllBtn.addEventListener('click', () => {
      const nodes = treeView.querySelectorAll<HTMLElement>('.oac-tree-node.collapsed')
      for (const node of Array.from(nodes)) {
        node.classList.remove('collapsed')
        const toggle = node.querySelector<HTMLButtonElement>(
          ':scope > .oac-tree-row > .oac-tree-toggle',
        )
        if (toggle) toggle.innerHTML = SVG_ICONS.chevronDown
      }
    })

    collapseAllBtn.addEventListener('click', () => {
      const nodes = treeView.querySelectorAll<HTMLElement>('.oac-tree-node')
      for (const node of Array.from(nodes)) {
        node.classList.add('collapsed')
        const toggle = node.querySelector<HTMLButtonElement>(
          ':scope > .oac-tree-row > .oac-tree-toggle',
        )
        if (toggle) toggle.innerHTML = SVG_ICONS.chevronRight
      }
    })

    // --- VIEW SWITCHER ---
    treeViewBtn.addEventListener('click', () => {
      currentViewMode = 'tree'
      treeViewBtn.classList.add('active')
      rawViewBtn.classList.remove('active')
      treeView.style.display = 'block'
      nativeCodeContainer.classList.add('oac-swagger-raw-hidden')
      // Show tree controls in Tree mode
      expandAllBtn.style.display = ''
      collapseAllBtn.style.display = ''
      // Refresh search in tree view
      updateMatchHighlighting(searchInput.value)
    })

    rawViewBtn.addEventListener('click', () => {
      currentViewMode = 'raw'
      rawViewBtn.classList.add('active')
      treeViewBtn.classList.remove('active')
      treeView.style.display = 'none'
      nativeCodeContainer.classList.remove('oac-swagger-raw-hidden')
      // Hide tree controls in Raw mode
      expandAllBtn.style.display = 'none'
      collapseAllBtn.style.display = 'none'
      // Refresh search in raw view
      updateMatchHighlighting(searchInput.value)
    })

    // --- EXPORT DROPDOWN & ACTIONS ---
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const isHidden = exportDropdown.classList.contains('oac-hidden')
      doc
        .querySelectorAll('.oac-resp-export-dropdown')
        .forEach((d) => d.classList.add('oac-hidden'))
      if (isHidden) {
        exportDropdown.classList.remove('oac-hidden')
      }
    })

    jsonExportItem.addEventListener('click', (e) => {
      e.stopPropagation()
      exportDropdown.classList.add('oac-hidden')
      try {
        const opblock = nativeCodeContainer.closest('.opblock')
        const method = opblock?.querySelector('.opblock-summary-method')?.textContent || 'response'
        const path =
          opblock?.querySelector(
            '.opblock-summary-path a span, .opblock-summary-path span, .opblock-summary-path',
          )?.textContent || ''
        const filename = sanitizeExportFilename(method, path, 'json')
        const jsonStr = JSON.stringify(parsed, null, 2)
        triggerDownload(filename, jsonStr, 'application/json', doc)

        exportBtn.classList.add('copied')
        exportBtn.innerHTML = `${SVG_ICONS.check} <span>Exported JSON!</span>`
        setTimeout(() => {
          exportBtn.classList.remove('copied')
          exportBtn.innerHTML = `${SVG_ICONS.download} <span>Export</span> ${SVG_ICONS.chevronDown}`
        }, 1800)
      } catch (err) {
        console.warn('[OpenAPI Companion] Failed to export JSON:', err)
      }
    })

    csvExportItem.addEventListener('click', (e) => {
      e.stopPropagation()
      exportDropdown.classList.add('oac-hidden')
      try {
        const { csv, error } = jsonToCsv(parsed)
        if (error || !csv) {
          exportBtn.innerHTML = `${SVG_ICONS.clear} <span>Cannot export CSV</span>`
          setTimeout(() => {
            exportBtn.innerHTML = `${SVG_ICONS.download} <span>Export</span> ${SVG_ICONS.chevronDown}`
          }, 1800)
          return
        }

        const opblock = nativeCodeContainer.closest('.opblock')
        const method = opblock?.querySelector('.opblock-summary-method')?.textContent || 'response'
        const path =
          opblock?.querySelector(
            '.opblock-summary-path a span, .opblock-summary-path span, .opblock-summary-path',
          )?.textContent || ''
        const filename = sanitizeExportFilename(method, path, 'csv')
        triggerDownload(filename, csv, 'text/csv;charset=utf-8;', doc)

        exportBtn.classList.add('copied')
        exportBtn.innerHTML = `${SVG_ICONS.check} <span>Exported CSV!</span>`
        setTimeout(() => {
          exportBtn.classList.remove('copied')
          exportBtn.innerHTML = `${SVG_ICONS.download} <span>Export</span> ${SVG_ICONS.chevronDown}`
        }, 1800)
      } catch (err) {
        console.warn('[OpenAPI Companion] Failed to export CSV:', err)
      }
    })

    // --- COPY FORMATTED JSON ---
    copyBtn.addEventListener('click', async () => {
      try {
        const formatted = JSON.stringify(parsed, null, 2)
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(formatted)
        }
        copyBtn.classList.add('copied')
        copyBtn.innerHTML = `${SVG_ICONS.check} <span>Copied!</span>`
        setTimeout(() => {
          copyBtn.classList.remove('copied')
          copyBtn.innerHTML = `${SVG_ICONS.copy} <span>Copy JSON</span>`
        }, 1800)
      } catch {
        /* ignore */
      }
    })
  }

  function scanAndMount(root: ParentNode = doc): number {
    const cells = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.response-col_description:not(.col_header), .live-responses-table .response-col_description, .responses-table .response-col_description',
      ),
    )

    let count = 0
    for (const cell of cells) {
      attachToResponseCell(cell)
      if (cell.querySelector('.oac-response-viewer-container')) {
        count++
      }
    }
    return count
  }

  const observer = new MutationObserver(() => {
    scanAndMount()
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  // Watch execute clicks to schedule rescans for async network returns
  const onExecuteClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest?.('.btn.execute, .btn-clear')) {
      setTimeout(() => scanAndMount(), 250)
      setTimeout(() => scanAndMount(), 700)
      setTimeout(() => scanAndMount(), 1500)
    }
  }
  // Dismiss export dropdown on outside click
  const onDocExportClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest('.oac-resp-export-container')) {
      doc
        .querySelectorAll('.oac-resp-export-dropdown')
        .forEach((d) => d.classList.add('oac-hidden'))
    }
  }
  doc.addEventListener('click', onDocExportClick)
  doc.addEventListener('click', onExecuteClick, true)

  scanAndMount()

  return {
    scanAndMount,
    dispose(): void {
      observer.disconnect()
      doc.removeEventListener('click', onExecuteClick, true)
      doc.removeEventListener('click', onDocExportClick)
      const containers = doc.querySelectorAll('.oac-response-viewer-container')
      containers.forEach((c) => c.remove())
      const hidden = doc.querySelectorAll('.oac-swagger-raw-hidden')
      hidden.forEach((h) => h.classList.remove('oac-swagger-raw-hidden'))
      const marks = doc.querySelectorAll('mark.oac-json-match')
      marks.forEach((m) => m.replaceWith(doc.createTextNode(m.textContent || '')))
      const cells = doc.querySelectorAll(`[${ATTACHED_ATTR}]`)
      cells.forEach((c) => c.removeAttribute(ATTACHED_ATTR))
    },
  }
}

/** Recursively renders an interactive JSON tree node. */
function renderJsonNode(
  value: unknown,
  key: string,
  isLast: boolean,
  doc: Document,
  path = '',
): HTMLElement {
  const node = doc.createElement('div')
  node.className = 'oac-tree-node'

  const row = doc.createElement('div')
  row.className = 'oac-tree-row'

  const currentPath = path ? (key ? `${path}.${key}` : path) : key

  if (value !== null && typeof value === 'object') {
    const isArray = Array.isArray(value)
    const entries = isArray ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
    const count = entries.length
    const openBrace = isArray ? '[' : '{'
    const closeBrace = isArray ? ']' : '}'
    const summaryText = isArray
      ? `${count} item${count === 1 ? '' : 's'}`
      : `${count} key${count === 1 ? '' : 's'}`

    // Toggle button
    const toggle = doc.createElement('button')
    toggle.type = 'button'
    toggle.className = 'oac-tree-toggle'
    toggle.title = 'Toggle node'
    toggle.innerHTML = SVG_ICONS.chevronDown

    toggle.addEventListener('click', (e) => {
      e.stopPropagation()
      const isCollapsed = node.classList.toggle('collapsed')
      toggle.innerHTML = isCollapsed ? SVG_ICONS.chevronRight : SVG_ICONS.chevronDown
    })

    row.appendChild(toggle)

    // Key if inside object
    if (key !== '') {
      const keySpan = doc.createElement('span')
      keySpan.className = 'oac-tree-key'
      keySpan.textContent = `"${key}"`
      keySpan.title = currentPath ? `Click to copy path: ${currentPath}` : ''
      keySpan.addEventListener('click', (e) => {
        e.stopPropagation()
        if (currentPath && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(currentPath)
        }
      })

      const colon = doc.createElement('span')
      colon.className = 'oac-tree-colon'
      colon.textContent = ': '

      row.appendChild(keySpan)
      row.appendChild(colon)
    }

    // Open brace
    const openSpan = doc.createElement('span')
    openSpan.textContent = openBrace
    row.appendChild(openSpan)

    // Summary badge when collapsed
    const summary = doc.createElement('span')
    summary.className = 'oac-tree-summary'
    summary.textContent = `... ${summaryText} ...`
    summary.addEventListener('click', (e) => {
      e.stopPropagation()
      node.classList.remove('collapsed')
      toggle.innerHTML = SVG_ICONS.chevronDown
    })
    row.appendChild(summary)

    node.appendChild(row)

    // Children
    if (count > 0) {
      const childrenContainer = doc.createElement('div')
      childrenContainer.className = 'oac-tree-children'

      entries.forEach(([k, v], idx) => {
        const itemPath = isArray ? `${currentPath}[${k}]` : currentPath
        const childNode = renderJsonNode(v, isArray ? '' : k, idx === count - 1, doc, itemPath)
        childrenContainer.appendChild(childNode)
      })

      node.appendChild(childrenContainer)
    }

    // Closing brace row
    const closingRow = doc.createElement('div')
    closingRow.className = 'oac-tree-row oac-tree-closing'

    const spacer = doc.createElement('span')
    spacer.className = 'oac-tree-toggle-spacer'
    closingRow.appendChild(spacer)

    const closeSpan = doc.createElement('span')
    closeSpan.textContent = isLast ? closeBrace : `${closeBrace},`
    closingRow.appendChild(closeSpan)

    node.appendChild(closingRow)
  } else {
    // Primitive value
    const spacer = doc.createElement('span')
    spacer.className = 'oac-tree-toggle-spacer'
    row.appendChild(spacer)

    if (key !== '') {
      const keySpan = doc.createElement('span')
      keySpan.className = 'oac-tree-key'
      keySpan.textContent = `"${key}"`
      keySpan.title = currentPath ? `Click to copy path: ${currentPath}` : ''
      keySpan.addEventListener('click', (e) => {
        e.stopPropagation()
        if (currentPath && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(currentPath)
        }
      })

      const colon = doc.createElement('span')
      colon.className = 'oac-tree-colon'
      colon.textContent = ': '

      row.appendChild(keySpan)
      row.appendChild(colon)
    }

    const valSpan = doc.createElement('span')
    valSpan.className = 'oac-tree-val'

    if (typeof value === 'string') {
      valSpan.classList.add('oac-val-string')
      valSpan.textContent = JSON.stringify(value)
    } else if (typeof value === 'number') {
      valSpan.classList.add('oac-val-number')
      valSpan.textContent = String(value)
    } else if (typeof value === 'boolean') {
      valSpan.classList.add('oac-val-boolean')
      valSpan.textContent = String(value)
    } else if (value === null) {
      valSpan.classList.add('oac-val-null')
      valSpan.textContent = 'null'
    } else {
      valSpan.textContent = String(value)
    }

    row.appendChild(valSpan)

    if (!isLast) {
      const comma = doc.createElement('span')
      comma.className = 'oac-tree-comma'
      comma.textContent = ','
      row.appendChild(comma)
    }

    node.appendChild(row)
  }

  return node
}
