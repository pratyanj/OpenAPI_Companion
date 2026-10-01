import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountSwaggerPaginationTester } from './swagger-pagination-tester'
import type { PaginationModalHandle } from './pagination-modal'

describe('Swagger Pagination Tester DOM', () => {
  let modalMock: PaginationModalHandle
  let handle: { scanAndMount: () => number; dispose: () => void }

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
})
