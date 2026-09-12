/**
 * Swagger UI 1-Click "Save Response Property to Variable" Integration.
 *
 * Attaches a sleek, compact "⚡ Save to Variable" action button directly onto Swagger UI's rendered
 * response body DOM (.live-responses-table .response-col_description) for successful 2xx responses,
 * positioned neatly on the right side with comfortable spacing.
 */
import { endpointIdOf } from '@/adapters/swagger/swagger-request-dom'
import type { SaveVariableModalHandle } from './save-variable-modal'

export interface SwaggerResponseVariableHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-response-var-styles'
const ATTACHED_ATTR = 'data-oac-save-var-attached'

const CSS_STYLES = `
.oac-response-action-bar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  width: 100%;
  margin-top: 4px;
  margin-bottom: 8px;
}

.oac-save-var-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.4;
  outline: none;
  transition: all 0.15s ease;
  user-select: none;
}

.oac-save-var-btn:hover {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1d4ed8;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.15);
}

.oac-save-var-btn:active {
  background: #bfdbfe;
}

.oac-save-var-btn.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
  color: #15803d !important;
}

.oac-save-var-icon {
  font-size: 10px;
  line-height: 1;
}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/** Determines if the live response cell corresponds to a successful 2xx HTTP response. */
export function isSuccessResponse(cell: Element): boolean {
  const row = cell.closest('tr') ?? cell.parentElement
  const statusEl =
    row?.querySelector('.response-col_status:not(.col_header), .response-col_status') ??
    cell.closest('.live-responses-table, .responses-table')?.querySelector('.response-col_status:not(.col_header)')
  const text = statusEl?.textContent?.trim()
  if (!text) return false
  const match = text.match(/\b([1-5]\d\d)\b/)
  if (!match) return false
  const code = parseInt(match[1], 10)
  return code >= 200 && code < 300
}

/** Extracts clean response body text from a response cell, stripping buttons and svg controls. */
export function extractResponseBodyText(cell: Element): string | null {
  const pre = cell.querySelector(
    'pre, .microlight, .highlight-code pre, .highlight-code',
  )
  if (!pre) return null

  const clone = pre.cloneNode(true) as Element
  for (const control of Array.from(clone.querySelectorAll('button, .copy-to-clipboard, .download-contents, svg, .oac-save-var-btn, .oac-response-action-bar'))) {
    control.remove()
  }
  return clone.textContent?.trim() || null
}

export function mountSwaggerResponseVariable(
  modal: SaveVariableModalHandle,
  doc: Document = document,
): SwaggerResponseVariableHandle {
  ensureStyles(doc)

  function attachToResponseCell(cell: Element): void {
    // If API failed (e.g. 500, 4xx), do NOT show the button and remove any prior one
    if (!isSuccessResponse(cell)) {
      const existingBar = cell.querySelector('.oac-response-action-bar')
      if (existingBar) existingBar.remove()
      cell.removeAttribute(ATTACHED_ATTR)
      return
    }

    if (cell.hasAttribute(ATTACHED_ATTR) || cell.querySelector('.oac-save-var-btn')) {
      cell.setAttribute(ATTACHED_ATTR, 'true')
      return
    }

    const pre = cell.querySelector('pre, .microlight')
    if (!pre) return

    cell.setAttribute(ATTACHED_ATTR, 'true')

    const bar = doc.createElement('div')
    bar.className = 'oac-response-action-bar'

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'oac-save-var-btn'
    btn.title = 'Save response property to project variable'
    btn.innerHTML = `
      <span class="oac-save-var-icon">⚡</span>
      <span class="oac-save-var-label">Save to Variable</span>
    `

    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      const rawBody = extractResponseBodyText(cell)
      if (!rawBody) return

      const block = cell.closest('.opblock')
      const endpointId = block ? endpointIdOf(block) : undefined

      // Check if user selected text in the response
      let selectedText: string | undefined
      try {
        const selection = doc.getSelection()?.toString().trim()
        if (selection && rawBody.includes(selection)) {
          selectedText = selection
        }
      } catch {
        /* ignore */
      }

      modal.open({
        responseBody: rawBody,
        endpointId,
        initialValue: selectedText,
        onSaved: () => {
          btn.classList.add('success')
          const label = btn.querySelector('.oac-save-var-label')
          if (label) label.textContent = 'Saved ✓'
          setTimeout(() => {
            btn.classList.remove('success')
            if (label) label.textContent = 'Save to Variable'
          }, 1800)
        },
      })
    })

    bar.appendChild(btn)

    // Place the action bar above .highlight-code or pre with spacing
    const highlight = cell.querySelector('.highlight-code')
    if (highlight) {
      highlight.parentElement?.insertBefore(bar, highlight)
    } else {
      pre.parentElement?.insertBefore(bar, pre)
    }
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
      if (cell.querySelector('.oac-save-var-btn')) {
        count++
      }
    }
    return count
  }

  // Observe dynamically mounted live responses
  const observer = new MutationObserver(() => {
    scanAndMount()
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  // Initial scan
  scanAndMount()

  return {
    scanAndMount,
    dispose(): void {
      observer.disconnect()
      const bars = doc.querySelectorAll('.oac-response-action-bar, .oac-save-var-btn')
      bars.forEach((b) => b.parentNode?.removeChild(b))
      const cells = doc.querySelectorAll(`[${ATTACHED_ATTR}]`)
      cells.forEach((c) => c.removeAttribute(ATTACHED_ATTR))
    },
  }
}
