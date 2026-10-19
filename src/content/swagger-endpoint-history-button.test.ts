import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ok } from '@/types'
import { EventBus } from '@/core/events'
import type { HistoryPanelService, HistoryRecord } from '@/modules/history'
import { mountSwaggerEndpointHistoryButton } from './swagger-endpoint-history-button'

function createOpblock(method: string, path: string): HTMLElement {
  const opblock = document.createElement('div')
  opblock.className = 'opblock is-open'
  opblock.innerHTML = `
    <div class="opblock-summary">
      <span class="opblock-summary-method">${method}</span>
      <span class="opblock-summary-path" data-path="${path}">${path}</span>
    </div>
    <div class="opblock-body">
      <div class="try-out">
        <button class="btn try-out__btn">Try it out</button>
      </div>
      <div class="parameters-container"></div>
    </div>
  `
  return opblock
}

const mockRecord: HistoryRecord = {
  id: 'h_1',
  endpointId: 'get /api/users',
  method: 'get',
  endpoint: '/api/users',
  status: 200,
  timestamp: Date.now(),
  environmentId: 'default',
}

describe('swagger-endpoint-history-button', () => {
  let bus: EventBus
  let mockHistoryService: HistoryPanelService

  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    bus = new EventBus()
    mockHistoryService = {
      list: vi.fn(async () => ok([mockRecord, { ...mockRecord, id: 'h_2' }])),
      get: vi.fn(async (id: string) => (id === 'h_1' ? ok(mockRecord) : ok(null))),
      replay: vi.fn(async () => ok(mockRecord)),
      locate: vi.fn(() => ok(undefined)),
      deleteEntry: vi.fn(async () => ok(undefined)),
      clearProject: vi.fn(async () => ok(undefined)),
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('mounts History button into .try-out toolbar with clock icon', async () => {
    const block = createOpblock('GET', '/api/users')
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    await vi.waitFor(() => {
      const btn = block.querySelector<HTMLButtonElement>('.oac-endpoint-history-btn')
      expect(btn).not.toBeNull()
      expect(btn?.textContent).toContain('History')
      expect(btn?.querySelector('.oac-history-btn-icon')).not.toBeNull()
    })

    handle.dispose()
  })

  it('displays count badge when previous calls exist for that endpoint', async () => {
    const block = createOpblock('GET', '/api/users')
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    // Wait for initial loadInitialCounts promise
    await vi.waitFor(() => {
      const badge = block.querySelector('.oac-history-count-badge')
      expect(badge).not.toBeNull()
      expect(badge?.textContent).toBe('2')
    })

    const btn = block.querySelector<HTMLButtonElement>('.oac-endpoint-history-btn')
    expect(btn?.title).toContain('2 past calls')

    handle.dispose()
  })

  it('omits button entirely when 0 calls exist for an endpoint, and appears on HISTORY_RECORDED', async () => {
    const block = createOpblock('POST', '/api/new-endpoint')
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    await vi.waitFor(() => {
      expect(mockHistoryService.list).toHaveBeenCalled()
    })

    // Initially 0 calls: button must NOT be rendered
    const btn = block.querySelector('.oac-endpoint-history-btn')
    expect(btn).toBeNull()

    // Now record an execution for this endpoint
    bus.publish('HISTORY_RECORDED', {
      recordId: 'h_new',
      endpointId: 'post /api/new-endpoint',
      status: 201,
    })

    // Button should now appear with count 1
    const newBtn = block.querySelector<HTMLButtonElement>('.oac-endpoint-history-btn')
    expect(newBtn).not.toBeNull()
    expect(newBtn?.textContent).toContain('History')
    expect(newBtn?.querySelector('.oac-history-count-badge')?.textContent).toBe('1')

    handle.dispose()
  })

  it('updates count badge dynamically on HISTORY_RECORDED and removes on HISTORY_CLEARED', async () => {
    const block = createOpblock('GET', '/api/users')
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    await vi.waitFor(() => {
      expect(block.querySelector('.oac-history-count-badge')?.textContent).toBe('2')
    })

    // Simulate new execution recorded for this endpoint
    bus.publish('HISTORY_RECORDED', {
      recordId: 'h_3',
      endpointId: 'get /api/users',
      status: 200,
    })

    expect(block.querySelector('.oac-history-count-badge')?.textContent).toBe('3')

    // Simulate history cleared
    bus.publish('HISTORY_CLEARED', { projectId: 'p1' })

    expect(block.querySelector('.oac-endpoint-history-btn')).toBeNull()

    handle.dispose()
  })

  it('triggers onOpenHistory with target endpointId when clicked', async () => {
    const block = createOpblock('GET', '/api/users')
    document.body.appendChild(block)

    const onOpenHistory = vi.fn()
    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document, {
      onOpenHistory,
    })

    await vi.waitFor(() => {
      expect(block.querySelector('.oac-endpoint-history-btn')).not.toBeNull()
    })

    const btn = block.querySelector<HTMLButtonElement>('.oac-endpoint-history-btn')!
    btn.click()

    expect(onOpenHistory).toHaveBeenCalledWith({
      endpointId: 'get /api/users',
    })

    handle.dispose()
  })

  it('cleans up all injected elements on dispose', async () => {
    const block = createOpblock('GET', '/api/users')
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)
    await vi.waitFor(() => {
      expect(block.querySelector('.oac-endpoint-history-btn')).not.toBeNull()
    })

    handle.dispose()
    expect(block.querySelector('.oac-endpoint-history-btn')).toBeNull()
  })

  it('places History button before native right-side controls (.authorization__btn and arrow) in .opblock-summary', async () => {
    const block = document.createElement('div')
    block.className = 'opblock'
    block.innerHTML = `
      <div class="opblock-summary">
        <span class="opblock-summary-method">GET</span>
        <span class="opblock-summary-path" data-path="/api/users">/api/users</span>
        <div class="opblock-summary-description">User listing</div>
        <a class="view-line-link" href="#/default/get_api_users"><span>Link</span></a>
        <button class="authorization__btn"><svg class="lock"></svg></button>
        <button class="opblock-control-arrow"><svg class="arrow"></svg></button>
      </div>
    `
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    await vi.waitFor(() => {
      expect(block.querySelector('.oac-endpoint-history-btn')).not.toBeNull()
    })

    const summary = block.querySelector('.opblock-summary')!
    const children = Array.from(summary.children)
    const historyBtn = block.querySelector('.oac-endpoint-history-btn')!
    const linkBtn = block.querySelector('.view-line-link')!
    const authBtn = block.querySelector('.authorization__btn')!
    const arrowBtn = block.querySelector('.opblock-control-arrow')!

    const historyIdx = children.indexOf(historyBtn)
    const linkIdx = children.indexOf(linkBtn)
    const authIdx = children.indexOf(authBtn)
    const arrowIdx = children.indexOf(arrowBtn)

    expect(historyIdx).toBeGreaterThan(-1)
    expect(historyIdx).toBeLessThan(linkIdx)
    expect(historyIdx).toBeLessThan(authIdx)
    expect(historyIdx).toBeLessThan(arrowIdx)

    // Ensure clicking History button does not bubble up to summary accordion
    let summaryClicked = 0
    summary.addEventListener('click', () => {
      summaryClicked++
    })

    historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(summaryClicked).toBe(0)

    handle.dispose()
  })

  it('places History button after opblock-summary-control and before right-side controls in Swagger UI 5.x DOM', async () => {
    const block = document.createElement('div')
    block.className = 'opblock opblock-get'
    block.innerHTML = `
      <div class="opblock-summary opblock-summary-get">
        <button class="opblock-summary-control" aria-expanded="false">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/api/users">
            <a class="nostyle" href="#/default/get_api_users"><span>/api/users</span></a>
          </span>
          <div class="opblock-summary-description">User listing</div>
        </button>
        <div class="copy-to-clipboard"><button>Copy</button></div>
        <button class="authorization__btn"><svg class="lock"></svg></button>
        <button class="opblock-control-arrow" aria-expanded="false"><svg class="arrow"></svg></button>
      </div>
    `
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistoryButton(mockHistoryService, bus, document)

    await vi.waitFor(() => {
      expect(block.querySelector('.oac-endpoint-history-btn')).not.toBeNull()
    })

    const summary = block.querySelector('.opblock-summary')!
    const children = Array.from(summary.children)
    const summaryControl = block.querySelector('.opblock-summary-control')!
    const historyBtn = block.querySelector('.oac-endpoint-history-btn')!
    const copyBtn = block.querySelector('.copy-to-clipboard')!
    const authBtn = block.querySelector('.authorization__btn')!
    const arrowBtn = block.querySelector('.opblock-control-arrow')!

    const controlIdx = children.indexOf(summaryControl)
    const historyIdx = children.indexOf(historyBtn)
    const copyIdx = children.indexOf(copyBtn)
    const authIdx = children.indexOf(authBtn)
    const arrowIdx = children.indexOf(arrowBtn)

    // History button MUST be AFTER opblock-summary-control (not before star/method!)
    expect(historyIdx).toBeGreaterThan(controlIdx)
    // History button MUST be BEFORE right-side controls (copy, lock, arrow)
    expect(historyIdx).toBeLessThan(copyIdx)
    expect(historyIdx).toBeLessThan(authIdx)
    expect(historyIdx).toBeLessThan(arrowIdx)

    handle.dispose()
  })
})
