import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountSwaggerGlobalHeaders } from './swagger-global-headers'
import { mountSwaggerPasteCurl } from './swagger-paste-curl'
import { HeadersService } from '@/modules/headers/headers-service'
import { StorageService } from '@/core/storage'
import { createFakeArea } from '@/tests/fake-storage'

describe('swagger-global-headers', () => {
  let doc: Document
  let storage: StorageService
  let headersService: HeadersService
  const projectId = 'proj_gh_test'

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger Test')
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="information-container">
          <div class="info">
            <h2 class="title">Test API</h2>
          </div>
        </div>
      </div>
    `

    storage = new StorageService({ area: createFakeArea() })
    headersService = new HeadersService({ storage, projectId })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('mounts Headers button in the Swagger UI header', () => {
    const handle = mountSwaggerGlobalHeaders(doc, headersService)
    const btn = doc.querySelector('.oac-global-headers-btn')

    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Headers')

    handle.dispose()
  })

  it('opens modal on button click and allows adding presets', () => {
    const handle = mountSwaggerGlobalHeaders(doc, headersService)
    const btn = doc.querySelector<HTMLButtonElement>('.oac-global-headers-btn')!
    btn.click()

    const modal = doc.getElementById('oac-global-headers-modal')!
    expect(modal).not.toBeNull()
    expect(modal.classList.contains('oac-hidden')).toBe(false)

    // Click preset "+ X-Tenant-ID"
    const presetBtn = Array.from(modal.querySelectorAll<HTMLButtonElement>('.oac-gh-preset-btn'))
      .find((b) => b.textContent?.includes('X-Tenant-ID'))

    expect(presetBtn).toBeDefined()
    presetBtn?.click()

    const rows = modal.querySelectorAll('.oac-gh-row')
    expect(rows.length).toBe(1)

    const nameInput = rows[0].querySelector<HTMLInputElement>('.oac-gh-input-name')!
    expect(nameInput.value).toBe('X-Tenant-ID')

    handle.dispose()
  })

  it('saves headers, updates button badge, and triggers sync callback', async () => {
    const onSyncSpy = vi.fn()
    const handle = mountSwaggerGlobalHeaders(doc, headersService, onSyncSpy)
    handle.openModal()

    const modal = doc.getElementById('oac-global-headers-modal')!
    const addBtn = modal.querySelector<HTMLButtonElement>('.oac-gh-add-btn')!
    addBtn.click()

    const row = modal.querySelector('.oac-gh-row')!
    const nameInput = row.querySelector<HTMLInputElement>('.oac-gh-input-name')!
    const valInput = row.querySelector<HTMLInputElement>('.oac-gh-input-value')!

    nameInput.value = 'X-Custom-Auth'
    nameInput.dispatchEvent(new Event('input'))
    valInput.value = 'Secret_123'
    valInput.dispatchEvent(new Event('input'))

    const saveBtn = modal.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')!
    saveBtn.click()

    // Wait for save
    await new Promise((r) => setTimeout(r, 20))

    expect(onSyncSpy).toHaveBeenCalledWith({
      'X-Custom-Auth': 'Secret_123',
    })

    const btn = doc.querySelector('.oac-global-headers-btn')!
    expect(btn.textContent).toContain('1')

    handle.dispose()
  })

  it('contains zero emojis across modal and buttons', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    const handle = mountSwaggerGlobalHeaders(doc, headersService)
    handle.openModal()

    const modal = doc.getElementById('oac-global-headers-modal')!
    expect(emojiRegex.test(modal.innerHTML)).toBe(false)

    const btn = doc.querySelector('.oac-global-headers-btn')!
    expect(emojiRegex.test(btn.innerHTML)).toBe(false)

    handle.dispose()
  })

  it('cleans up elements on dispose', () => {
    const handle = mountSwaggerGlobalHeaders(doc, headersService)
    handle.openModal()

    expect(doc.querySelector('.oac-global-headers-btn')).not.toBeNull()
    expect(doc.getElementById('oac-global-headers-modal')).not.toBeNull()

    handle.dispose()

    expect(doc.querySelector('.oac-global-headers-btn')).toBeNull()
    expect(doc.getElementById('oac-global-headers-modal')).toBeNull()
    expect(doc.getElementById('oac-global-headers-styles')).toBeNull()
  })
  it('mounts into shared .oac-header-actions-bar with Paste cURL button', () => {
    const mockProductivity: any = { getOperations: () => [] }
    const pasteHandle = mountSwaggerPasteCurl(doc, mockProductivity)
    const headersHandle = mountSwaggerGlobalHeaders(doc, headersService)

    const bar = doc.querySelector<HTMLElement>('.oac-header-actions-bar')
    expect(bar).not.toBeNull()
    expect(bar?.children.length).toBe(2)
    expect(bar?.children[0].classList.contains('oac-paste-curl-btn')).toBe(true)
    expect(bar?.children[1].classList.contains('oac-global-headers-btn')).toBe(true)

    pasteHandle.dispose()
    headersHandle.dispose()
  })
})
