import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isSwaggerPresent, waitForSwaggerMount, watchSpaNavigation } from './swagger-mount-observer'

describe('isSwaggerPresent', () => {
  let doc: Document

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Test')
  })

  it('should return false when no Swagger UI elements are present', () => {
    expect(isSwaggerPresent(doc)).toBe(false)
  })

  it('should return true when #swagger-ui is present', () => {
    const div = doc.createElement('div')
    div.id = 'swagger-ui'
    doc.body.appendChild(div)
    expect(isSwaggerPresent(doc)).toBe(true)
  })

  it('should return true when .swagger-ui is present', () => {
    const div = doc.createElement('div')
    div.className = 'swagger-ui'
    doc.body.appendChild(div)
    expect(isSwaggerPresent(doc)).toBe(true)
  })

  it('should return true when meta[name="swagger-ui"] is present', () => {
    const meta = doc.createElement('meta')
    meta.name = 'swagger-ui'
    doc.head.appendChild(meta)
    expect(isSwaggerPresent(doc)).toBe(true)
  })

  it('should return true when .swagger-container is present', () => {
    const div = doc.createElement('div')
    div.className = 'swagger-container'
    doc.body.appendChild(div)
    expect(isSwaggerPresent(doc)).toBe(true)
  })

  it('should return true when #swagger-ui-container is present', () => {
    const div = doc.createElement('div')
    div.id = 'swagger-ui-container'
    doc.body.appendChild(div)
    expect(isSwaggerPresent(doc)).toBe(true)
  })

  it('should return true when .swagger-ui-wrap is present', () => {
    const div = doc.createElement('div')
    div.className = 'swagger-ui-wrap'
    doc.body.appendChild(div)
    expect(isSwaggerPresent(doc)).toBe(true)
  })
})

describe('waitForSwaggerMount', () => {
  let doc: Document

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should resolve immediately if Swagger UI is already present', async () => {
    const div = doc.createElement('div')
    div.id = 'swagger-ui'
    doc.body.appendChild(div)

    const result = await waitForSwaggerMount({ doc, timeoutMs: 100 })
    expect(result).toBe(true)
  })

  it('should resolve true when Swagger UI is added within timeout', async () => {
    const startTime = Date.now()

    // Add Swagger UI after 20ms
    setTimeout(() => {
      const div = doc.createElement('div')
      div.id = 'swagger-ui'
      doc.body.appendChild(div)
    }, 20)

    const result = await waitForSwaggerMount({ doc, timeoutMs: 200 })
    expect(result).toBe(true)
    const elapsed = Date.now() - startTime
    expect(elapsed).toBeLessThan(150)
  })

  it('should resolve false when timeout expires without Swagger UI', async () => {
    const startTime = Date.now()

    const result = await waitForSwaggerMount({ doc, timeoutMs: 30 })
    expect(result).toBe(false)
    const elapsed = Date.now() - startTime
    expect(elapsed).toBeGreaterThanOrEqual(25)
  })

  it('should respect custom timeout', async () => {
    setTimeout(() => {
      const div = doc.createElement('div')
      div.className = 'swagger-ui'
      doc.body.appendChild(div)
    }, 25)

    const result = await waitForSwaggerMount({ doc, timeoutMs: 80 })
    expect(result).toBe(true)
  })

  it('should cleanup observer on detection', async () => {
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')

    setTimeout(() => {
      const div = doc.createElement('div')
      div.id = 'swagger-ui'
      doc.body.appendChild(div)
    }, 15)

    const result = await waitForSwaggerMount({ doc, timeoutMs: 200 })
    expect(result).toBe(true)
    expect(disconnectSpy).toHaveBeenCalled()
  })

  it('should cleanup observer on timeout', async () => {
    const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')

    const result = await waitForSwaggerMount({ doc, timeoutMs: 20 })
    expect(result).toBe(false)
    expect(disconnectSpy).toHaveBeenCalled()
  })
})

describe('watchSpaNavigation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should call callback on pushState', async () => {
    const callback = vi.fn()
    const cleanup = watchSpaNavigation(callback)

    history.pushState(null, '', '/new-url')

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled()
    })
    cleanup()
  })

  it('should call callback on replaceState', async () => {
    const callback = vi.fn()
    const cleanup = watchSpaNavigation(callback)

    history.replaceState(null, '', '/replaced-url')

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled()
    })
    cleanup()
  })

  it('should call callback on popstate', async () => {
    const callback = vi.fn()
    const cleanup = watchSpaNavigation(callback)

    window.dispatchEvent(new PopStateEvent('popstate'))

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled()
    })
    cleanup()
  })

  it('should call callback on hashchange', async () => {
    const callback = vi.fn()
    const cleanup = watchSpaNavigation(callback)

    window.dispatchEvent(new HashChangeEvent('hashchange'))

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalled()
    })
    cleanup()
  })

  it('should cleanup properly and stop firing callback', async () => {
    const callback = vi.fn()
    const cleanup = watchSpaNavigation(callback)

    cleanup() // Remove listeners and restore methods

    history.pushState(null, '', '/another-url')
    window.dispatchEvent(new PopStateEvent('popstate'))
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    await new Promise((r) => setTimeout(r, 20))
    expect(callback).not.toHaveBeenCalled()
  })
})
