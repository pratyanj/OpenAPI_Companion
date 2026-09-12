/**
 * Swagger UI Response Latency & Timing Benchmark Integration (Point 3).
 *
 * Automatically benchmarks round-trip execution latency and payload size on every
 * Swagger Execute click, injecting an ultra-clean color-coded timing badge next to
 * the HTTP status code in the live response table (e.g. `200 OK • 142 ms • 4.2 KB`).
 */
import { endpointIdOf } from '@/adapters/swagger/swagger-request-dom'
import { extractResponseBodyText } from './swagger-response-variable'

export interface SwaggerTimingBenchmarkHandle {
  scanAndMount(root?: ParentNode): number
  recordExecutionStart(endpointId: string, timestamp?: number): void
  dispose(): void
}

const STYLE_ID = 'oac-timing-benchmark-styles'
const ATTACHED_ATTR = 'data-oac-timing-attached'

const CSS_STYLES = `
.oac-timing-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 2px 6px;
  font-size: 9.5px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  font-weight: 600;
  border-radius: 4px;
  user-select: none;
  line-height: 1.3;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.15s ease;
}

/* Fast (< 300ms) */
.oac-timing-badge.oac-fast {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

/* Moderate (300ms - 1000ms) */
.oac-timing-badge.oac-moderate {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde047;
}

/* Slow (> 1000ms) */
.oac-timing-badge.oac-slow {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

/* Neutral / Size Only */
.oac-timing-badge.oac-neutral {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.oac-timing-divider {
  opacity: 0.4;
  font-size: 8px;
}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/** Formats byte length into B, KB, or MB string. */
export function formatPayloadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Returns CSS tier class based on duration in milliseconds. */
export function getLatencyTier(durationMs: number): 'oac-fast' | 'oac-moderate' | 'oac-slow' {
  if (durationMs < 300) return 'oac-fast'
  if (durationMs <= 1000) return 'oac-moderate'
  return 'oac-slow'
}

export function mountSwaggerTimingBenchmark(doc: Document = document): SwaggerTimingBenchmarkHandle {
  ensureStyles(doc)

  const execStartTimes = new Map<string, number>()

  function recordExecutionStart(endpointId: string, timestamp = performance.now()): void {
    execStartTimes.set(endpointId, timestamp)
  }

  // Intercept Execute button clicks to record start time immediately
  const onExecuteClick = (e: Event): void => {
    const path = e.composedPath?.() ?? []
    const target = (path.length ? path : [e.target]).find(
      (node): node is Element =>
        node instanceof Element &&
        (node.matches('.btn.execute, .btn-execute, .execute') || Boolean(node.closest('.btn.execute, .btn-execute'))),
    )
    if (!target) return

    const block = target.closest('.opblock')
    if (block) {
      const endpointId = endpointIdOf(block)
      if (endpointId) {
        const now = performance.now()
        recordExecutionStart(endpointId, now)
        ;(block as HTMLElement).dataset.oacExecStart = String(now)
      }
    }
  }

  doc.addEventListener('click', onExecuteClick, true)

  function attachBadgeToStatusCell(statusCell: Element): void {
    const row = statusCell.closest('tr')
    if (!row) return

    const block = row.closest('.opblock')
    const endpointId = block ? endpointIdOf(block) : null

    // Determine duration
    let durationMs: number | null = null
    if (endpointId && execStartTimes.has(endpointId)) {
      const start = execStartTimes.get(endpointId)!
      durationMs = Math.max(1, Math.round(performance.now() - start))
      execStartTimes.delete(endpointId)
      row.setAttribute('data-oac-duration-ms', String(durationMs))
      if (block) delete (block as HTMLElement).dataset.oacExecStart
    } else if (block && (block as HTMLElement).dataset.oacExecStart) {
      const start = parseFloat((block as HTMLElement).dataset.oacExecStart!)
      durationMs = Math.max(1, Math.round(performance.now() - start))
      delete (block as HTMLElement).dataset.oacExecStart
      row.setAttribute('data-oac-duration-ms', String(durationMs))
    } else if (row.hasAttribute('data-oac-duration-ms')) {
      durationMs = parseInt(row.getAttribute('data-oac-duration-ms')!, 10)
    }

    // Determine payload size
    const descCell = row.querySelector('.response-col_description:not(.col_header)')
    let bytes = 0
    if (descCell) {
      const rawBody = extractResponseBodyText(descCell)
      if (rawBody) {
        bytes = new TextEncoder().encode(rawBody).length
      }
    }

    // If both duration and bytes are missing, nothing to badge yet
    if (durationMs == null && bytes === 0) return

    // Remove any previous badge in this cell to update
    const existing = statusCell.querySelector('.oac-timing-badge')
    if (existing) existing.remove()

    statusCell.setAttribute(ATTACHED_ATTR, 'true')

    const badge = doc.createElement('div')
    const tier = durationMs != null ? getLatencyTier(durationMs) : 'oac-neutral'
    badge.className = `oac-timing-badge ${tier}`
    badge.title = `Round-trip latency: ${durationMs != null ? `${durationMs} ms` : 'N/A'} • Payload size: ${formatPayloadSize(bytes)}`

    if (durationMs != null && bytes > 0) {
      badge.innerHTML = `
        <span>${durationMs} ms</span>
        <span class="oac-timing-divider">•</span>
        <span>${formatPayloadSize(bytes)}</span>
      `
    } else if (durationMs != null) {
      badge.innerHTML = `<span>${durationMs} ms</span>`
    } else {
      badge.innerHTML = `<span>${formatPayloadSize(bytes)}</span>`
    }

    statusCell.appendChild(badge)
  }

  function scanAndMount(root: ParentNode = doc): number {
    const statusCells = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.live-responses-table .response-col_status:not(.col_header), .responses-table.live-responses-table .response-col_status:not(.col_header)',
      ),
    )

    let count = 0
    for (const cell of statusCells) {
      attachBadgeToStatusCell(cell)
      if (cell.querySelector('.oac-timing-badge')) {
        count++
      }
    }
    return count
  }

  // Observe dynamically rendered response tables
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
    recordExecutionStart,
    dispose(): void {
      doc.removeEventListener('click', onExecuteClick, true)
      observer.disconnect()
      const badges = doc.querySelectorAll('.oac-timing-badge')
      badges.forEach((b) => b.parentNode?.removeChild(b))
      const cells = doc.querySelectorAll(`[${ATTACHED_ATTR}]`)
      cells.forEach((c) => c.removeAttribute(ATTACHED_ATTR))
    },
  }
}
