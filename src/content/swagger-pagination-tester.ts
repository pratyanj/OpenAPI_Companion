/**
 * In-Page Swagger Pagination Tester Button Integration.
 *
 * Injects a compact, accessible [Test Pagination] button into Swagger UI operation
 * blocks that have query parameters or detected pagination schemes, opening the
 * interactive PaginationTesterModal.
 */

import { endpointIdOf, readParametersFromBlock } from '@/adapters/swagger/swagger-request-dom'
import { detectPagination, type ParameterInfo } from '@/modules/pagination/detector'
import type { PaginationModalHandle } from './pagination-modal'

export interface SwaggerPaginationTesterHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-pagination-tester-styles'
const ATTACHED_ATTR = 'data-oac-pagination-attached'

const SVG_ICONS = {
  pagination: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path><path d="M6 14h6"></path></svg>`,
}

const CSS_STYLES = `
/* Feature toggle in Config */
body.oac-disable-pagination-tester .oac-pagination-btn {
  display: none !important;
}

.oac-pagination-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  height: 26px !important;
  padding: 0 10px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: var(--oac-btn-text, #2563eb) !important;
  background: var(--oac-btn-bg, #eff6ff) !important;
  border: 1px solid var(--oac-btn-border, #bfdbfe) !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  line-height: 1 !important;
  transition: all 0.15s ease !important;
  user-select: none !important;
  outline: none !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  vertical-align: middle !important;
  margin-left: 8px !important;
}

.oac-pagination-btn:hover {
  background: #dbeafe !important;
  border-color: #3b82f6 !important;
  color: #1d4ed8 !important;
  box-shadow: 0 2px 4px rgba(59, 130, 246, 0.15) !important;
}

.oac-pagination-btn:active {
  background: #bfdbfe !important;
}

.oac-pagination-icon {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: currentColor !important;
}

.oac-pagination-icon svg {
  display: block !important;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  ;(doc.head || doc.documentElement).appendChild(style)
}

function parseParametersFromBlock(block: Element): ParameterInfo[] {
  const rows = Array.from(
    block.querySelectorAll('tr[data-param-name], table.parameters tr, .parameters-container tr'),
  )

  const params: ParameterInfo[] = []
  for (const row of rows) {
    const rawName =
      row.getAttribute('data-param-name') ??
      row
        .querySelector('.parameter__name')
        ?.textContent?.trim()
        .replace(/\s*\*\s*$/, '')
    if (!rawName) continue

    const rawIn =
      row.getAttribute('data-param-in') ??
      row.querySelector('.parameter__in')?.textContent?.trim().replace(/[()]/g, '').toLowerCase()

    params.push({
      name: rawName,
      in: rawIn || 'query',
    })
  }

  return params
}

export function mountSwaggerPaginationTester(
  modal: PaginationModalHandle,
  doc: Document = document,
): SwaggerPaginationTesterHandle {
  ensureStyles(doc)

  function scanAndMount(root: ParentNode = doc): number {
    let mountedCount = 0

    // Collect candidate blocks from root, closest .opblock ancestor, and descendants
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
      // Check if button is already present and attached in the DOM
      if (block.querySelector('.oac-pagination-btn')) continue

      const endpointId = endpointIdOf(block)
      if (!endpointId) continue

      const method = endpointId.split(' ')[0]?.toUpperCase()
      const params = parseParametersFromBlock(block)
      const detected = detectPagination(params, endpointId)

      // Only mount on endpoints where pagination is detected or GET endpoints with query params
      const isCandidate =
        detected !== null || (method === 'GET' && params.some((p) => p.in === 'query'))
      if (!isCandidate) continue

      // Look for button container: Try-it-out wrapper, Parameters container, or Summary
      const tryOutWrapper =
        block.querySelector('.try-out') ??
        block.querySelector('.parameters-container') ??
        block.querySelector('.opblock-summary')

      if (!tryOutWrapper) continue

      block.setAttribute(ATTACHED_ATTR, 'true')

      const btn = doc.createElement('button')
      btn.type = 'button'
      btn.className = 'btn oac-pagination-btn'
      btn.title = 'Test pagination progression, record counts, and duplicate detection'
      btn.innerHTML = `
        <span class="oac-pagination-icon">${SVG_ICONS.pagination}</span>
        <span>Test Pagination</span>
      `

      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()

        const currentParams = readParametersFromBlock(block)
        modal.open({
          endpointId,
          detected,
          initialConfig: {
            strategy: detected?.strategy ?? 'page',
            baseQueryParams: currentParams.query,
            basePathParams: currentParams.path,
            baseHeaders: currentParams.headers,
          },
        })
      })

      tryOutWrapper.appendChild(btn)
      mountedCount++
    }

    return mountedCount
  }

  // Initial scan
  scanAndMount(doc)

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  // Watch for newly opened or rendered operation blocks and React DOM reconciliations
  const observer = new MutationObserver((mutations) => {
    let shouldScan = false
    for (const mut of mutations) {
      if (mut.type === 'childList') {
        for (let i = 0; i < mut.removedNodes.length; i++) {
          const node = mut.removedNodes[i] as HTMLElement
          if (
            node.nodeType === 1 &&
            (node.classList?.contains('oac-pagination-btn') ||
              node.querySelector?.('.oac-pagination-btn'))
          ) {
            shouldScan = true
            break
          }
        }
        if (mut.addedNodes.length > 0) {
          shouldScan = true
        }
      }
      if (shouldScan) break
    }

    if (!shouldScan) return

    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      scanAndMount(doc)
    }, 50)
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  return {
    scanAndMount,
    dispose: () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      observer.disconnect()
      doc.getElementById(STYLE_ID)?.remove()
      doc.querySelectorAll(`[${ATTACHED_ATTR}]`).forEach((el) => {
        el.removeAttribute(ATTACHED_ATTR)
        el.querySelectorAll('.oac-pagination-btn').forEach((b) => b.remove())
      })
    },
  }
}
