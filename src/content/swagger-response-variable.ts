/**
 * Swagger UI 1-Click "Save Response Property to Variable" Integration.
 *
 * Attaches a sleek "⚡ Save to Variable" action button directly onto Swagger UI's rendered
 * response body DOM (.live-responses-table .response-col_description) so developers can
 * instantly persist tokens, IDs, and response properties into active Project Variables.
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
.oac-save-var-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  color: #2563eb;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 6px;
  margin-right: 6px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.4;
  outline: none;
  transition: all 0.15s ease;
  user-select: none;
  vertical-align: middle;
}

.oac-save-var-btn:hover {
  background: #dbeafe;
  border-color: #3b82f6;
  color: #1d4ed8;
}

.oac-save-var-btn:active {
  background: #bfdbfe;
}

.oac-save-var-btn.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
  color: #15803d !important;
}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/** Extracts clean response body text from a response cell, stripping buttons and svg controls. */
export function extractResponseBodyText(cell: Element): string | null {
  const pre = cell.querySelector(
    'pre, .microlight, .highlight-code pre, .highlight-code',
  )
  if (!pre) return null

  const clone = pre.cloneNode(true) as Element
  for (const control of Array.from(clone.querySelectorAll('button, .copy-to-clipboard, .download-contents, svg, .oac-save-var-btn'))) {
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
    if (cell.hasAttribute(ATTACHED_ATTR) || cell.querySelector('.oac-save-var-btn')) {
      cell.setAttribute(ATTACHED_ATTR, 'true')
      return
    }

    const pre = cell.querySelector('pre, .microlight')
    if (!pre) return

    cell.setAttribute(ATTACHED_ATTR, 'true')

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

    // Place the button inside .highlight-code if present, or before pre
    const highlight = cell.querySelector('.highlight-code')
    if (highlight) {
      highlight.insertBefore(btn, highlight.firstChild)
    } else {
      pre.parentElement?.insertBefore(btn, pre)
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
      if (!cell.hasAttribute(ATTACHED_ATTR)) {
        attachToResponseCell(cell)
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
      const buttons = doc.querySelectorAll('.oac-save-var-btn')
      buttons.forEach((b) => b.parentNode?.removeChild(b))
      const cells = doc.querySelectorAll(`[${ATTACHED_ATTR}]`)
      cells.forEach((c) => c.removeAttribute(ATTACHED_ATTR))
    },
  }
}
