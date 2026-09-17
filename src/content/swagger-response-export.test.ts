import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountSwaggerResponseExport } from './swagger-response-export'

function createCell(content: string): HTMLElement {
  const container = document.createElement('div')
  container.className = 'opblock is-open'
  container.innerHTML = `
    <div class="opblock-summary">
      <span class="opblock-summary-method">GET</span>
      <span class="opblock-summary-path"><span>/tasks</span></span>
    </div>
    <div class="responses-wrapper">
      <table class="responses-table live-responses-table">
        <tbody>
          <tr class="response">
            <td class="response-col_status">200</td>
            <td class="response-col_description">
              <div class="highlight-code">
                <pre class="microlight"><code>${content}</code></pre>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
  return container
}

describe('swagger-response-export', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-url')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.body.className = ''
    document.querySelectorAll('#oac-response-export-styles').forEach((el) => el.remove())
  })

  it('mounts fallback export bar with JSON and CSV buttons on JSON response cell', () => {
    const block = createCell(JSON.stringify([{ id: 1, title: 'Test' }]))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseExport(document)
    const bar = document.querySelector('.oac-response-export-bar') as HTMLElement
    expect(bar).toBeTruthy()

    const btns = bar.querySelectorAll('button')
    expect(btns.length).toBe(2)
    expect(btns[0].textContent).toContain('JSON')
    expect(btns[1].textContent).toContain('CSV')
    expect(btns[1].disabled).toBe(false)

    handle.dispose()
  })

  it('disables CSV button for non-tabular payloads', () => {
    const block = createCell(JSON.stringify(12345))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseExport(document)
    // Numbers/primitives are ignored by JSON extractor
    expect(document.querySelector('.oac-response-export-bar')).toBeNull()

    handle.dispose()
  })

  it('triggers download on JSON and CSV button clicks', () => {
    const block = createCell(JSON.stringify([{ id: 42, name: 'Sample' }]))
    document.body.appendChild(block)

    const clickMock = vi.fn()
    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreateElement(tag)
      if (tag === 'a') {
        el.click = clickMock
      }
      return el
    })

    const handle = mountSwaggerResponseExport(document)
    const btns = document.querySelectorAll('.oac-fallback-export-btn')
    const jsonBtn = btns[0] as HTMLButtonElement
    const csvBtn = btns[1] as HTMLButtonElement

    jsonBtn.click()
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(jsonBtn.textContent).toContain('Exported!')

    csvBtn.click()
    expect(clickMock).toHaveBeenCalledTimes(2)
    expect(csvBtn.textContent).toContain('Exported!')

    handle.dispose()
  })

  it('cleans up elements on dispose()', () => {
    const block = createCell(JSON.stringify({ ok: true }))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseExport(document)
    expect(document.querySelector('.oac-response-export-bar')).toBeTruthy()

    handle.dispose()
    expect(document.querySelector('.oac-response-export-bar')).toBeNull()
    expect(document.getElementById('oac-response-export-styles')).toBeNull()
  })
})
