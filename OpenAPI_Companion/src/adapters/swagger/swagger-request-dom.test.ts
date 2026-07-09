import { describe, it, expect, afterEach } from 'vitest'
import {
  readOpenRequests,
  writeRequestBody,
  isBodyEmpty,
  endpointIdOf,
  findAnyBlock,
  autoExecute,
  clickExecute,
} from './swagger-request-dom'

/** Minimal synthetic Swagger operation block matching the selectors we rely on. */
function opblock(method: string, path: string, body = ''): string {
  return `
    <div class="opblock is-open">
      <div class="opblock-summary">
        <span class="opblock-summary-method">${method}</span>
        <span class="opblock-summary-path" data-path="${path}">${path}</span>
      </div>
      <textarea class="body-param__text">${body}</textarea>
    </div>`
}

describe('swagger-request-dom', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('derives an endpoint id from method + path', () => {
    document.body.innerHTML = opblock('POST', '/users')
    const block = document.querySelector('.opblock')!
    expect(endpointIdOf(block)).toBe('post /users')
  })

  it('reads the body of open operations', () => {
    document.body.innerHTML = opblock('POST', '/users', '{"name":"a"}') + opblock('GET', '/ping')
    const snapshots = readOpenRequests(document)
    expect(snapshots).toEqual([
      { endpointId: 'post /users', method: 'post', body: '{"name":"a"}' },
      { endpointId: 'get /ping', method: 'get', body: undefined },
    ])
  })

  it('ignores closed operations', () => {
    document.body.innerHTML = opblock('POST', '/users', '{}').replace('is-open', 'is-closed')
    expect(readOpenRequests(document)).toEqual([])
  })

  it('writes the body back into the matching operation (React-compatible)', () => {
    document.body.innerHTML = opblock('POST', '/users')
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!
    let sawInput = false
    textarea.addEventListener('input', () => (sawInput = true))

    const ok = writeRequestBody(document, 'post /users', '{"restored":true}')

    expect(ok).toBe(true)
    expect(textarea.value).toBe('{"restored":true}')
    expect(sawInput).toBe(true) // dispatched an input event so React state updates
  })

  it('returns false writing to an operation that is not open', () => {
    document.body.innerHTML = opblock('POST', '/users')
    expect(writeRequestBody(document, 'get /other', '{}')).toBe(false)
  })

  it('reports an empty body for safe auto-restore', () => {
    document.body.innerHTML = opblock('POST', '/users', '')
    expect(isBodyEmpty(document, 'post /users')).toBe(true)
    writeRequestBody(document, 'post /users', '{"x":1}')
    expect(isBodyEmpty(document, 'post /users')).toBe(false)
  })

  it('finds a block even when it is collapsed', () => {
    document.body.innerHTML = opblock('POST', '/users').replace('is-open', 'is-closed')
    expect(readOpenRequests(document)).toEqual([]) // not open…
    expect(endpointIdOf(findAnyBlock(document, 'post /users')!)).toBe('post /users') // …but findable
  })

  it('autoExecute drives a collapsed operation all the way to Execute', () => {
    // A fresh, collapsed operation. We simulate Swagger's async re-renders as
    // synchronous DOM mutations on each click, and drive the state machine with
    // a synchronous scheduler so the whole sequence completes in the test.
    document.body.innerHTML = `
      <div class="opblock">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/users">/users</span>
        </button>
      </div>`
    const block = document.querySelector('.opblock')!
    let executed = false

    block.querySelector('.opblock-summary-control')!.addEventListener('click', () => {
      block.classList.add('is-open') // expanded
      const tryOut = document.createElement('button')
      tryOut.className = 'try-out__btn'
      tryOut.addEventListener('click', () => {
        const ta = document.createElement('textarea')
        ta.className = 'body-param__text'
        block.appendChild(ta)
        const exec = document.createElement('button')
        exec.className = 'btn execute'
        exec.addEventListener('click', () => (executed = true))
        block.appendChild(exec)
      })
      block.appendChild(tryOut)
    })

    const started = autoExecute(document, 'post /users', {
      body: '{"name":"x"}',
      setTimeoutFn: (fn) => fn(),
    })

    expect(started).toBe(true)
    expect(executed).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!.value).toBe(
      '{"name":"x"}',
    )
  })

  it('autoExecute never re-clicks (collapses) an already-open operation', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/ping">/ping</span>
        </button>
        <button class="btn execute">Execute</button>
      </div>`
    let expandClicks = 0
    let executed = false
    document
      .querySelector('.opblock-summary-control')!
      .addEventListener('click', () => (expandClicks += 1))
    document.querySelector('.btn.execute')!.addEventListener('click', () => (executed = true))

    autoExecute(document, 'get /ping', { setTimeoutFn: (fn) => fn() })

    expect(expandClicks).toBe(0) // already open — must not toggle it shut
    expect(executed).toBe(true)
  })

  it('autoExecute returns false for an unknown endpoint', () => {
    document.body.innerHTML = opblock('POST', '/users')
    expect(autoExecute(document, 'get /missing')).toBe(false)
  })

  it('autoExecute clicks "Edit Value" when the body is behind it (OAS2 param body)', () => {
    // After try-out, this Swagger version shows an example + "Edit Value" button
    // instead of a textarea; the textarea only mounts after clicking it.
    document.body.innerHTML = `
      <div class="opblock is-open">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/login">/login</span>
        </button>
        <div class="body-param-edit">
          <button class="btn edit body-param__example-edit">Edit Value</button>
        </div>
        <button class="btn execute">Execute</button>
      </div>`
    const block = document.querySelector('.opblock')!
    let executed = false
    block.querySelector('.btn.execute')!.addEventListener('click', () => (executed = true))
    block.querySelector('.body-param__example-edit')!.addEventListener('click', () => {
      const ta = document.createElement('textarea')
      ta.className = 'body-param__text'
      block.appendChild(ta) // Swagger re-render swaps example → editable textarea
    })

    autoExecute(document, 'post /login', { body: '{"user":"a"}', setTimeoutFn: (fn) => fn() })

    expect(executed).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('textarea.body-param__text')!.value).toBe(
      '{"user":"a"}',
    )
  })

  it('autoExecute passes through and executes when there is no Edit Value toggle', () => {
    // Versions without the toggle (and no textarea at all): try, then pass —
    // never stall; Swagger executes with its example value.
    document.body.innerHTML = `
      <div class="opblock is-open">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/login">/login</span>
        </button>
        <button class="btn execute">Execute</button>
      </div>`
    let executed = false
    document.querySelector('.btn.execute')!.addEventListener('click', () => (executed = true))

    autoExecute(document, 'post /login', { body: '{"user":"a"}', setTimeoutFn: (fn) => fn() })

    expect(executed).toBe(true)
  })

  it('autoExecute gives up on a clicked Edit Value that never mounts and still executes', () => {
    // "Try or pass": the toggle exists but the textarea never appears — after
    // the edit-wait budget we execute anyway instead of stalling.
    document.body.innerHTML = `
      <div class="opblock is-open">
        <button class="opblock-summary opblock-summary-control">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/login">/login</span>
        </button>
        <div class="body-param-edit"><button class="body-param__example-edit">Edit Value</button></div>
        <button class="btn execute">Execute</button>
      </div>`
    let executed = false
    document.querySelector('.btn.execute')!.addEventListener('click', () => (executed = true))

    autoExecute(document, 'post /login', { body: '{"user":"a"}', setTimeoutFn: (fn) => fn() })

    expect(executed).toBe(true)
  })

  it('clickExecute clicks the Execute button', () => {
    document.body.innerHTML = `<div class="opblock is-open"><button class="btn execute">Execute</button></div>`
    const block = document.querySelector('.opblock')!
    let clicked = false
    block.querySelector('.btn.execute')!.addEventListener('click', () => (clicked = true))
    expect(clickExecute(block)).toBe(true)
    expect(clicked).toBe(true)
  })

  it('clickExecute returns false when there is no Execute button', () => {
    document.body.innerHTML = opblock('POST', '/users')
    expect(clickExecute(document.querySelector('.opblock')!)).toBe(false)
  })
})
