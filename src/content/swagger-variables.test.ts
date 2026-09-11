import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mountSwaggerVariables, type SwaggerVariablesHandle } from './swagger-variables'

function opblockHtml(method: string, path: string, body = '', paramVal = ''): string {
  return `
    <div class="opblock is-open">
      <div class="opblock-summary">
        <span class="opblock-summary-method">${method}</span>
        <span class="opblock-summary-path" data-path="${path}">${path}</span>
      </div>
      <div class="opblock-section-header">Parameters</div>
      <div class="parameters-container">
        <table>
          <tbody>
            <tr data-param-name="user_id" data-param-in="path">
              <td><input class="parameter" value="${paramVal}" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <textarea class="body-param__text">${body}</textarea>
      <button class="btn execute">Execute</button>
    </div>
  `
}

describe('swagger-variables (in-page Swagger UI integration)', () => {
  let handle: SwaggerVariablesHandle

  beforeEach(() => {
    document.body.innerHTML = ''
  })

  afterEach(() => {
    handle?.dispose()
    document.body.innerHTML = ''
  })

  it('triggers autocomplete dropdown list when {{ is typed in a Swagger input', () => {
    document.body.innerHTML = opblockHtml('POST', '/items', '')

    handle = mountSwaggerVariables({ TOKEN: 'abc_secret', API_KEY: 'key_123' }, ['TOKEN'])

    const block = document.querySelector('.opblock')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    // Simulate user typing {{
    textarea.value = 'Bearer {{'
    textarea.setSelectionRange(9, 9)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    const host = document.getElementById('oac-swagger-var-autocomplete-host')!
    expect(host).toBeInTheDocument()

    const shadow = host.shadowRoot!
    const popup = shadow.querySelector<HTMLDivElement>('.oac-popup')!
    expect(popup.style.display).toBe('flex')

    // Expect list items for project variables + dynamic variables
    const items = shadow.querySelectorAll('.oac-item')
    expect(items.length).toBeGreaterThanOrEqual(2)
    expect(shadow.textContent).toContain('TOKEN')
    expect(shadow.textContent).toContain('API_KEY')
  })

  it('inserts selected variable on Enter and closes popup', () => {
    document.body.innerHTML = opblockHtml('POST', '/items', '')

    handle = mountSwaggerVariables({ TOKEN: 'abc_secret' }, [])

    const block = document.querySelector('.opblock')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    textarea.value = '{{'
    textarea.setSelectionRange(2, 2)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    const host = document.getElementById('oac-swagger-var-autocomplete-host')!
    const shadow = host.shadowRoot!
    const popup = shadow.querySelector<HTMLDivElement>('.oac-popup')!
    expect(popup.style.display).toBe('flex')

    // Press Enter to insert the first suggestion (TOKEN)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))

    expect(textarea.value).toBe('{{TOKEN}}')
    expect(popup.style.display).toBe('none')
  })

  it('auto-resolves placeholders in the block when native Execute button is clicked', () => {
    document.body.innerHTML = opblockHtml('GET', '/users/{user_id}', '', '{{USER_ID}}')

    handle = mountSwaggerVariables({ USER_ID: '99' }, [])

    const block = document.querySelector('.opblock')!
    const input = block.querySelector<HTMLInputElement>('input.parameter')!
    expect(input.value).toBe('{{USER_ID}}')

    const executeBtn = block.querySelector<HTMLButtonElement>('.btn.execute')!
    executeBtn.click()

    // Values should be resolved in-place before execution
    expect(input.value).toBe('99')
  })

  it('programmatically resolves placeholders in an operation block via resolveOperationInputs', () => {
    document.body.innerHTML = opblockHtml('POST', '/tasks/{user_id}', '{"assignee": "{{USER_ID}}"}', '{{USER_ID}}')

    handle = mountSwaggerVariables({ USER_ID: '42' }, [])

    const block = document.querySelector('.opblock')!
    const input = block.querySelector<HTMLInputElement>('input.parameter')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    expect(input.value).toBe('{{USER_ID}}')
    expect(textarea.value).toBe('{"assignee": "{{USER_ID}}"}')

    const count = handle.resolveOperationInputs(block)
    expect(count).toBe(2)
    expect(input.value).toBe('42')
    expect(textarea.value).toBe('{"assignee": "42"}')
  })

  it('updates variable list dynamically for autocomplete', () => {
    document.body.innerHTML = opblockHtml('GET', '/test')

    handle = mountSwaggerVariables({ A: '1' }, [])
    handle.updateVariables({ A: '1', NEW_VAR: '2' }, [])

    const block = document.querySelector('.opblock')!
    const input = block.querySelector<HTMLInputElement>('input.parameter')!
    input.value = '{{'
    input.setSelectionRange(2, 2)
    input.dispatchEvent(new Event('input', { bubbles: true }))

    const host = document.getElementById('oac-swagger-var-autocomplete-host')!
    expect(host.shadowRoot!.textContent).toContain('NEW_VAR')
  })
})
