import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mountSwaggerTimingBenchmark,
  formatPayloadSize,
  getLatencyTier,
} from './swagger-timing-benchmark'

function createLiveResponseBlock(
  method: string,
  path: string,
  responseJson: string,
  status = 200,
): HTMLElement {
  const opblock = document.createElement('div')
  opblock.className = 'opblock is-open'
  opblock.innerHTML = `
    <div class="opblock-summary">
      <span class="opblock-summary-method">${method}</span>
      <span class="opblock-summary-path" data-path="${path}">${path}</span>
    </div>
    <button class="btn execute">Execute</button>
    <div class="responses-wrapper">
      <table class="live-responses-table">
        <tr class="response">
          <td class="response-col_status">${status}</td>
          <td class="response-col_description">
            <h5>Response body</h5>
            <div class="highlight-code">
              <pre class="microlight">${responseJson}</pre>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `
  return opblock
}

describe('swagger-timing-benchmark', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('formatPayloadSize formats bytes correctly into B, KB, and MB', () => {
    expect(formatPayloadSize(0)).toBe('0 B')
    expect(formatPayloadSize(450)).toBe('450 B')
    expect(formatPayloadSize(1024)).toBe('1.0 KB')
    expect(formatPayloadSize(4250)).toBe('4.2 KB')
    expect(formatPayloadSize(1500000)).toBe('1.43 MB')
  })

  it('getLatencyTier classifies latency into fast, moderate, and slow', () => {
    expect(getLatencyTier(120)).toBe('oac-fast')
    expect(getLatencyTier(299)).toBe('oac-fast')
    expect(getLatencyTier(300)).toBe('oac-moderate')
    expect(getLatencyTier(850)).toBe('oac-moderate')
    expect(getLatencyTier(1000)).toBe('oac-moderate')
    expect(getLatencyTier(1001)).toBe('oac-slow')
    expect(getLatencyTier(2500)).toBe('oac-slow')
  })

  it('mounts timing badge next to response status code with latency and size', () => {
    const block = createLiveResponseBlock('GET', '/api/users', '{"id":1,"name":"Alice"}', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerTimingBenchmark(document)

    // Simulate execute click 150ms ago
    const now = performance.now()
    handle.recordExecutionStart('get /api/users', now - 150)

    handle.scanAndMount()

    const statusCell = block.querySelector('.response-col_status:not(.col_header)')!
    const badge = statusCell.querySelector('.oac-timing-badge')
    expect(badge).not.toBeNull()
    expect(badge?.classList.contains('oac-fast')).toBe(true)
    expect(badge?.textContent).toMatch(/\d+\s*ms/)
    expect(badge?.textContent).toMatch(/B|KB/)

    handle.dispose()
  })

  it('intercepts native Execute button click to record start time', () => {
    const block = createLiveResponseBlock('POST', '/api/tasks', '{"title":"Test"}', 201)
    document.body.appendChild(block)

    const handle = mountSwaggerTimingBenchmark(document)

    const execBtn = block.querySelector<HTMLButtonElement>('.btn.execute')!
    execBtn.click()

    expect(block.dataset.oacExecStart).toBeDefined()

    handle.dispose()
  })

  it('cleans up timing badges on dispose', () => {
    const block = createLiveResponseBlock('GET', '/api/ping', 'pong', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerTimingBenchmark(document)
    handle.recordExecutionStart('get /api/ping', performance.now() - 50)
    handle.scanAndMount()

    expect(block.querySelector('.oac-timing-badge')).not.toBeNull()

    handle.dispose()
    expect(block.querySelector('.oac-timing-badge')).toBeNull()
  })
})
