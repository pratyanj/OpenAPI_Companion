import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mountSwaggerResponseViewer, extractRawJsonText } from './swagger-response-viewer'

function createExecutedResponseBlock(bodyJson: string, _isJson = true): HTMLElement {
  const container = document.createElement('div')
  container.className = 'opblock is-open'
  container.innerHTML = `
    <div class="responses-wrapper">
      <table class="responses-table live-responses-table">
        <tbody>
          <tr class="response">
            <td class="response-col_status">200</td>
            <td class="response-col_description">
              <div class="response-col_description__inner">
                <h5>Response body</h5>
                <div class="highlight-code">
                  <div class="copy-to-clipboard"><span>Copy</span></div>
                  <pre class="microlight"><code>${bodyJson}</code></pre>
                </div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `
  return container
}

describe('swagger-response-viewer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
    document.body.className = ''
  })

  it('extracts raw JSON text cleanly excluding controls', () => {
    const block = createExecutedResponseBlock('{"message":"ok"}')
    const cell = block.querySelector('.response-col_description')!
    const text = extractRawJsonText(cell)
    expect(text).toBe('{"message":"ok"}')
  })

  it('mounts interactive viewer on valid JSON response cells', () => {
    const block = createExecutedResponseBlock('{"id":123,"title":"Task 1","completed":false}')
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    const mountedCount = handle.scanAndMount()

    expect(mountedCount).toBe(1)
    const viewer = document.querySelector('.oac-response-viewer-container')
    expect(viewer).toBeInTheDocument()

    // Native highlight block should be hidden
    const nativeCode = document.querySelector('.highlight-code')
    expect(nativeCode?.classList.contains('oac-swagger-raw-hidden')).toBe(true)

    // Toolbar components should be present
    expect(document.querySelector('.oac-resp-search-input')).toBeInTheDocument()
    expect(document.querySelector('.oac-resp-tool-btn')).toBeInTheDocument()
    expect(document.querySelector('.oac-resp-copy-btn')).toBeInTheDocument()

    handle.dispose()
  })

  it('ignores non-JSON or unparseable responses', () => {
    const block = createExecutedResponseBlock('502 Bad Gateway: Server Error')
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    expect(document.querySelector('.oac-response-viewer-container')).toBeNull()
    const nativeCode = document.querySelector('.highlight-code')
    expect(nativeCode?.classList.contains('oac-swagger-raw-hidden')).toBe(false)

    handle.dispose()
  })

  it('renders syntax-highlighted keys and values in tree', () => {
    const sample = JSON.stringify({
      name: 'Antigravity',
      stars: 5,
      active: true,
      meta: null,
      tags: ['ai', 'tool'],
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const tree = document.querySelector('.oac-resp-tree-view')!
    expect(tree).toBeInTheDocument()

    // Check key rendering
    const keys = Array.from(tree.querySelectorAll('.oac-tree-key')).map((k) => k.textContent)
    expect(keys).toContain('"name"')
    expect(keys).toContain('"stars"')
    expect(keys).toContain('"active"')
    expect(keys).toContain('"meta"')
    expect(keys).toContain('"tags"')

    // Check value styling classes
    expect(tree.querySelector('.oac-val-string')).toBeInTheDocument()
    expect(tree.querySelector('.oac-val-number')).toBeInTheDocument()
    expect(tree.querySelector('.oac-val-boolean')).toBeInTheDocument()
    expect(tree.querySelector('.oac-val-null')).toBeInTheDocument()

    handle.dispose()
  })

  it('collapses and expands individual nodes on toggle click', () => {
    const sample = JSON.stringify({
      user: {
        id: 1,
        profile: { role: 'admin' },
      },
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const toggles = document.querySelectorAll<HTMLButtonElement>('.oac-tree-toggle')
    expect(toggles.length).toBeGreaterThan(0)

    const firstToggle = toggles[0]!
    const node = firstToggle.closest('.oac-tree-node')!
    expect(node.classList.contains('collapsed')).toBe(false)

    // Click toggle to collapse
    firstToggle.click()
    expect(node.classList.contains('collapsed')).toBe(true)

    // Click again to expand
    firstToggle.click()
    expect(node.classList.contains('collapsed')).toBe(false)

    handle.dispose()
  })

  it('collapses all nodes and expands all nodes via toolbar buttons', () => {
    const sample = JSON.stringify({
      a: { b: 1 },
      c: { d: 2 },
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const expandBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-tool-btn'),
    ).find((b) => b.textContent?.includes('Expand All'))!
    const collapseBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-tool-btn'),
    ).find((b) => b.textContent?.includes('Collapse All'))!

    // Collapse All
    collapseBtn.click()
    const allNodes = document.querySelectorAll('.oac-tree-node')
    for (const n of Array.from(allNodes)) {
      expect(n.classList.contains('collapsed')).toBe(true)
    }

    // Expand All
    expandBtn.click()
    const collapsedNodes = document.querySelectorAll('.oac-tree-node.collapsed')
    expect(collapsedNodes.length).toBe(0)

    handle.dispose()
  })

  it('filters and highlights search matches with match counter and navigation', () => {
    const sample = JSON.stringify({
      users: [
        { id: 101, name: 'Alice Smith', email: 'alice@example.com' },
        { id: 102, name: 'Bob Jones', email: 'bob@example.com' },
        { id: 103, name: 'Alice Walker', email: 'alice.w@example.com' },
      ],
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const searchInput = document.querySelector<HTMLInputElement>('.oac-resp-search-input')!
    const matchBadge = document.querySelector<HTMLElement>('.oac-resp-match-badge')!
    const prevBtn = document.querySelector<HTMLButtonElement>('.oac-resp-nav-btn.prev')!
    const nextBtn = document.querySelector<HTMLButtonElement>('.oac-resp-nav-btn.next')!

    // Type search query
    searchInput.value = 'Alice'
    searchInput.dispatchEvent(new Event('input'))

    const matches = document.querySelectorAll('mark.oac-json-match')
    expect(matches.length).toBe(4) // 2 in names ("Alice"), 2 in emails ("alice")
    expect(matchBadge.textContent).toBe('1 / 4')

    // Navigate to next match
    nextBtn.click()
    expect(matchBadge.textContent).toBe('2 / 4')

    // Navigate to prev match
    prevBtn.click()
    expect(matchBadge.textContent).toBe('1 / 4')

    // Press Enter to go next
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(matchBadge.textContent).toBe('2 / 4')

    // Press Shift+Enter to go prev
    searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))
    expect(matchBadge.textContent).toBe('1 / 4')

    // Clear search
    const clearBtn = document.querySelector<HTMLButtonElement>('.oac-resp-search-clear')!
    clearBtn.click()
    expect(searchInput.value).toBe('')
    expect(document.querySelectorAll('mark.oac-json-match').length).toBe(0)

    handle.dispose()
  })

  it('auto-expands collapsed parent nodes when a search match is inside them', () => {
    const sample = JSON.stringify({
      deep: {
        nested: {
          secret: 'shhh_found_me',
        },
      },
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    // Collapse all nodes first
    const collapseBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-tool-btn'),
    ).find((b) => b.textContent?.includes('Collapse All'))!
    collapseBtn.click()

    // Verify root is collapsed
    const deepNode = document.querySelector('.oac-tree-node')!
    expect(deepNode.classList.contains('collapsed')).toBe(true)

    // Search for the deeply nested value
    const searchInput = document.querySelector<HTMLInputElement>('.oac-resp-search-input')!
    searchInput.value = 'shhh_found_me'
    searchInput.dispatchEvent(new Event('input'))

    // The ancestor nodes must auto-expand
    expect(deepNode.classList.contains('collapsed')).toBe(false)
    const match = document.querySelector('mark.oac-json-match')
    expect(match).toBeInTheDocument()
    expect(match?.textContent).toBe('shhh_found_me')

    handle.dispose()
  })

  it('switches between Tree view and Raw view and hides tree controls in Raw mode', () => {
    const sample = JSON.stringify({ ok: true })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const rawBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-view-btn'),
    ).find((b) => b.textContent === 'Raw')!
    const treeBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-view-btn'),
    ).find((b) => b.textContent === 'Tree')!
    const expandAllBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-tool-btn'),
    ).find((b) => b.textContent?.includes('Expand All'))!
    const collapseAllBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-tool-btn'),
    ).find((b) => b.textContent?.includes('Collapse All'))!
    const treeView = document.querySelector<HTMLElement>('.oac-resp-tree-view')!
    const nativeCode = document.querySelector<HTMLElement>('.highlight-code')!

    // In Tree mode initially
    expect(expandAllBtn.style.display).toBe('')
    expect(collapseAllBtn.style.display).toBe('')

    // Click Raw
    rawBtn.click()
    expect(rawBtn.classList.contains('active')).toBe(true)
    expect(treeBtn.classList.contains('active')).toBe(false)
    expect(treeView.style.display).toBe('none')
    expect(nativeCode.classList.contains('oac-swagger-raw-hidden')).toBe(false)
    // Tree controls must be hidden in Raw mode
    expect(expandAllBtn.style.display).toBe('none')
    expect(collapseAllBtn.style.display).toBe('none')

    // Click Tree
    treeBtn.click()
    expect(treeBtn.classList.contains('active')).toBe(true)
    expect(treeView.style.display).toBe('block')
    expect(nativeCode.classList.contains('oac-swagger-raw-hidden')).toBe(true)
    // Tree controls restored
    expect(expandAllBtn.style.display).toBe('')
    expect(collapseAllBtn.style.display).toBe('')

    handle.dispose()
  })

  it('supports search, match counting, and navigation inside Raw view', () => {
    const sample = JSON.stringify({
      status: 'active',
      role: 'admin',
      desc: 'Active administrator account',
    })
    const block = createExecutedResponseBlock(sample)
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const rawBtn = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.oac-resp-view-btn'),
    ).find((b) => b.textContent === 'Raw')!
    rawBtn.click()

    const searchInput = document.querySelector<HTMLInputElement>('.oac-resp-search-input')!
    const matchBadge = document.querySelector<HTMLElement>('.oac-resp-match-badge')!
    const prevBtn = document.querySelector<HTMLButtonElement>('.oac-resp-nav-btn.prev')!
    const nextBtn = document.querySelector<HTMLButtonElement>('.oac-resp-nav-btn.next')!
    const nativeCode = document.querySelector<HTMLElement>('.highlight-code')!

    // Search for "admin" in Raw view
    searchInput.value = 'admin'
    searchInput.dispatchEvent(new Event('input'))

    const rawMarks = nativeCode.querySelectorAll('mark.oac-json-match')
    expect(rawMarks.length).toBe(2) // 1 in 'role: admin', 1 in 'Active administrator'
    expect(matchBadge.textContent).toBe('1 / 2')

    // Navigate to next match
    nextBtn.click()
    expect(matchBadge.textContent).toBe('2 / 2')

    // Navigate to prev match
    prevBtn.click()
    expect(matchBadge.textContent).toBe('1 / 2')

    // Clear search
    const clearBtn = document.querySelector<HTMLButtonElement>('.oac-resp-search-clear')!
    clearBtn.click()
    expect(nativeCode.querySelectorAll('mark.oac-json-match').length).toBe(0)

    handle.dispose()
  })

  it('copies formatted JSON to clipboard with feedback', async () => {
    const sampleObj = { greeting: 'hello world', num: 42 }
    const block = createExecutedResponseBlock(JSON.stringify(sampleObj))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const copyBtn = document.querySelector<HTMLButtonElement>('.oac-resp-copy-btn')!
    copyBtn.click()
    await Promise.resolve()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(sampleObj, null, 2))
    expect(copyBtn.classList.contains('copied')).toBe(true)
    expect(copyBtn.textContent).toContain('Copied!')

    handle.dispose()
  })

  it('copies JSON path when clicking property key', () => {
    const sampleObj = { user: { profile: { email: 'test@example.com' } } }
    const block = createExecutedResponseBlock(JSON.stringify(sampleObj))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const emailKey = Array.from(document.querySelectorAll<HTMLElement>('.oac-tree-key')).find(
      (k) => k.textContent === '"email"',
    )!
    expect(emailKey).toBeInTheDocument()

    emailKey.click()
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('user.profile.email')

    handle.dispose()
  })

  it('dynamically updates tree view when response is re-executed with new data', () => {
    const block = createExecutedResponseBlock(JSON.stringify({ id: 15, name: 'Alex' }))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    const tree = document.querySelector('.oac-resp-tree-view')!
    expect(tree.textContent).toContain('15')
    expect(tree.textContent).toContain('"Alex"')

    // Simulate Swagger UI re-executing and updating code element with new data
    const codeEl = block.querySelector('.highlight-code pre code')!
    codeEl.textContent = JSON.stringify({ id: 16, name: 'Bob' })

    // Observer / scanAndMount detects the change
    handle.scanAndMount()

    expect(tree.textContent).not.toContain('"Alex"')
    expect(tree.textContent).toContain('16')
    expect(tree.textContent).toContain('"Bob"')

    handle.dispose()
  })

  it('mounts export dropdown in toolbar and toggles open/close', () => {
    const block = createExecutedResponseBlock(JSON.stringify([{ id: 1, name: 'Item 1' }]))
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    const exportBtn = document.querySelector('.oac-resp-export-btn') as HTMLButtonElement
    const dropdown = document.querySelector('.oac-resp-export-dropdown') as HTMLElement

    expect(exportBtn).toBeTruthy()
    expect(dropdown).toBeTruthy()
    expect(dropdown.classList.contains('oac-hidden')).toBe(true)

    // Open dropdown
    exportBtn.click()
    expect(dropdown.classList.contains('oac-hidden')).toBe(false)

    // Outside click closes it
    document.body.click()
    expect(dropdown.classList.contains('oac-hidden')).toBe(true)

    handle.dispose()
  })

  it('triggers JSON and CSV download on export item clicks', () => {
    const sample = [{ id: 101, title: 'Export Task', done: false }]
    const block = createExecutedResponseBlock(JSON.stringify(sample))
    document.body.appendChild(block)

    // Mock download
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:mock-export-url')
    global.URL.revokeObjectURL = vi.fn()

    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })

    const handle = mountSwaggerResponseViewer(document)
    const exportBtn = document.querySelector('.oac-resp-export-btn') as HTMLButtonElement
    exportBtn.click()

    const items = document.querySelectorAll('.oac-resp-export-item')
    const jsonItem = Array.from(items).find((el) =>
      el.textContent?.includes('JSON'),
    ) as HTMLButtonElement
    const csvItem = Array.from(items).find((el) =>
      el.textContent?.includes('CSV'),
    ) as HTMLButtonElement

    expect(jsonItem).toBeTruthy()
    expect(csvItem).toBeTruthy()
    expect(csvItem.disabled).toBe(false)

    // Click Export JSON
    jsonItem.click()
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(exportBtn.textContent).toContain('Exported JSON!')

    // Click Export CSV
    exportBtn.click()
    csvItem.click()
    expect(clickSpy).toHaveBeenCalledTimes(2)
    expect(exportBtn.textContent).toContain('Exported CSV!')

    handle.dispose()
  })

  it('disposes cleanly and restores native view', () => {
    const block = createExecutedResponseBlock('{"test":1}')
    document.body.appendChild(block)

    const handle = mountSwaggerResponseViewer(document)
    handle.scanAndMount()

    expect(document.querySelector('.oac-response-viewer-container')).toBeInTheDocument()

    handle.dispose()

    expect(document.querySelector('.oac-response-viewer-container')).toBeNull()
    const nativeCode = document.querySelector('.highlight-code')
    expect(nativeCode?.classList.contains('oac-swagger-raw-hidden')).toBe(false)
  })
})
