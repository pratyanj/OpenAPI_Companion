import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountSwaggerPinnedEndpoints, jumpToOperation } from './swagger-pinned-endpoints'
import type { ProductivityService } from '@/modules/productivity/productivity-service'
import type { EndpointListItem } from '@/modules/productivity/types'

describe('mountSwaggerPinnedEndpoints', () => {
  let doc: Document
  let mockProductivity: any
  let favoritesList: EndpointListItem[]
  let busSubscribers: Record<string, Function[]>

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger UI Test')
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="wrapper">
          <div class="opblock-tag-section">
            <div class="opblock opblock-get" id="operations-tasks-get_tasks">
              <div class="opblock-summary opblock-summary-get">
                <button class="opblock-summary-control" aria-expanded="false">
                  <span class="opblock-summary-method">GET</span>
                  <span class="opblock-summary-path" data-path="/tasks/">
                    <a class="nostyle"><span>/tasks/</span></a>
                  </span>
                  <div class="opblock-summary-description">Get list of all tasks</div>
                </button>
              </div>
              <div class="no-margin">
                <div class="opblock-body"></div>
              </div>
            </div>
            <div class="opblock opblock-post" id="operations-tasks-create_task">
              <div class="opblock-summary opblock-summary-post">
                <button class="opblock-summary-control" aria-expanded="false">
                  <span class="opblock-summary-method">POST</span>
                  <span class="opblock-summary-path" data-path="/tasks/">
                    <a class="nostyle"><span>/tasks/</span></a>
                  </span>
                  <div class="opblock-summary-description">Create a new task</div>
                </button>
              </div>
              <div class="no-margin">
                <div class="opblock-body"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    favoritesList = []
    busSubscribers = {}

    mockProductivity = {
      getFavorites: vi.fn(() => favoritesList),
      isFavorite: vi.fn((id: string) => favoritesList.some((f) => f.endpointId === id)),
      toggleFavorite: vi.fn(async (info: any) => {
        const idx = favoritesList.findIndex((f) => f.endpointId === info.endpointId)
        if (idx >= 0) {
          favoritesList.splice(idx, 1)
        } else {
          favoritesList.push({
            endpointId: info.endpointId,
            method: info.method,
            path: info.path,
            summary: info.summary,
            tags: [],
          })
        }
      }),
      bus: {
        subscribe: vi.fn((event: string, cb: Function) => {
          if (!busSubscribers[event]) busSubscribers[event] = []
          busSubscribers[event].push(cb)
          return () => {
            busSubscribers[event] = busSubscribers[event].filter((fn) => fn !== cb)
          }
        }),
        emit: (event: string, payload: any) => {
          if (busSubscribers[event]) {
            busSubscribers[event].forEach((fn) => fn(payload))
          }
        },
      },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('attaches star buttons directly to the left of .opblock-summary-method', () => {
    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    expect(handle).toBeDefined()

    const stars = doc.querySelectorAll<HTMLButtonElement>('.oac-endpoint-star-btn')
    expect(stars.length).toBe(2)

    const firstSummary = doc.querySelector('.opblock-summary-get')!
    const methodBadge = firstSummary.querySelector('.opblock-summary-method')!
    const starBtn = firstSummary.querySelector('.oac-endpoint-star-btn')!

    // Must be a sibling placed immediately BEFORE the method badge
    expect(starBtn.nextElementSibling).toBe(methodBadge)
    expect(starBtn.getAttribute('data-endpoint-id')).toBe('get /tasks/')
    expect(starBtn.classList.contains('oac-starred')).toBe(false)
    expect(starBtn.title).toContain('Pin to top')

    handle.dispose()
  })

  it('initializes with active star if endpoint is already favorited', () => {
    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'Get list of all tasks',
      tags: [],
    })

    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const starBtn = doc.querySelector<HTMLButtonElement>('.oac-endpoint-star-btn[data-endpoint-id="get /tasks/"]')!
    expect(starBtn.classList.contains('oac-starred')).toBe(true)
    expect(starBtn.title).toContain('Unpin from top')

    handle.dispose()
  })

  it('toggles favorite on click with accordion event isolation', async () => {
    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const starBtn = doc.querySelector<HTMLButtonElement>('.oac-endpoint-star-btn[data-endpoint-id="get /tasks/"]')!

    const accordionControl = doc.querySelector('.opblock-summary-control')!
    const accordionSpy = vi.fn()
    accordionControl.addEventListener('click', accordionSpy)

    const stopPropagationSpy = vi.fn()
    const stopImmediatePropagationSpy = vi.fn()
    const preventDefaultSpy = vi.fn()

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    })
    event.stopPropagation = stopPropagationSpy
    event.stopImmediatePropagation = stopImmediatePropagationSpy
    event.preventDefault = preventDefaultSpy

    starBtn.dispatchEvent(event)

    expect(stopPropagationSpy).toHaveBeenCalled()
    expect(stopImmediatePropagationSpy).toHaveBeenCalled()
    expect(preventDefaultSpy).toHaveBeenCalled()
    expect(mockProductivity.toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'get /tasks/',
        method: 'get',
        path: '/tasks/',
      }),
    )

    handle.dispose()
  })

  it('renders pinned tray at top with empty state when empty and populates on favorite', async () => {
    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const tray = doc.getElementById('oac-pinned-endpoints-tray')!
    expect(tray).toBeDefined()
    // Initially empty: should render empty state guidance and badge 0
    expect(tray.classList.contains('oac-tray-hidden')).toBe(false)
    expect(tray.querySelector('.oac-pinned-count-badge')?.textContent).toBe('0')
    expect(tray.querySelector('.oac-pinned-empty-state')).not.toBeNull()
    expect(tray.querySelector('.oac-pinned-empty-text')?.textContent).toContain('No pinned operations yet')

    // Add a favorite
    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'Get tasks',
      tags: [],
    })

    handle.renderTray()
    expect(tray.classList.contains('oac-tray-hidden')).toBe(false)
    expect(tray.querySelector('.oac-pinned-empty-state')).toBeNull()
    expect(tray.querySelector('.oac-pinned-tray-title')?.textContent).toBe('Pinned Operations')
    expect(tray.querySelector('.oac-pinned-count-badge')?.textContent).toBe('1')

    const card = tray.querySelector('.oac-pinned-card')!
    expect(card).toBeDefined()
    expect(card.querySelector('.oac-pinned-path')?.textContent).toBe('/tasks/')
    expect(card.querySelector('.oac-pinned-method-badge')?.textContent).toBe('GET')

    // Unpin from tray
    const unpinBtn = card.querySelector<HTMLButtonElement>('.oac-pinned-unpin-btn')!
    unpinBtn.click()
    expect(mockProductivity.toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: 'get /tasks/',
      }),
    )

    handle.dispose()
  })

  it('collapses and expands the pinned tray cards grid', () => {
    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'Get tasks',
      tags: [],
    })

    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const tray = doc.getElementById('oac-pinned-endpoints-tray')!
    const toggleBtn = tray.querySelector<HTMLButtonElement>('.oac-pinned-tray-toggle-btn')!
    const grid = tray.querySelector('.oac-pinned-cards-grid')!

    expect(grid.classList.contains('oac-collapsed')).toBe(false)

    // Click collapse
    toggleBtn.click()
    const updatedGrid = tray.querySelector('.oac-pinned-cards-grid')!
    expect(updatedGrid.classList.contains('oac-collapsed')).toBe(true)

    handle.dispose()
  })

  it('jumpToOperation scrolls to endpoint, opens accordion, and pulses highlight', () => {
    const block = doc.getElementById('operations-tasks-get_tasks')!
    block.scrollIntoView = vi.fn()

    const summaryControl = block.querySelector<HTMLElement>('.opblock-summary-control')!
    const clickSpy = vi.fn()
    summaryControl.addEventListener('click', clickSpy)

    const jumped = jumpToOperation(doc, 'get /tasks/')
    expect(jumped).toBe(true)
    expect(clickSpy).toHaveBeenCalled()
    expect(block.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(block.classList.contains('oac-pulse-highlight')).toBe(true)
  })

  it('syncs via bus FAVORITE_TOGGLED event', () => {
    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const starBtn = doc.querySelector<HTMLButtonElement>('.oac-endpoint-star-btn[data-endpoint-id="get /tasks/"]')!
    expect(starBtn.classList.contains('oac-starred')).toBe(false)

    // Simulate backend favorite update and bus event
    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      tags: [],
    })
    mockProductivity.bus.emit('FAVORITE_TOGGLED', { endpointId: 'get /tasks/' })

    expect(starBtn.classList.contains('oac-starred')).toBe(true)

    handle.dispose()
  })

  it('cleans up all injected elements on dispose', () => {
    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    expect(doc.querySelectorAll('.oac-endpoint-star-btn').length).toBe(2)
    expect(doc.getElementById('oac-pinned-endpoints-tray')).not.toBeNull()
    expect(doc.getElementById('oac-pinned-endpoints-styles')).not.toBeNull()

    handle.dispose()

    expect(doc.querySelectorAll('.oac-endpoint-star-btn').length).toBe(0)
    expect(doc.getElementById('oac-pinned-endpoints-tray')).toBeNull()
    expect(doc.getElementById('oac-pinned-endpoints-styles')).toBeNull()
  })

  it('contains zero emojis in SVG icons or markup', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'Tasks list',
      tags: [],
    })

    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const tray = doc.getElementById('oac-pinned-endpoints-tray')!
    expect(emojiRegex.test(tray.innerHTML)).toBe(false)

    const starBtn = doc.querySelector('.oac-endpoint-star-btn')!
    expect(emojiRegex.test(starBtn.innerHTML)).toBe(false)

    handle.dispose()
  })

  it('anchors inside wrapper before first operation in drf-yasg layout instead of outside near filter-container', () => {
    // drf-yasg DOM markup: filter-container sits in .swagger-ui outside .wrapper,
    // while operations sit inside .wrapper
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="filter-container">
          <input class="operation-filter-input" placeholder="Filter by tag" />
        </div>
        <div class="wrapper">
          <section class="block col-12 block-desktop col-12-desktop">
            <div class="opblock-tag-section">
              <div class="opblock opblock-get" id="operations-audit-get_audit">
                <div class="opblock-summary opblock-summary-get">
                  <button class="opblock-summary-control">
                    <span class="opblock-summary-method">GET</span>
                    <span class="opblock-summary-path">/api/v1/audit-logs/</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    `

    favoritesList.push({
      endpointId: 'get /api/v1/audit-logs/',
      method: 'get',
      path: '/api/v1/audit-logs/',
      summary: 'Audit logs',
      tags: [],
    })

    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const tray = doc.getElementById('oac-pinned-endpoints-tray')!
    expect(tray).toBeDefined()

    const opSection = doc.querySelector('.opblock-tag-section')!
    const wrapper = doc.querySelector('.wrapper')!
    const filterContainer = doc.querySelector('.filter-container')!

    // Crucial: tray MUST be inside the .wrapper containing operations,
    // immediately before the first tag section, and NOT as a sibling of .filter-container
    expect(wrapper.contains(tray)).toBe(true)
    expect(tray.nextElementSibling).toBe(opSection)
    expect(tray.parentNode).toBe(opSection.parentNode)
    expect(filterContainer.nextElementSibling).not.toBe(tray)

    handle.dispose()
  })

  it('dynamically repositions tray from fallback to before operations when loaded asynchronously (Firefox)', async () => {
    // Initial state: spec is still loading, no operations exist yet
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="wrapper">
          <div class="topbar">Swagger Banner</div>
        </div>
      </div>
    `

    favoritesList.push({
      endpointId: 'get /tasks/',
      method: 'get',
      path: '/tasks/',
      summary: 'Tasks list',
      tags: [],
    })

    const handle = mountSwaggerPinnedEndpoints(mockProductivity as unknown as ProductivityService, doc)
    const tray = doc.getElementById('oac-pinned-endpoints-tray')!
    expect(tray).toBeDefined()
    expect(tray.isConnected).toBe(true)

    // Now simulate Swagger UI finishing async spec load and rendering endpoints
    const opsWrapper = doc.createElement('div')
    opsWrapper.className = 'wrapper'
    opsWrapper.innerHTML = `
      <div class="opblock-tag-section">
        <div class="opblock opblock-get">
          <div class="opblock-summary">
            <span class="opblock-summary-method">GET</span>
            <span class="opblock-summary-path">/tasks/</span>
          </div>
        </div>
      </div>
    `
    doc.querySelector('.swagger-ui')!.appendChild(opsWrapper)

    // Trigger re-render / re-anchor
    handle.renderTray()

    const opSection = doc.querySelector('.opblock-tag-section')!
    // Tray must have dynamically moved from the top banner to right before the first operation
    expect(tray.nextElementSibling).toBe(opSection)
    expect(tray.parentNode).toBe(opSection.parentNode)

    handle.dispose()
  })
})
