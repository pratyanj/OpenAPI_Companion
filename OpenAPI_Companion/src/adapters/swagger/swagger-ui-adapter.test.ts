import { describe, it, expect, afterEach, vi } from 'vitest'
import { SwaggerUiAdapter } from './swagger-ui-adapter'
import type { AuthBridge, AuthSnapshot } from '../types'

function mockBridge(over: Partial<AuthBridge> = {}): AuthBridge {
  return {
    getAuth: () => null,
    writeAuth: () => {},
    clearAuth: () => {},
    getSpecUrl: () => null,
    getVersion: () => null,
    ...over,
  }
}

describe('SwaggerUiAdapter — detection', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('detects via the #swagger-ui element', () => {
    document.body.innerHTML = '<div id="swagger-ui"></div>'
    expect(new SwaggerUiAdapter().detect()).toBe(true)
  })

  it('returns false on an unrelated page', () => {
    document.body.innerHTML = '<main>hello</main>'
    expect(new SwaggerUiAdapter().detect()).toBe(false)
  })

  it('reads the version from a script src when no bridge value', () => {
    const script = document.createElement('script')
    script.setAttribute(
      'src',
      'https://cdn.example.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js',
    )
    document.head.appendChild(script)
    expect(new SwaggerUiAdapter().version()).toBe('5.17.14')
  })

  it('prefers the bridge version and spec URL when present', () => {
    const adapter = new SwaggerUiAdapter(
      mockBridge({ getVersion: () => '4.19.1', getSpecUrl: () => 'https://api/openapi.json' }),
    )
    expect(adapter.version()).toBe('4.19.1')
    expect(adapter.specUrl()).toBe('https://api/openapi.json')
  })
})

describe('SwaggerUiAdapter — auth via bridge', () => {
  it('readAuth returns the bridge snapshot', () => {
    const snapshot: AuthSnapshot = { type: 'bearer', token: 't', schemeName: 'bearerAuth' }
    const adapter = new SwaggerUiAdapter(mockBridge({ getAuth: () => snapshot }))
    expect(adapter.readAuth()).toEqual(snapshot)
  })

  it('writeAuth relays to the bridge', () => {
    const writeAuth = vi.fn()
    const adapter = new SwaggerUiAdapter(mockBridge({ writeAuth }))
    const snapshot: AuthSnapshot = { type: 'apiKey', token: 'k', schemeName: 'ApiKeyAuth' }
    expect(adapter.writeAuth(snapshot).ok).toBe(true)
    expect(writeAuth).toHaveBeenCalledWith(snapshot)
  })

  it('clearAuth relays to the bridge', () => {
    const clearAuth = vi.fn()
    const adapter = new SwaggerUiAdapter(mockBridge({ clearAuth }))
    expect(adapter.clearAuth().ok).toBe(true)
    expect(clearAuth).toHaveBeenCalled()
  })

  it('fails auth read/write with no bridge', () => {
    const adapter = new SwaggerUiAdapter()
    expect(adapter.readAuth()).toBeNull()
    expect(adapter.writeAuth({ type: 'bearer', token: 't' }).ok).toBe(false)
    expect(adapter.clearAuth().ok).toBe(false)
  })
})

describe('SwaggerUiAdapter — stubs & observe', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reads no open requests on a bare page and fails to write to a missing operation', () => {
    const a = new SwaggerUiAdapter()
    expect(a.readOpenRequests()).toEqual([])
    expect(a.writeRequest('get /x', { endpointId: 'get /x', method: 'get', body: '{}' }).ok).toBe(
      false,
    )
  })

  it('replay auto-navigates a collapsed operation through to Execute', () => {
    vi.useFakeTimers()
    // Start collapsed; simulate Swagger's async re-renders as DOM mutations on
    // each click, and let the polling state machine advance via fake timers.
    document.body.innerHTML = `
      <div class="opblock">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/users">/users</span>
        </button>
      </div>`
    const block = document.querySelector('.opblock')!
    let executed = false
    block.querySelector('.opblock-summary-control')!.addEventListener('click', () => {
      block.classList.add('is-open')
      const tryOut = document.createElement('button')
      tryOut.className = 'try-out__btn'
      tryOut.addEventListener('click', () => {
        const ta = document.createElement('textarea')
        ta.className = 'body-param__text'
        block.appendChild(ta)
        const exec = document.createElement('button')
        exec.className = 'btn execute'
        exec.addEventListener('click', () => (executed = true))
        block.appendChild(exec)
      })
      block.appendChild(tryOut)
    })

    const result = new SwaggerUiAdapter().replay('post /users', '{"name":"x"}')
    expect(result.ok).toBe(true)

    vi.runAllTimers()
    expect(document.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!.value).toBe(
      '{"name":"x"}',
    )
    expect(executed).toBe(true)
    vi.useRealTimers()
  })

  it('replay fails when the endpoint is not on the page', () => {
    document.body.innerHTML = '<main>nothing</main>'
    expect(new SwaggerUiAdapter().replay('get /missing').ok).toBe(false)
  })

  it('observe() fires on DOM mutations and detaches on unsubscribe', async () => {
    document.body.innerHTML = '<div id="swagger-ui"></div>'
    const target = document.getElementById('swagger-ui') as HTMLElement
    const cb = vi.fn()
    const off = new SwaggerUiAdapter().observe(cb)

    target.appendChild(document.createElement('span'))
    await Promise.resolve()
    expect(cb).toHaveBeenCalled()

    off()
    cb.mockClear()
    target.appendChild(document.createElement('span'))
    await Promise.resolve()
    expect(cb).not.toHaveBeenCalled()
  })
})
