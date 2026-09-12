import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mountSwaggerResponseVariable,
  extractResponseBodyText,
  isSuccessResponse,
} from './swagger-response-variable'
import type { SaveVariableModalHandle } from './save-variable-modal'

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
    <div class="responses-wrapper">
      <table class="live-responses-table">
        <tr class="response">
          <td class="response-col_status">${status}</td>
          <td class="response-col_description">
            <h5>Response body</h5>
            <div class="highlight-code">
              <button class="copy-to-clipboard">Copy</button>
              <pre class="microlight">${responseJson}</pre>
            </div>
          </td>
        </tr>
      </table>
    </div>
  `
  return opblock
}

describe('swagger-response-variable', () => {
  let mockModal: SaveVariableModalHandle

  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    mockModal = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false),
      themeRoot: document.createElement('div'),
      destroy: vi.fn(),
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('extractResponseBodyText cleans Swagger buttons and returns JSON text', () => {
    const block = createLiveResponseBlock('GET', '/api/users/1', '{"id":1,"name":"Alice"}', 200)
    document.body.appendChild(block)
    const cell = block.querySelector('.response-col_description')!

    const text = extractResponseBodyText(cell)
    expect(text).toBe('{"id":1,"name":"Alice"}')
  })

  it('isSuccessResponse correctly identifies 2xx vs 4xx/5xx responses', () => {
    const block200 = createLiveResponseBlock('GET', '/api/ok', '{}', 200)
    const block201 = createLiveResponseBlock('POST', '/api/created', '{}', 201)
    const block400 = createLiveResponseBlock('POST', '/api/bad', '{}', 400)
    const block500 = createLiveResponseBlock('GET', '/api/err', '{}', 500)

    expect(isSuccessResponse(block200.querySelector('.response-col_description')!)).toBe(true)
    expect(isSuccessResponse(block201.querySelector('.response-col_description')!)).toBe(true)
    expect(isSuccessResponse(block400.querySelector('.response-col_description')!)).toBe(false)
    expect(isSuccessResponse(block500.querySelector('.response-col_description')!)).toBe(false)
  })

  it('mounts Save to Variable button in response cell on 200 OK inside right-aligned action bar', () => {
    const block = createLiveResponseBlock('POST', '/api/login', '{"token":"xyz123"}', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseVariable(mockModal, document)

    const bar = block.querySelector('.oac-response-action-bar')
    expect(bar).not.toBeNull()

    const btn = bar?.querySelector<HTMLButtonElement>('.oac-save-var-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Save to Variable')

    handle.dispose()
  })

  it('does NOT mount button if API response failed (e.g. 500 Internal Server Error or 400)', () => {
    const block500 = createLiveResponseBlock('GET', '/api/todos', 'Internal Server Error', 500)
    document.body.appendChild(block500)

    const handle = mountSwaggerResponseVariable(mockModal, document)

    const btn = block500.querySelector('.oac-save-var-btn')
    expect(btn).toBeNull()

    handle.dispose()
  })

  it('removes button if response updates from 200 to 500', () => {
    const block = createLiveResponseBlock('POST', '/api/test', '{"id":1}', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseVariable(mockModal, document)
    expect(block.querySelector('.oac-save-var-btn')).not.toBeNull()

    // Simulate re-execution failure: status becomes 500
    block.querySelector('.response-col_status')!.textContent = '500'
    handle.scanAndMount()

    expect(block.querySelector('.oac-save-var-btn')).toBeNull()

    handle.dispose()
  })

  it('opens modal with responseBody and endpointId when clicked', () => {
    const jsonStr = '{"access_token":"token_abc","user_id":42}'
    const block = createLiveResponseBlock('POST', '/auth/login', jsonStr, 200)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseVariable(mockModal, document)
    const btn = block.querySelector<HTMLButtonElement>('.oac-save-var-btn')!

    btn.click()

    expect(mockModal.open).toHaveBeenCalledWith(
      expect.objectContaining({
        responseBody: jsonStr,
        endpointId: 'post /auth/login',
      }),
    )

    handle.dispose()
  })

  it('shows visual feedback when onSaved callback is called', () => {
    const block = createLiveResponseBlock('GET', '/profile', '{"name":"John"}', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseVariable(mockModal, document)
    const btn = block.querySelector<HTMLButtonElement>('.oac-save-var-btn')!

    btn.click()

    const openCall = (mockModal.open as any).mock.calls[0][0]
    expect(typeof openCall.onSaved).toBe('function')

    openCall.onSaved()

    expect(btn.classList.contains('success')).toBe(true)
    expect(btn.textContent).toContain('Saved')

    handle.dispose()
  })

  it('cleans up injected buttons on dispose', () => {
    const block = createLiveResponseBlock('GET', '/test', '{}', 200)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseVariable(mockModal, document)
    expect(block.querySelector('.oac-save-var-btn')).not.toBeNull()

    handle.dispose()
    expect(block.querySelector('.oac-save-var-btn')).toBeNull()
  })
})
