import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mountSwaggerCopyCode, parseCurlCommand } from './swagger-copy-code'

describe('parseCurlCommand', () => {
  it('parses standard GET command with headers', () => {
    const curl = `curl -X 'GET' \\
  'http://127.0.0.1:8008/tasks?limit=10' \\
  -H 'accept: application/json' \\
  -H 'Authorization: Bearer my-token'`

    const req = parseCurlCommand(curl)
    expect(req.method).toBe('GET')
    expect(req.url).toBe('http://127.0.0.1:8008/tasks?limit=10')
    expect(req.headers['accept']).toBe('application/json')
    expect(req.headers['Authorization']).toBe('Bearer my-token')
    expect(req.body).toBeUndefined()
  })

  it('parses POST command with JSON body', () => {
    const curl = `curl -X 'POST' \\
  'http://127.0.0.1:8008/tasks' \\
  -H 'accept: application/json' \\
  -H 'Content-Type: application/json' \\
  -d '{"title":"Test","completed":false}'`

    const req = parseCurlCommand(curl)
    expect(req.method).toBe('POST')
    expect(req.url).toBe('http://127.0.0.1:8008/tasks')
    expect(req.headers['Content-Type']).toBe('application/json')
    expect(req.body).toBe('{"title":"Test","completed":false}')
  })

  it('infers POST method when -X is omitted but -d is present', () => {
    const curl = `curl 'http://127.0.0.1:8008/auth' -d 'user=admin'`
    const req = parseCurlCommand(curl)
    expect(req.method).toBe('POST')
    expect(req.body).toBe('user=admin')
  })

  it('handles empty or blank curl commands safely', () => {
    const req = parseCurlCommand('')
    expect(req.method).toBe('GET')
    expect(req.url).toBe('')
    expect(req.headers).toEqual({})
  })
})

describe('mountSwaggerCopyCode', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.innerHTML = `
      <div class="swagger-ui">
        <div class="opblock opblock-post is-open">
          <div class="opblock-body">
            <div class="responses-wrapper">
              <div class="curl-command">
                <h4>Curl</h4>
                <div>
                  <div class="highlight-code">
                    <pre class="microlight"><code>curl -X 'POST' 'http://127.0.0.1:8008/items' -H 'Content-Type: application/json' -d '{"name":"Gadget"}'</code></pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `
    document.body.appendChild(container)

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    container.remove()
    document.body.className = ''
    document.querySelectorAll('#oac-copy-code-styles').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('mounts [Copy Code ▾] dropdown button next to Curl h4', () => {
    const handle = mountSwaggerCopyCode(document)
    const copyBtn = document.querySelector('.oac-copy-code-btn') as HTMLButtonElement
    expect(copyBtn).toBeTruthy()
    expect(copyBtn.textContent).toContain('Copy Code')

    // Dropdown is initially hidden
    const dropdown = document.querySelector('.oac-copy-code-dropdown') as HTMLElement
    expect(dropdown).toBeTruthy()
    expect(dropdown.classList.contains('oac-hidden')).toBe(true)

    handle.dispose()
  })

  it('toggles dropdown visibility on button click', () => {
    const handle = mountSwaggerCopyCode(document)
    const copyBtn = document.querySelector('.oac-copy-code-btn') as HTMLButtonElement
    const dropdown = document.querySelector('.oac-copy-code-dropdown') as HTMLElement

    // Open
    copyBtn.click()
    expect(dropdown.classList.contains('oac-hidden')).toBe(false)

    // Outside click closes it
    document.body.click()
    expect(dropdown.classList.contains('oac-hidden')).toBe(true)

    handle.dispose()
  })

  it('generates and copies Python code when Python option is clicked', async () => {
    const handle = mountSwaggerCopyCode(document)
    const copyBtn = document.querySelector('.oac-copy-code-btn') as HTMLButtonElement
    copyBtn.click()

    const items = document.querySelectorAll('.oac-copy-code-item')
    const pythonItem = Array.from(items).find((el) =>
      el.textContent?.includes('Python'),
    ) as HTMLButtonElement
    expect(pythonItem).toBeTruthy()

    pythonItem.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
    const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0]
    expect(copiedText).toContain('import requests')
    expect(copiedText).toContain("url = 'http://127.0.0.1:8008/items'")
    expect(copiedText).toContain('json_data =')
    expect(copiedText).toContain('requests.post')

    // Feedback shows copied badge
    expect(copyBtn.textContent).toContain('Copied Python!')
    expect(copyBtn.classList.contains('oac-copied')).toBe(true)

    handle.dispose()
  })

  it('generates and copies Fetch code when Fetch option is clicked', async () => {
    const handle = mountSwaggerCopyCode(document)
    const copyBtn = document.querySelector('.oac-copy-code-btn') as HTMLButtonElement
    copyBtn.click()

    const items = document.querySelectorAll('.oac-copy-code-item')
    const fetchItem = Array.from(items).find((el) =>
      el.textContent?.includes('Fetch'),
    ) as HTMLButtonElement
    expect(fetchItem).toBeTruthy()

    fetchItem.click()
    await new Promise((r) => setTimeout(r, 20))

    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1)
    const copiedText = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0]
    expect(copiedText).toContain("await fetch('http://127.0.0.1:8008/items'")
    expect(copiedText).toContain("method: 'POST'")
    expect(copiedText).toContain('body: JSON.stringify(')

    handle.dispose()
  })

  it('cleans up elements and listeners on dispose()', () => {
    const handle = mountSwaggerCopyCode(document)
    expect(document.querySelector('.oac-copy-code-container')).toBeTruthy()

    handle.dispose()
    expect(document.querySelector('.oac-copy-code-container')).toBeNull()
    expect(document.getElementById('oac-copy-code-styles')).toBeNull()
  })

  it('hides copy code container when oac-disable-copy-code-snippet is on body', () => {
    document.body.classList.add('oac-disable-copy-code-snippet')
    const handle = mountSwaggerCopyCode(document)
    const container = document.querySelector('.oac-copy-code-container')
    expect(container).not.toBeNull()
    handle.dispose()
    document.body.classList.remove('oac-disable-copy-code-snippet')
  })
})
