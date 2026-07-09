import { describe, it, expect, afterEach } from 'vitest'
import {
  endpointIdOf,
  readOpenRequests,
  writeRequestBody,
  autoExecute,
} from './swagger-request-dom'
import { readExecutedResponses } from './swagger-response-dom'
import { listEndpoints, openEndpoint } from './swagger-endpoint-dom'

/**
 * R-01 version matrix (T-10.6): the same adapter selectors must work across the
 * Swagger UI markup generations we target. Each fixture reproduces that
 * generation's real structural differences:
 *
 * - 3.x  — summary is a plain DIV (no button); path text only (no data-path).
 * - 4.x  — summary DIV; path carries `data-path`; OAS2 "Edit Value" body toggle.
 * - 5.x  — summary wrapped in a `.opblock-summary-control` BUTTON; `data-path`.
 */

interface Fixture {
  version: string
  html: string
  /** Which element receives the expand click in this generation. */
  expandTarget: string
}

const RESPONSE_TABLE = `
  <table class="responses-table live-responses-table">
    <thead><tr>
      <td class="col_header response-col_status">Code</td>
      <td class="col_header response-col_description">Details</td>
    </tr></thead>
    <tbody><tr class="response">
      <td class="response-col_status">200</td>
      <td class="response-col_description"><pre class="microlight">{"id":7}</pre></td>
    </tr></tbody>
  </table>`

const FIXTURES: Fixture[] = [
  {
    version: '3.x',
    expandTarget: '.opblock-summary',
    html: `
      <div class="opblock-tag-section">
        <h4 class="opblock-tag" data-tag="Users"></h4>
        <div class="opblock opblock-post is-open">
          <div class="opblock-summary opblock-summary-post">
            <span class="opblock-summary-method">POST</span>
            <span class="opblock-summary-path"><a>/users</a></span>
            <div class="opblock-summary-description">Create user</div>
          </div>
          <textarea class="body-param__text">{"name":"a"}</textarea>
          <button class="btn execute">Execute</button>
          ${RESPONSE_TABLE}
        </div>
      </div>`,
  },
  {
    version: '4.x',
    expandTarget: '.opblock-summary',
    html: `
      <div class="opblock-tag-section">
        <h4 class="opblock-tag" data-tag="Users"></h4>
        <div class="opblock opblock-post is-open">
          <div class="opblock-summary opblock-summary-post">
            <span class="opblock-summary-method">POST</span>
            <span class="opblock-summary-path" data-path="/users">/users</span>
            <div class="opblock-summary-description">Create user</div>
          </div>
          <textarea class="body-param__text">{"name":"a"}</textarea>
          <button class="btn execute">Execute</button>
          ${RESPONSE_TABLE}
        </div>
      </div>`,
  },
  {
    version: '5.x',
    expandTarget: '.opblock-summary-control',
    html: `
      <div class="opblock-tag-section">
        <h4 class="opblock-tag" data-tag="Users"></h4>
        <div class="opblock opblock-post is-open">
          <button class="opblock-summary-control opblock-summary opblock-summary-post">
            <span class="opblock-summary-method">POST</span>
            <span class="opblock-summary-path" data-path="/users">/users</span>
            <div class="opblock-summary-description">Create user</div>
          </button>
          <textarea class="body-param__text">{"name":"a"}</textarea>
          <button class="btn execute">Execute</button>
          ${RESPONSE_TABLE}
        </div>
      </div>`,
  },
]

describe.each(FIXTURES)('Swagger UI $version markup', ({ html, expandTarget }) => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('derives the endpoint id', () => {
    document.body.innerHTML = html
    expect(endpointIdOf(document.querySelector('.opblock')!)).toBe('post /users')
  })

  it('lists the endpoint with summary and tag', () => {
    document.body.innerHTML = html
    expect(listEndpoints(document)).toEqual([
      {
        endpointId: 'post /users',
        method: 'post',
        path: '/users',
        summary: 'Create user',
        tag: 'Users',
      },
    ])
  })

  it('reads and writes the open request body', () => {
    document.body.innerHTML = html
    expect(readOpenRequests(document)).toEqual([
      { endpointId: 'post /users', method: 'post', body: '{"name":"a"}' },
    ])
    expect(writeRequestBody(document, 'post /users', '{"name":"b"}')).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('.body-param__text')!.value).toBe(
      '{"name":"b"}',
    )
  })

  it('captures the executed response (data row, not the header)', () => {
    document.body.innerHTML = html
    expect(readExecutedResponses(document)).toEqual([
      {
        endpointId: 'post /users',
        method: 'post',
        endpoint: '/users',
        requestBody: '{"name":"a"}',
        status: 200,
        responseBody: '{"id":7}',
      },
    ])
  })

  it('navigates: expands a collapsed operation via this generation`s control', () => {
    document.body.innerHTML = html
    const block = document.querySelector('.opblock')!
    block.classList.remove('is-open')
    let clicks = 0
    block.querySelector(expandTarget)!.addEventListener('click', () => (clicks += 1))
    expect(openEndpoint(document, 'post /users')).toBe(true)
    expect(clicks).toBe(1)
  })

  it('auto-executes end-to-end (fill + Execute)', () => {
    document.body.innerHTML = html
    let executed = false
    document.querySelector('.btn.execute')!.addEventListener('click', () => (executed = true))
    autoExecute(document, 'post /users', { body: '{"x":1}', setTimeoutFn: (fn) => fn() })
    expect(executed).toBe(true)
    expect(document.querySelector<HTMLTextAreaElement>('.body-param__text')!.value).toBe('{"x":1}')
  })
})
