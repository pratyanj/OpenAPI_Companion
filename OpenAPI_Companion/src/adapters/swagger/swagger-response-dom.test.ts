import { describe, it, expect, afterEach } from 'vitest'
import { readExecutedResponses } from './swagger-response-dom'

/** Synthetic Swagger operation block with a rendered live response. */
function executedBlock(method: string, path: string, status: string, body: string): string {
  return `
    <div class="opblock is-open">
      <div class="opblock-summary">
        <span class="opblock-summary-method">${method}</span>
        <span class="opblock-summary-path" data-path="${path}">${path}</span>
      </div>
      <textarea class="body-param__text">{"in":1}</textarea>
      <div class="responses-wrapper">
        <table class="responses-table live-responses-table">
          <thead class="responses-header">
            <tr>
              <td class="col_header response-col_status">Code</td>
              <td class="col_header response-col_description">Details</td>
            </tr>
          </thead>
          <tbody>
            <tr class="response">
              <td class="response-col_status">${status}</td>
              <td class="response-col_description">
                <div class="highlight-code"><pre class="microlight">${body}</pre></div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>`
}

describe('swagger-response-dom', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reads status, response body, and request body from an executed operation', () => {
    document.body.innerHTML = executedBlock('POST', '/users', '201', '{"id":7}')
    expect(readExecutedResponses(document)).toEqual([
      {
        endpointId: 'post /users',
        method: 'post',
        endpoint: '/users',
        requestBody: '{"in":1}',
        status: 201,
        responseBody: '{"id":7}',
      },
    ])
  })

  it('ignores operations that have not been executed', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/ping">/ping</span>
        </div>
      </div>`
    expect(readExecutedResponses(document)).toEqual([])
  })

  it('parses the status code out of a longer label', () => {
    document.body.innerHTML = executedBlock('GET', '/x', '404 Not Found', 'nope')
    const [res] = readExecutedResponses(document)
    expect(res?.status).toBe(404)
  })
})
