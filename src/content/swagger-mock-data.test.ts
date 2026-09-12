import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mountSwaggerMockData,
  extractJsonCandidate,
  fillMockData,
} from './swagger-mock-data'

function createOpblock(method: string, path: string, body = '', example = ''): HTMLElement {
  const div = document.createElement('div')
  div.className = 'opblock is-open'
  div.innerHTML = `
    <div class="opblock-summary">
      <span class="opblock-summary-method">${method}</span>
      <span class="opblock-summary-path" data-path="${path}">${path}</span>
    </div>
    <div class="body-param">
      ${example ? `<div class="body-param__example"><pre>${example}</pre></div>` : ''}
      <textarea class="body-param__text">${body}</textarea>
    </div>
  `
  return div
}

describe('swagger-mock-data', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('extractJsonCandidate extracts from textarea value when valid JSON', () => {
    const block = createOpblock('POST', '/api/users', '{"username":"alice","count":5}')
    document.body.appendChild(block)
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    const candidate = extractJsonCandidate(textarea, block, document) as any
    expect(candidate).toEqual({ username: 'alice', count: 5 })
  })

  it('extractJsonCandidate falls back to rendered example pre when textarea is empty', () => {
    const block = createOpblock(
      'POST',
      '/api/users',
      '',
      '{"title":"Task Title","is_done":false}',
    )
    document.body.appendChild(block)
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    const candidate = extractJsonCandidate(textarea, block, document) as any
    expect(candidate).toEqual({ title: 'Task Title', is_done: false })
  })

  it('mountSwaggerMockData attaches floating bar before textarea', () => {
    const block = createOpblock('POST', '/api/users')
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)

    const bar = block.querySelector('.oac-mock-data-bar')
    expect(bar).not.toBeNull()
    expect(bar?.querySelector('.oac-mock-fill-btn')).not.toBeNull()
    expect(bar?.querySelector('.oac-mock-mode-btn')).not.toBeNull()
    expect(block.querySelector('textarea.body-param__text')?.previousElementSibling).toBe(bar)

    handle.dispose()
  })

  it('fills realistic mock data when fill button is clicked with existing JSON', () => {
    const initialJson = JSON.stringify({
      username: 'string',
      email: 'string',
      phone: 'string',
      age: 0,
    })
    const block = createOpblock('POST', '/api/users', initialJson)
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    const fillBtn = block.querySelector<HTMLButtonElement>('.oac-mock-fill-btn')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    fillBtn.click()

    const parsed = JSON.parse(textarea.value)
    expect(parsed.username).not.toBe('string')
    expect(parsed.email).toMatch(/@/)
    expect(typeof parsed.phone).toBe('string')
    expect(typeof parsed.age).toBe('number')

    const group = block.querySelector('.oac-mock-btn-group')
    expect(group?.classList.contains('success')).toBe(true)

    handle.dispose()
  })

  it('fills realistic mock data from Swagger rendered example when textarea is empty', () => {
    const block = createOpblock(
      'POST',
      '/api/todos',
      '',
      JSON.stringify({ title: 'string', category: 'string' }),
    )
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    const fillBtn = block.querySelector<HTMLButtonElement>('.oac-mock-fill-btn')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    expect(textarea.value).toBe('')
    fillBtn.click()

    expect(textarea.value).not.toBe('')
    const parsed = JSON.parse(textarea.value)
    expect(parsed.title).not.toBe('string')
    expect(parsed.category).toMatch(/^Category \d+$/)

    handle.dispose()
  })

  it('triggers mock data fill on Alt+M keyboard shortcut', () => {
    const block = createOpblock('POST', '/api/contacts', '{"email":"string"}')
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    textarea.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'm',
      altKey: true,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)

    const parsed = JSON.parse(textarea.value)
    expect(parsed.email).toMatch(/@/)

    handle.dispose()
  })

  it('allows changing mode from dropdown and updates data', () => {
    const block = createOpblock('POST', '/api/items', '[{"id":1,"name":"string"}]')
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    const modeBtn = block.querySelector<HTMLButtonElement>('.oac-mock-mode-btn')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    modeBtn.click()
    const dropdown = block.querySelector('.oac-mock-dropdown') as HTMLElement
    expect(dropdown.style.display).toBe('flex')

    const minimalItem = dropdown.querySelector<HTMLButtonElement>('button:nth-child(2)')!
    minimalItem.click()

    expect(dropdown.style.display).toBe('none')
    const parsed = JSON.parse(textarea.value)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(1) // Minimal arrayCount = 1

    handle.dispose()
  })

  it('shows error feedback when no JSON sample or example is found', () => {
    const block = createOpblock('POST', '/api/empty', '', '')
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    const fillBtn = block.querySelector<HTMLButtonElement>('.oac-mock-fill-btn')!
    const textarea = block.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!

    fillBtn.click()

    expect(textarea.value).toBe('')
    const group = block.querySelector('.oac-mock-btn-group')
    expect(group?.classList.contains('error')).toBe(true)

    handle.dispose()
  })

  it('cleans up attached elements on dispose', () => {
    const block = createOpblock('POST', '/api/cleanup', '{"a":1}')
    document.body.appendChild(block)

    const handle = mountSwaggerMockData(document)
    expect(block.querySelector('.oac-mock-data-bar')).not.toBeNull()

    handle.dispose()
    expect(block.querySelector('.oac-mock-data-bar')).toBeNull()
  })
})
