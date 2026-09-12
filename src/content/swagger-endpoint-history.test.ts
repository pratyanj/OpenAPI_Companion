import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mountSwaggerEndpointHistory,
  type EndpointPayloadSnapshot,
} from './swagger-endpoint-history'

function createOpblockWithExecute(
  method: string,
  path: string,
  options: {
    body?: string
    params?: Array<{ name: string; in: 'path' | 'query' | 'header'; value: string }>
    withMockBar?: boolean
  } = {},
): HTMLElement {
  const div = document.createElement('div')
  div.className = 'opblock is-open'

  let paramsHtml = ''
  if (options.params && options.params.length > 0) {
    paramsHtml = `
      <table class="parameters">
        <tbody>
          ${options.params
            .map(
              (p) => `
            <tr data-param-name="${p.name}" data-param-in="${p.in}">
              <td class="parameter__name">${p.name}</td>
              <td class="parameter__in">(${p.in})</td>
              <td>
                <input class="parameter" data-param-name="${p.name}" value="${p.value}" />
              </td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `
  }

  let bodyHtml = ''
  if (options.body !== undefined) {
    bodyHtml = `
      <div class="body-param">
        ${
          options.withMockBar
            ? `<div class="oac-mock-data-bar"><div class="oac-body-btn-container"></div></div>`
            : ''
        }
        <textarea class="body-param__text">${options.body}</textarea>
      </div>
    `
  }

  div.innerHTML = `
    <div class="opblock-summary">
      <span class="opblock-summary-method">${method}</span>
      <span class="opblock-summary-path" data-path="${path}">${path}</span>
    </div>
    <div class="opblock-body">
      ${paramsHtml}
      ${bodyHtml}
      <div class="execute-wrapper">
        <button class="btn execute">Execute</button>
        <button class="btn btn-clear">Clear</button>
      </div>
    </div>
  `
  return div
}

describe('swagger-endpoint-history', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    localStorage.clear()
    vi.useRealTimers()
  })

  it('mounts and injects Last Payload button into execute-wrapper, hidden initially', () => {
    const block = createOpblockWithExecute('POST', '/api/todos', { body: '{"title":"Test"}' })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const btn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')
    expect(btn).not.toBeNull()
    expect(btn?.classList.contains('hidden')).toBe(true)
    expect(btn?.querySelector('svg')).not.toBeNull()
    expect(btn?.textContent).toContain('Last Payload')

    handle.dispose()
  })

  it('injects Last Payload button into .oac-mock-data-bar when bar is present', () => {
    const block = createOpblockWithExecute('POST', '/api/todos', {
      body: '{"title":"Test"}',
      withMockBar: true,
    })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const barBtn = block.querySelector<HTMLButtonElement>('.oac-last-payload-bar-btn')
    expect(barBtn).not.toBeNull()
    const group = barBtn?.closest('.oac-last-payload-group')
    expect(group?.classList.contains('hidden')).toBe(true)
    expect(barBtn?.querySelector('svg')).not.toBeNull()

    handle.dispose()
  })

  it('captures payload on Execute click, saves to storage, but keeps button hidden before refresh', () => {
    const block = createOpblockWithExecute('POST', '/api/todos', {
      body: '{"task":"Build feature"}',
      params: [{ name: 'project_id', in: 'query', value: '42' }],
      withMockBar: true,
    })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const execBtn = block.querySelector<HTMLButtonElement>('.btn.execute')!
    execBtn.click()

    // Payload is captured and stored
    const snapshot = handle.getLastPayload('post /api/todos')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.body).toBe('{"task":"Build feature"}')
    expect(snapshot?.query).toEqual({ project_id: '42' })
    expect(localStorage.getItem('oac_last_payload_post /api/todos')).toContain('Build feature')

    // Per user requirement: show button only AFTER refresh, NOT before!
    const btn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')!
    expect(btn.classList.contains('hidden')).toBe(true)

    const barGroup = block.querySelector<HTMLElement>('.oac-last-payload-group')!
    expect(barGroup.classList.contains('hidden')).toBe(true)

    handle.dispose()
  })

  it('shows Last Payload button after refresh when saved payload exists in storage', () => {
    // Simulate pre-existing saved payload from a previous session before refresh
    const saved: EndpointPayloadSnapshot = {
      endpointId: 'post /api/todos',
      body: '{"task":"Build feature"}',
      params: undefined,
      timestamp: Date.now() - 60000,
    }
    localStorage.setItem('oac_last_payload_post /api/todos', JSON.stringify(saved))

    // Page mounts (refresh) with empty inputs
    const block = createOpblockWithExecute('POST', '/api/todos', {
      body: '',
      withMockBar: true,
    })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const btn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')!
    expect(btn.classList.contains('hidden')).toBe(false)
    expect(btn.title).toContain('Last sent')

    const barGroup = block.querySelector<HTMLElement>('.oac-last-payload-group')!
    expect(barGroup.classList.contains('hidden')).toBe(false)

    handle.dispose()
  })

  it('after last payload adds value in request body, hides that button', () => {
    const saved: EndpointPayloadSnapshot = {
      endpointId: 'post /api/todos',
      body: '{"task":"Restored Value"}',
      query: { project_id: '10' },
      timestamp: Date.now() - 120000,
    }
    localStorage.setItem('oac_last_payload_post /api/todos', JSON.stringify(saved))

    const block = createOpblockWithExecute('POST', '/api/todos', {
      body: '',
      params: [{ name: 'project_id', in: 'query', value: '' }],
    })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const lastBtn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')!
    expect(lastBtn.classList.contains('hidden')).toBe(false)

    // Click Last Payload button to add value in request body
    lastBtn.click()

    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!
    const input = block.querySelector<HTMLInputElement>('input.parameter')!
    expect(textarea.value).toBe('{"task":"Restored Value"}')
    expect(input.value).toBe('10')

    // Flashes brief Restored feedback
    expect(lastBtn.classList.contains('success')).toBe(true)
    expect(lastBtn.textContent).toContain('Restored')

    // After adding value, the button is hidden!
    vi.advanceTimersByTime(800)
    expect(lastBtn.classList.contains('hidden')).toBe(true)

    handle.dispose()
  })

  it('supports Alt+L keyboard shortcut after refresh to refill last payload', () => {
    const saved: EndpointPayloadSnapshot = {
      endpointId: 'post /api/todos',
      body: '{"task":"Shortcut test"}',
      timestamp: Date.now() - 5000,
    }
    localStorage.setItem('oac_last_payload_post /api/todos', JSON.stringify(saved))

    const block = createOpblockWithExecute('POST', '/api/todos', {
      body: '',
    })
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)

    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!
    textarea.focus()

    // Fire Alt+L
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'l', altKey: true, bubbles: true }),
    )

    expect(textarea.value).toBe('{"task":"Shortcut test"}')

    // Button hides after adding value
    const lastBtn = block.querySelector<HTMLButtonElement>('.oac-last-payload-btn')!
    vi.advanceTimersByTime(800)
    expect(lastBtn.classList.contains('hidden')).toBe(true)

    handle.dispose()
  })

  it('refill opens collapsed operation or activates Try it out if not active', () => {
    const block = document.createElement('div')
    block.className = 'opblock' // not open yet
    block.innerHTML = `
      <div class="opblock-summary opblock-summary-control">
        <span class="opblock-summary-method">PUT</span>
        <span class="opblock-summary-path" data-path="/api/item">/api/item</span>
      </div>
      <div class="opblock-body">
        <button class="try-out__btn">Try it out</button>
        <textarea class="body-param__text"></textarea>
      </div>
    `
    document.body.appendChild(block)

    const handle = mountSwaggerEndpointHistory(document)
    handle.savePayload({
      endpointId: 'put /api/item',
      body: '{"refilled":true}',
      timestamp: Date.now(),
    }, true)

    let tryOutClicked = false
    block.querySelector<HTMLButtonElement>('.try-out__btn')!.addEventListener('click', () => {
      tryOutClicked = true
    })

    let expandClicked = false
    block
      .querySelector<HTMLElement>('.opblock-summary-control')!
      .addEventListener('click', () => {
        expandClicked = true
        block.classList.add('is-open')
      })

    const success = handle.refillEndpoint('put /api/item')
    expect(success).toBe(true)
    expect(expandClicked).toBe(true)
    expect(tryOutClicked).toBe(true)
    expect(block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!.value).toBe(
      '{"refilled":true}',
    )

    handle.dispose()
  })
})
