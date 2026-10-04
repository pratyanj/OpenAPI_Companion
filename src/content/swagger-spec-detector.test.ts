import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSwaggerSpecDetector } from './swagger-spec-detector'
import type { SpecChangeModalHandle } from './spec-change-modal'
import type { SpecDiffResult, NormalizedSpec } from '@/modules/spec-detector/types'

describe('swagger-spec-detector in-page banner', () => {
  let doc: Document
  let modalHandle: SpecChangeModalHandle
  let specService: any
  let bus: any

  const dummyDiff: SpecDiffResult = {
    hasChanges: true,
    hasBreakingChanges: true,
    totalChanges: 2,
    breakingCount: 1,
    warningCount: 0,
    infoCount: 1,
    oldHash: 'h1',
    newHash: 'h2',
    changes: [
      {
        id: 'c1',
        type: 'endpoint_removed',
        severity: 'breaking',
        endpointId: 'delete /users/{id}',
        method: 'delete',
        path: '/users/{id}',
        title: 'Removed endpoint',
        description: 'Endpoint removed',
      },
    ],
    impactedResources: [],
  }

  const dummySpec: NormalizedSpec = {
    title: 'Test API',
    version: '1.0.0',
    hash: 'h2',
    operations: {},
    timestamp: 1000,
  }

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger UI')
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="information-container">
          <div class="info"><h1>API Docs</h1></div>
        </div>
      </div>
    `

    modalHandle = {
      open: vi.fn(),
      close: vi.fn(),
      isOpen: vi.fn(() => false),
      themeRoot: doc.createElement('div'),
      destroy: vi.fn(),
    }

    specService = {
      acceptNewBaseline: vi.fn(async () => ({})),
    }

    bus = {
      publish: vi.fn(),
    }
  })

  it('mounts breaking changes banner into information container', () => {
    const detector = createSwaggerSpecDetector(modalHandle, specService, bus, doc)
    detector.showBanner(dummyDiff, dummySpec)

    const banner = doc.getElementById('oac-spec-detector-banner')
    expect(banner).not.toBeNull()
    expect(banner?.classList.contains('is-breaking')).toBe(true)
    expect(banner?.textContent).toContain('Breaking Changes')
    expect(banner?.textContent).toContain('2 Changes')
  })

  it('opens review modal when Review Changes button is clicked', () => {
    const detector = createSwaggerSpecDetector(modalHandle, specService, bus, doc)
    detector.showBanner(dummyDiff, dummySpec)

    const reviewBtn = doc.getElementById('oac-spec-btn-review') as HTMLButtonElement
    expect(reviewBtn).not.toBeNull()
    reviewBtn.click()

    expect(modalHandle.open).toHaveBeenCalledWith({
      diff: dummyDiff,
      newSpec: dummySpec,
    })
  })

  it('accepts baseline and removes banner when Accept Baseline button is clicked', async () => {
    const detector = createSwaggerSpecDetector(modalHandle, specService, bus, doc)
    detector.showBanner(dummyDiff, dummySpec)

    const acceptBtn = doc.getElementById('oac-spec-btn-accept') as HTMLButtonElement
    expect(acceptBtn).not.toBeNull()
    acceptBtn.click()
    await Promise.resolve()
    await Promise.resolve()

    expect(specService.acceptNewBaseline).toHaveBeenCalledWith(dummySpec)
    expect(bus.publish).toHaveBeenCalledWith('NOTIFY', expect.objectContaining({ kind: 'success' }))
    expect(doc.getElementById('oac-spec-detector-banner')).toBeNull()
  })

  it('dismisses banner and does not re-show on same hash', () => {
    const detector = createSwaggerSpecDetector(modalHandle, specService, bus, doc)
    detector.showBanner(dummyDiff, dummySpec)

    const closeBtn = doc.getElementById('oac-spec-btn-close') as HTMLButtonElement
    closeBtn.click()

    expect(doc.getElementById('oac-spec-detector-banner')).toBeNull()

    // Call showBanner again with same hash
    detector.showBanner(dummyDiff, dummySpec)
    expect(doc.getElementById('oac-spec-detector-banner')).toBeNull()
  })

  it('does not mount banner if hasChanges is false', () => {
    const detector = createSwaggerSpecDetector(modalHandle, specService, bus, doc)
    detector.showBanner(
      {
        ...dummyDiff,
        hasChanges: false,
        totalChanges: 0,
      },
      dummySpec,
    )

    expect(doc.getElementById('oac-spec-detector-banner')).toBeNull()
  })
})
