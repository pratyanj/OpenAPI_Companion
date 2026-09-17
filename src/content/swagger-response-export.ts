/**
 * Swagger UI Direct Response Exporter (Point 10).
 *
 * Provides standalone 1-click export actions directly on rendered Swagger UI
 * response cells (.response-col_description), ensuring responses can be exported
 * as formatted JSON or RFC 4180 CSV even when the interactive tree viewer is disabled.
 *
 * Zero-emoji policy: Strictly uses clean inline SVG vector icons.
 */

import {
  jsonToCsv,
  sanitizeExportFilename,
  triggerDownload,
  isCsvExportable,
} from '@/utils/export-utils'

export interface SwaggerResponseExportHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-response-export-styles'
const ATTACHED_ATTR = 'data-oac-response-export-attached'

const SVG_ICONS = {
  download: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
}

const CSS_STYLES = `
/* Feature disable toggle */
body.oac-disable-response-export .oac-response-export-bar,
body.oac-disable-response-export .oac-resp-export-container,
body.oac-disable-response-export .oac-response-export-btn,
body.oac-disable-response-export .oac-resp-export-btn,
body.oac-disable-response-export .oac-fallback-export-btn {
  display: none !important;
}

/* Hide fallback export bar when interactive viewer is active to avoid duplicate controls */
body:not(.oac-disable-response-json-search) .oac-response-viewer-container ~ .oac-response-export-bar,
body:not(.oac-disable-response-json-search) .oac-has-viewer .oac-response-export-bar {
  display: none !important;
}

.swagger-ui .oac-response-export-bar,
.oac-response-export-bar {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin: 4px 0 6px 0 !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}

.swagger-ui .oac-fallback-export-btn,
.oac-fallback-export-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  height: 22px !important;
  padding: 0 8px !important;
  font-size: 10px !important;
  font-weight: 500 !important;
  color: #3b4151 !important;
  background: #ffffff !important;
  border: 1px solid #d9d9d9 !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  line-height: 1 !important;
  user-select: none !important;
  outline: none !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
}

.swagger-ui .oac-fallback-export-btn:hover:not(:disabled),
.oac-fallback-export-btn:hover:not(:disabled) {
  background: #f8fafc !important;
  border-color: #94a3b8 !important;
  color: #0f172a !important;
}

.swagger-ui .oac-fallback-export-btn:disabled,
.oac-fallback-export-btn:disabled {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
}

.swagger-ui .oac-fallback-export-btn.oac-exported,
.oac-fallback-export-btn.oac-exported {
  color: #15803d !important;
  background: #f0fdf4 !important;
  border-color: #86efac !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

function extractJsonFromCell(cell: HTMLElement): { parsed: unknown; rawText: string } | null {
  const codeEl = cell.querySelector('pre.microlight code, pre code, pre.microlight, pre')
  if (!codeEl) return null

  const rawText = (codeEl.textContent || '').trim()
  if (!rawText || (!rawText.startsWith('{') && !rawText.startsWith('['))) {
    return null
  }

  try {
    const parsed = JSON.parse(rawText)
    if (typeof parsed !== 'object' || parsed === null) return null
    return { parsed, rawText }
  } catch {
    return null
  }
}

function attachFallbackExportBar(cell: HTMLElement, doc: Document): boolean {
  if (cell.getAttribute(ATTACHED_ATTR) === 'true') return false

  const extracted = extractJsonFromCell(cell)
  if (!extracted) return false

  const { parsed } = extracted
  const bar = doc.createElement('div')
  bar.className = 'oac-response-export-bar'

  // JSON button
  const jsonBtn = doc.createElement('button')
  jsonBtn.type = 'button'
  jsonBtn.className = 'oac-fallback-export-btn'
  jsonBtn.title = 'Download response as formatted .json file'
  jsonBtn.innerHTML = `${SVG_ICONS.download} <span>JSON</span>`

  // CSV button
  const csvBtn = doc.createElement('button')
  csvBtn.type = 'button'
  csvBtn.className = 'oac-fallback-export-btn'
  csvBtn.title = 'Download response as RFC 4180 .csv file'
  csvBtn.innerHTML = `${SVG_ICONS.download} <span>CSV</span>`

  if (!isCsvExportable(parsed)) {
    csvBtn.disabled = true
    csvBtn.title = 'Requires array or object payload'
  }

  jsonBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    try {
      const opblock = cell.closest('.opblock')
      const method = opblock?.querySelector('.opblock-summary-method')?.textContent || 'response'
      const path =
        opblock?.querySelector('.opblock-summary-path a span, .opblock-summary-path span, .opblock-summary-path')?.textContent || ''
      const filename = sanitizeExportFilename(method, path, 'json')
      const jsonStr = JSON.stringify(parsed, null, 2)
      triggerDownload(filename, jsonStr, 'application/json', doc)

      jsonBtn.classList.add('oac-exported')
      jsonBtn.innerHTML = `${SVG_ICONS.check} <span>Exported!</span>`
      setTimeout(() => {
        jsonBtn.classList.remove('oac-exported')
        jsonBtn.innerHTML = `${SVG_ICONS.download} <span>JSON</span>`
      }, 1800)
    } catch (err) {
      console.warn('[OpenAPI Companion] Failed to export JSON:', err)
    }
  })

  csvBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    try {
      const { csv, error } = jsonToCsv(parsed)
      if (error || !csv) return

      const opblock = cell.closest('.opblock')
      const method = opblock?.querySelector('.opblock-summary-method')?.textContent || 'response'
      const path =
        opblock?.querySelector('.opblock-summary-path a span, .opblock-summary-path span, .opblock-summary-path')?.textContent || ''
      const filename = sanitizeExportFilename(method, path, 'csv')
      triggerDownload(filename, csv, 'text/csv;charset=utf-8;', doc)

      csvBtn.classList.add('oac-exported')
      csvBtn.innerHTML = `${SVG_ICONS.check} <span>Exported!</span>`
      setTimeout(() => {
        csvBtn.classList.remove('oac-exported')
        csvBtn.innerHTML = `${SVG_ICONS.download} <span>CSV</span>`
      }, 1800)
    } catch (err) {
      console.warn('[OpenAPI Companion] Failed to export CSV:', err)
    }
  })

  bar.appendChild(jsonBtn)
  bar.appendChild(csvBtn)

  // Insert before the highlight code container
  const highlightCode = cell.querySelector('.highlight-code, pre')
  if (highlightCode && highlightCode.parentNode) {
    highlightCode.parentNode.insertBefore(bar, highlightCode)
  } else {
    cell.appendChild(bar)
  }

  cell.setAttribute(ATTACHED_ATTR, 'true')
  return true
}

export function mountSwaggerResponseExport(doc: Document = document): SwaggerResponseExportHandle {
  ensureStyles(doc)

  const scanAndMount = (root: ParentNode = doc): number => {
    let count = 0
    const cells = root.querySelectorAll<HTMLElement>(
      '.response-col_description:not(.col_header), .live-responses-table .response-col_description, .responses-table .response-col_description',
    )
    cells.forEach((cell) => {
      if (attachFallbackExportBar(cell, doc)) {
        count++
      }
    })
    return count
  }

  scanAndMount()

  const onExecuteClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('.btn.execute')) {
      setTimeout(() => scanAndMount(), 300)
      setTimeout(() => scanAndMount(), 800)
      setTimeout(() => scanAndMount(), 1600)
    }
  }
  doc.addEventListener('click', onExecuteClick, true)

  const observer = new MutationObserver(() => {
    scanAndMount()
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
    dispose: () => {
      observer.disconnect()
      doc.removeEventListener('click', onExecuteClick, true)
      doc.querySelectorAll('.oac-response-export-bar').forEach((el) => el.remove())
      doc.querySelectorAll(`[${ATTACHED_ATTR}]`).forEach((el) => el.removeAttribute(ATTACHED_ATTR))
      const s = doc.getElementById(STYLE_ID)
      if (s) s.remove()
    },
  }
}
