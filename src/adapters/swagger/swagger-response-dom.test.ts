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

  // Regression: Swagger nests Download / Copy buttons INSIDE the body wrapper, so
  // textContent came back as `Download{"success":…}` — unparseable JSON, which
  // silently broke auto token refresh (no token found in the login response).
  it('excludes Swagger’s own controls from the captured body', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/auth/login"></span>
        </div>
        <table class="live-responses-table">
          <tbody>
            <tr>
              <td class="response-col_status">200</td>
              <td class="response-col_description">
                <div class="highlight-code">
                  <button class="copy-to-clipboard"><svg></svg></button>
                  <button class="download-contents">Download</button>
                  <pre class="microlight">{"data":{"tokens":{"access_token":"eyJhbGciOi.abc.def"}}}</pre>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>`

    const [response] = readExecutedResponses(document)
    expect(response?.responseBody?.startsWith('{')).toBe(true)
    expect(response?.responseBody).not.toContain('Download')
    // The whole point: it must be parseable, so the token can be extracted.
    const parsed = JSON.parse(response?.responseBody ?? '') as {
      data: { tokens: { access_token: string } }
    }
    expect(parsed.data.tokens.access_token).toBe('eyJhbGciOi.abc.def')
  })
  it('reads query parameters and path parameters from input fields and request URL', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">GET</span>
          <span class="opblock-summary-path" data-path="/tasks/{task_id}">/tasks/{task_id}</span>
        </div>
        <table class="parameters">
          <tbody>
            <tr data-param-name="task_id" data-param-in="path">
              <td class="parameters-col_name"><div class="parameter__name">task_id</div></td>
              <td class="parameters-col_description"><input class="parameter" value="99" /></td>
            </tr>
            <tr data-param-name="tag" data-param-in="query">
              <td class="parameters-col_name"><div class="parameter__name">tag</div></td>
              <td class="parameters-col_description"><input class="parameter" value="work" /></td>
            </tr>
          </tbody>
        </table>
        <div class="responses-wrapper">
          <div class="request-url">
            <pre class="microlight">http://127.0.0.1:8000/api/tasks/99?tag=work&status=active</pre>
          </div>
          <table class="responses-table live-responses-table">
            <tbody>
              <tr class="response">
                <td class="response-col_status">200</td>
                <td class="response-col_description">
                  <div class="highlight-code"><pre class="microlight">{"id":99}</pre></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`

    const [res] = readExecutedResponses(document)
    expect(res).toBeDefined()
    expect(res.endpointId).toBe('get /tasks/{task_id}')
    expect(res.status).toBe(200)
    expect(res.queryParams).toEqual({ tag: 'work', status: 'active' })
    expect(res.pathParams).toEqual({ task_id: '99' })
    expect(res.requestUrl).toBe('http://127.0.0.1:8000/api/tasks/99?tag=work&status=active')
  })

  it('extracts query and headers from rendered cURL fallback when request-url is absent', () => {
    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">POST</span>
          <span class="opblock-summary-path" data-path="/items">/items</span>
        </div>
        <div class="responses-wrapper">
          <div class="curl-command">
            <pre>curl -X POST "http://localhost:8000/items?category=books" -H "X-Tenant: acme" -d '{"name":"book1"}'</pre>
          </div>
          <table class="responses-table live-responses-table">
            <tbody>
              <tr class="response">
                <td class="response-col_status">201</td>
                <td class="response-col_description">
                  <div class="highlight-code"><pre class="microlight">{"ok":true}</pre></div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`

    const [res] = readExecutedResponses(document)
    expect(res).toBeDefined()
    expect(res.queryParams).toEqual({ category: 'books' })
    expect(res.headers).toEqual({ 'X-Tenant': 'acme' })
    expect(res.requestUrl).toBe('http://localhost:8000/items?category=books')
  })
})
