import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountSwaggerPasteCurl } from './swagger-paste-curl'
import type { ProductivityService } from '@/modules/productivity/productivity-service'

describe('swagger-paste-curl', () => {
  it('mounts asynchronously when Swagger UI renders after initial call (OAS3 dynamic loading)', async () => {
    const emptyDoc = document.implementation.createHTMLDocument('Empty')
    emptyDoc.body.innerHTML = '<div id="swagger-ui"></div>'
    const handle = mountSwaggerPasteCurl(
      emptyDoc,
      mockProductivity as unknown as ProductivityService,
    )

    // Button should not be present initially
    expect(emptyDoc.querySelector('.oac-paste-curl-btn')).toBeNull()

    // Simulate async Swagger UI render
    const info = emptyDoc.createElement('div')
    info.className = 'swagger-ui'
    info.innerHTML = '<div class="info"><h2 class="title">Loaded API</h2></div>'
    emptyDoc.body.appendChild(info)

    // Wait for observer debounced scan
    await new Promise((r) => setTimeout(r, 150))
    expect(emptyDoc.querySelector('.oac-paste-curl-btn')).not.toBeNull()

    handle.dispose()
  })

  let doc: Document
  let mockProductivity: unknown

  beforeEach(() => {
    doc = document.implementation.createHTMLDocument('Swagger Test')
    doc.body.innerHTML = `
      <div class="swagger-ui">
        <div class="information-container">
          <div class="info">
            <h2 class="title">Test API</h2>
          </div>
        </div>
        <div class="wrapper">
          <div class="opblock-tag-section">
            <div class="opblock opblock-post is-open" id="operations-tasks-create_task">
              <div class="opblock-summary opblock-summary-post">
                <button class="opblock-summary-control">
                  <span class="opblock-summary-method">POST</span>
                  <span class="opblock-summary-path" data-path="/tasks/">
                    <a class="nostyle"><span>/tasks/</span></a>
                  </span>
                </button>
              </div>
              <div class="opblock-body">
                <button class="try-out__btn">Try it out</button>
                <div class="parameters-container">
                  <table class="parameters">
                    <tbody>
                      <tr data-param-name="tag">
                        <td class="parameters-col_name"><div class="parameter__name">tag</div></td>
                        <td class="parameters-col_description"><input type="text" value="" /></td>
                      </tr>
                      <tr data-param-name="X-Tenant-ID">
                        <td class="parameters-col_name"><div class="parameter__name">X-Tenant-ID</div></td>
                        <td class="parameters-col_description"><input type="text" value="" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div class="opblock-section">
                  <textarea class="body-param__text"></textarea>
                </div>
              </div>
            </div>
            <div class="opblock opblock-get is-open" id="operations-tasks-get_task">
              <div class="opblock-summary opblock-summary-get">
                <button class="opblock-summary-control">
                  <span class="opblock-summary-method">GET</span>
                  <span class="opblock-summary-path" data-path="/tasks/{task_id}">
                    <a class="nostyle"><span>/tasks/{task_id}</span></a>
                  </span>
                </button>
              </div>
              <div class="opblock-body">
                <button class="try-out__btn">Try it out</button>
                <div class="parameters-container">
                  <table class="parameters">
                    <tbody>
                      <tr data-param-name="task_id">
                        <td class="parameters-col_name"><div class="parameter__name">task_id</div></td>
                        <td class="parameters-col_description"><input type="text" value="" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `

    mockProductivity = {
      search: vi.fn(() => [
        {
          endpointId: 'post /tasks/',
          method: 'post',
          path: '/tasks/',
          summary: 'Create a task',
          tags: ['tasks'],
        },
        {
          endpointId: 'get /tasks/{task_id}',
          method: 'get',
          path: '/tasks/{task_id}',
          summary: 'Get task by id',
          tags: ['tasks'],
        },
      ]),
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('mounts Paste cURL button into the Swagger UI header', () => {
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    const btn = doc.querySelector<HTMLButtonElement>('.oac-paste-curl-btn')

    expect(btn).not.toBeNull()
    expect(btn?.textContent).toContain('Paste cURL')

    handle.dispose()
  })

  it('opens modal on button click and displays preview for pasted cURL', () => {
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    const btn = doc.querySelector<HTMLButtonElement>('.oac-paste-curl-btn')!
    btn.click()

    const modal = doc.getElementById('oac-paste-curl-modal')!
    expect(modal).not.toBeNull()
    expect(modal.classList.contains('oac-hidden')).toBe(false)

    const textarea = modal.querySelector<HTMLTextAreaElement>('.oac-paste-textarea')!
    textarea.value = `curl -X POST "http://127.0.0.1:8008/tasks/?tag=work" -H "Content-Type: application/json" -d '{"title":"Test task"}'`
    textarea.dispatchEvent(new Event('input'))

    const preview = modal.querySelector<HTMLElement>('.oac-paste-preview-box')!
    expect(preview.textContent).toContain('Matched: post /tasks/')
    expect(preview.textContent).toContain('Query: tag = work')
    expect(preview.textContent).toContain('Content-Type:')
    expect(preview.textContent).toContain('application/json')
    expect(preview.textContent).toContain('Test task')

    const autoFillBtn = modal.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')!
    expect(autoFillBtn.disabled).toBe(false)

    handle.dispose()
  })

  it('executes auto-fill into Swagger UI DOM fields on primary button click', () => {
    vi.useFakeTimers()
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    handle.openModal(
      `curl -X POST "http://127.0.0.1:8008/tasks/?tag=urgent" -H "Content-Type: application/json" -d '{"title":"Important Meeting"}'`,
    )

    const modal = doc.getElementById('oac-paste-curl-modal')!
    const autoFillBtn = modal.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')!
    autoFillBtn.click()

    // Modal should close
    expect(modal.classList.contains('oac-hidden')).toBe(true)

    // Run scheduled timers for auto-fill
    vi.advanceTimersByTime(300)

    const tagInput = doc.querySelector<HTMLInputElement>('tr[data-param-name="tag"] input')!
    const bodyTextarea = doc.querySelector<HTMLTextAreaElement>('.body-param__text')!

    expect(tagInput.value).toBe('urgent')
    expect(bodyTextarea.value).toContain('Important Meeting')

    handle.dispose()
  })

  it('matches templated path and populates path parameters', () => {
    vi.useFakeTimers()
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    handle.openModal(`curl "http://127.0.0.1:8008/tasks/99"`)

    const modal = doc.getElementById('oac-paste-curl-modal')!
    const autoFillBtn = modal.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')!
    autoFillBtn.click()

    vi.advanceTimersByTime(300)

    const taskIdInput = doc.querySelector<HTMLInputElement>('tr[data-param-name="task_id"] input')!
    expect(taskIdInput.value).toBe('99')

    handle.dispose()
  })

  it('contains zero emojis across modal markup and SVG icons', () => {
    const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    handle.openModal(`curl -X POST "http://127.0.0.1:8008/tasks/"`)

    const modal = doc.getElementById('oac-paste-curl-modal')!
    expect(emojiRegex.test(modal.innerHTML)).toBe(false)

    const btn = doc.querySelector('.oac-paste-curl-btn')!
    expect(emojiRegex.test(btn.innerHTML)).toBe(false)

    handle.dispose()
  })

  it('displays headers and their exact values in the preview box and auto-fills them into Swagger UI', () => {
    vi.useFakeTimers()
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    handle.openModal(
      `curl -X POST "http://127.0.0.1:8008/tasks/" -H "Content-Type: application/json" -H "X-Tenant-ID: corp-99" -d '{"title":"Important"}'`,
    )

    const modal = doc.getElementById('oac-paste-curl-modal')!
    const preview = modal.querySelector<HTMLElement>('.oac-paste-preview-box')!

    // Verify preview renders headers section with both keys and values
    expect(preview.textContent).toContain('Headers (2):')
    expect(preview.textContent).toContain('Content-Type:')
    expect(preview.textContent).toContain('application/json')
    expect(preview.textContent).toContain('X-Tenant-ID:')
    expect(preview.textContent).toContain('corp-99')

    const autoFillBtn = modal.querySelector<HTMLButtonElement>('.oac-modal-btn-primary')!
    autoFillBtn.click()

    vi.advanceTimersByTime(300)

    const tenantInput = doc.querySelector<HTMLInputElement>(
      'tr[data-param-name="X-Tenant-ID"] input',
    )!
    expect(tenantInput.value).toBe('corp-99')

    handle.dispose()
  })

  it('cleans up modal and styles on dispose', () => {
    const handle = mountSwaggerPasteCurl(doc, mockProductivity as unknown as ProductivityService)
    expect(doc.querySelector('.oac-paste-curl-btn')).not.toBeNull()

    handle.dispose()

    expect(doc.querySelector('.oac-paste-curl-btn')).toBeNull()
    expect(doc.getElementById('oac-paste-curl-modal')).toBeNull()
    expect(doc.getElementById('oac-paste-curl-styles')).toBeNull()
  })
})
