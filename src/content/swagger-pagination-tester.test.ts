import {
  mountSwaggerPaginationTester,
  type SwaggerPaginationTesterHandle,
} from './swagger-pagination-tester'
import type { PaginationModalHandle } from './pagination-modal'

describe('Swagger Pagination Tester DOM', () => {
  let modalMock: PaginationModalHandle
  let handle: SwaggerPaginationTesterHandle

  beforeEach(() => {
    document.body.innerHTML = ''
    modalMock = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn().mockReturnValue(false),
      themeRoot: document.createElement('div'),
      destroy: vi.fn(),
    }
  })

  afterEach(() => {
    handle?.dispose()
  })

  it('injects Test Pagination button into operations with pagination parameters', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/api/users">/api/users</span>
        </div>
        <div class="opblock-body">
          <div class="try-out">
            <button class="try-out__btn">Try it out</button>
          </div>
          <table class="parameters">
            <tbody>
              <tr data-param-name="page" data-param-in="query">
                <td class="parameter__name">page</td>
                <td><input class="parameter" value="1" /></td>
              </tr>
              <tr data-param-name="limit" data-param-in="query">
                <td class="parameter__name">limit</td>
                <td><input class="parameter" value="20" /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `

    handle = mountSwaggerPaginationTester(modalMock, document)

    const btn = document.querySelector('.oac-pagination-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Test Pagination')

    // Click button
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(modalMock.open).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'get /api/users',
        detected: expect.objectContaining({
          strategy: 'page',
          pageParam: 'page',
          pageSizeParam: 'limit',
        }),
      }),
    )
  })

  it('does not inject into POST endpoints without pagination or query parameters', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/api/login">/api/login</span>
        </div>
        <div class="opblock-body">
          <div class="try-out">
            <button class="try-out__btn">Try it out</button>
          </div>
        </div>
      </div>
    `

    handle = mountSwaggerPaginationTester(modalMock, document)

    const btn = document.querySelector('.oac-pagination-btn')
    expect(btn).toBeNull()
  })

  it('injects button when an initially collapsed operation is expanded', () => {
    // Start collapsed without parameters or try-out
    document.body.innerHTML = `
      <div class="opblock" id="opblock-labels">
        <div class="opblock-summary">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/labels/">/labels/</span>
        </div>
      </div>
    `

    handle = mountSwaggerPaginationTester(modalMock, document)
    expect(document.querySelector('.oac-pagination-btn')).toBeNull()

    // Simulate Swagger UI expanding the accordion by inserting opblock-body
    const opblock = document.getElementById('opblock-labels')!
    const body = document.createElement('div')
    body.className = 'opblock-body'
    body.innerHTML = `
      <div class="try-out">
        <button class="try-out__btn">Try it out</button>
      </div>
      <table class="parameters">
        <tbody>
          <tr data-param-name="limit" data-param-in="query">
            <td class="parameter__name">limit</td>
          </tr>
          <tr data-param-name="offset" data-param-in="query">
            <td class="parameter__name">offset</td>
          </tr>
        </tbody>
      </table>
    `
    opblock.appendChild(body)

    // Run scan on the body container (simulating mutation target)
    handle.scanAndMount(body)

    const btn = document.querySelector('.oac-pagination-btn')
    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Test Pagination')
  })

  it('restores button when Swagger UI React re-renders try-out into Cancel', () => {
    document.body.innerHTML = `
      <div class="opblock is-open" id="opblock-items">
        <div class="opblock-summary">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/items">/items</span>
        </div>
        <div class="opblock-body">
          <div class="try-out">
            <button class="try-out__btn">Try it out</button>
          </div>
          <table class="parameters">
            <tbody>
              <tr data-param-name="page" data-param-in="query">
                <td class="parameter__name">page</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `

    handle = mountSwaggerPaginationTester(modalMock, document)
    expect(document.querySelector('.oac-pagination-btn')).not.toBeNull()

    // Simulate React replacing .try-out children with Cancel button
    const tryOut = document.querySelector('.try-out')!
    tryOut.innerHTML = '<button class="try-out__btn cancel">Cancel</button>'

    // Button was temporarily removed by React re-render
    expect(document.querySelector('.oac-pagination-btn')).toBeNull()

    // Next scan recovers and re-attaches the button beside Cancel
    handle.scanAndMount(document)
    const restoredBtn = document.querySelector('.oac-pagination-btn')
    expect(restoredBtn).not.toBeNull()
    expect(tryOut.contains(restoredBtn)).toBe(true)
    expect(tryOut.querySelector('.cancel')).not.toBeNull()
  })
})
