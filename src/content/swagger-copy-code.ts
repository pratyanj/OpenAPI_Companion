/**
 * Swagger UI Multi-Language "Copy Code" Dropdown Integration (Point 9).
 *
 * Injects a sleek [Copy Code ] dropdown button directly alongside Swagger UI's
 * native Curl block (.curl-command), enabling developers to instantly copy runnable
 * requests in:
 * - cURL (Bash / Linux / macOS)
 * - cURL (PowerShell Invoke-RestMethod)
 * - JavaScript (Fetch API)
 * - JavaScript (Axios)
 * - Python (Requests)
 *
 * Zero-emoji policy: Strictly uses clean inline SVG vector icons.
 */

import { generateCode } from '@/modules/productivity/codegen'
import type { CodeGenRequest, CodeLang } from '@/modules/productivity/types'

export interface SwaggerCopyCodeHandle {
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-copy-code-styles'
const ATTACHED_ATTR = 'data-oac-copy-code-attached'

const SVG_ICONS = {
  code: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>`,
  chevronDown: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
  check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
}

const CSS_STYLES = `
/* Hide when copyCodeSnippet feature is disabled in Config */
body.oac-disable-copy-code-snippet .oac-copy-code-container,
body.oac-disable-copy-code-snippet .oac-copy-code-btn,
body.oac-disable-copy-code-snippet .oac-copy-code-dropdown {
  display: none !important;
}

.swagger-ui .curl-command {
  position: relative !important;
}

.swagger-ui .responses-inner h4,
.swagger-ui .curl-command h4,
.swagger-ui .responses-wrapper h4 {
  display: inline-block !important;
  vertical-align: middle !important;
  margin: 0 8px 0 0 !important;
  padding: 6px 0 !important;
}

.oac-copy-code-container {
  display: inline-flex !important;
  align-items: center !important;
  position: relative !important;
  margin-left: 10px !important;
  vertical-align: middle !important;
  box-sizing: border-box !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
}

.oac-copy-code-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 5px !important;
  height: 24px !important;
  padding: 0 9px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #3b4151 !important;
  background: #ffffff !important;
  border: 1px solid #d9d9d9 !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  line-height: 1 !important;
  transition: all 0.15s ease !important;
  user-select: none !important;
  outline: none !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
}

.oac-copy-code-btn:hover {
  background: #f8fafc !important;
  border-color: #94a3b8 !important;
  color: #0f172a !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1) !important;
}

.oac-copy-code-btn:active {
  background: #e2e8f0 !important;
}

.oac-copy-code-btn.oac-copied {
  color: #15803d !important;
  background: #f0fdf4 !important;
  border-color: #86efac !important;
}

.oac-copy-code-dropdown {
  position: absolute !important;
  top: calc(100% + 4px) !important;
  left: 0 !important;
  z-index: 99999 !important;
  min-width: 200px !important;
  background: #ffffff !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 6px !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
  padding: 4px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
  box-sizing: border-box !important;
}

.oac-copy-code-dropdown.oac-hidden {
  display: none !important;
}

.oac-copy-code-item {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  padding: 6px 9px !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #334155 !important;
  border-radius: 4px !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer !important;
  text-align: left !important;
  box-sizing: border-box !important;
  transition: background 0.12s ease, color 0.12s ease !important;
  line-height: 1.3 !important;
}

.oac-copy-code-item:hover {
  background: #f1f5f9 !important;
  color: #0f172a !important;
}

.oac-copy-code-badge {
  font-size: 9px !important;
  font-weight: 600 !important;
  padding: 1px 5px !important;
  border-radius: 3px !important;
  background: #e2e8f0 !important;
  color: #475569 !important;
  text-transform: uppercase !important;
}
`

interface CodeOption {
  lang: CodeLang
  label: string
  badge: string
}

const CODE_OPTIONS: CodeOption[] = [
  { lang: 'curl', label: 'cURL (Bash)', badge: 'cURL' },
  { lang: 'powershell', label: 'cURL (PowerShell)', badge: 'PS' },
  { lang: 'fetch', label: 'JavaScript (Fetch)', badge: 'Fetch' },
  { lang: 'axios', label: 'JavaScript (Axios)', badge: 'Axios' },
  { lang: 'python', label: 'Python (Requests)', badge: 'Python' },
]

/**
 * Parses Swagger UI's rendered cURL command into a structured CodeGenRequest.
 */
export function parseCurlCommand(raw: string): CodeGenRequest {
  const clean = (raw || '').trim()
  if (!clean) {
    return { method: 'GET', url: '', headers: {} }
  }

  // Normalize line continuations (\ followed by newline)
  const normalized = clean.replace(/\\\r?\n\s*/g, ' ')

  // 1. Method
  let method = 'GET'
  const methodMatch = normalized.match(/(?:-X|--request)\s+['"]?([A-Za-z]+)['"]?/i)
  if (methodMatch) {
    method = methodMatch[1].toUpperCase()
  }

  // 2. Headers
  const headers: Record<string, string> = {}
  const headerRegex = /(?:-H|--header)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/g
  let hMatch: RegExpExecArray | null
  while ((hMatch = headerRegex.exec(normalized)) !== null) {
    const rawHeader = hMatch[1] ?? hMatch[2] ?? hMatch[3] ?? ''
    const colonIdx = rawHeader.indexOf(':')
    if (colonIdx > 0) {
      const key = rawHeader.slice(0, colonIdx).trim()
      const val = rawHeader.slice(colonIdx + 1).trim()
      headers[key] = val
    }
  }

  // 3. Body
  let body: string | undefined
  const bodyRegex = /(?:-d|--data|--data-raw|--data-binary)\s+(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|([^\s]+))/
  const bodyMatch = normalized.match(bodyRegex)
  if (bodyMatch) {
    body = bodyMatch[1] ?? bodyMatch[2] ?? bodyMatch[3]
    if (body) {
      body = body.replace(/\\'/g, "'").replace(/\\"/g, '"')
    }
  }

  if (!methodMatch && body) {
    method = 'POST'
  }

  // 4. URL
  let url = ''
  const urlMatch = normalized.match(/['"]?(https?:\/\/[^\s'"\\]+)['"]?/)
  if (urlMatch) {
    url = urlMatch[1]
  } else {
    const generalUrlMatch = normalized.match(/\s+['"]([^'"]+)['"]/)
    if (generalUrlMatch) {
      url = generalUrlMatch[1]
    }
  }

  return {
    method,
    url,
    headers,
    ...(body ? { body } : {}),
  }
}

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/**
 * Injects the [Copy Code ] dropdown inside a Swagger .curl-command block.
 */
function attachCopyCodeDropdown(curlBlock: HTMLElement, doc: Document): boolean {
  if (curlBlock.getAttribute(ATTACHED_ATTR) === 'true') return false
  const parent = curlBlock.parentElement
  if (parent && parent.getAttribute(ATTACHED_ATTR) === 'true') return false

  // Find Swagger UI's curl code container
  const codeEl = curlBlock.querySelector('pre code') || curlBlock.querySelector('pre')
  if (!codeEl) return false

  // Determine insertion anchor: <h4>Curl</h4> which is usually a sibling in responses-inner
  const h4 =
    (curlBlock.previousElementSibling?.tagName === 'H4' ? (curlBlock.previousElementSibling as HTMLElement) : null) ||
    parent?.querySelector('h4') ||
    curlBlock.querySelector('h4')

  const container = doc.createElement('div')
  container.className = 'oac-copy-code-container'

  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'oac-copy-code-btn'
  btn.setAttribute('aria-label', 'Copy code snippet in multiple languages')
  btn.innerHTML = `${SVG_ICONS.code}<span>Copy Code</span>${SVG_ICONS.chevronDown}`

  const dropdown = doc.createElement('div')
  dropdown.className = 'oac-copy-code-dropdown oac-hidden'

  CODE_OPTIONS.forEach((opt) => {
    const item = doc.createElement('button')
    item.type = 'button'
    item.className = 'oac-copy-code-item'
    item.innerHTML = `<span>${opt.label}</span><span class="oac-copy-code-badge">${opt.badge}</span>`

    item.addEventListener('click', async (e) => {
      e.stopPropagation()
      dropdown.classList.add('oac-hidden')

      // Read current cURL text
      const rawCurl = (codeEl.textContent || '').trim()
      const req = parseCurlCommand(rawCurl)

      // Generate code snippet
      const snippet = generateCode(opt.lang, req)

      // Copy to clipboard
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(snippet)
        } else {
          // Fallback for document contexts without active clipboard focus
          const ta = doc.createElement('textarea')
          ta.value = snippet
          ta.style.position = 'fixed'
          ta.style.opacity = '0'
          doc.body.appendChild(ta)
          ta.select()
          doc.execCommand('copy')
          ta.remove()
        }

        // Show feedback
        btn.classList.add('oac-copied')
        btn.innerHTML = `${SVG_ICONS.check}<span>Copied ${opt.badge}!</span>`
        setTimeout(() => {
          btn.classList.remove('oac-copied')
          btn.innerHTML = `${SVG_ICONS.code}<span>Copy Code</span>${SVG_ICONS.chevronDown}`
        }, 1800)
      } catch (err) {
        console.warn('[OpenAPI Companion] Failed to copy code snippet to clipboard:', err)
      }
    })

    dropdown.appendChild(item)
  })

  // Toggle dropdown on button click
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const isHidden = dropdown.classList.contains('oac-hidden')
    // Close any other open dropdowns first
    doc.querySelectorAll('.oac-copy-code-dropdown').forEach((d) => d.classList.add('oac-hidden'))
    if (isHidden) {
      dropdown.classList.remove('oac-hidden')
    }
  })

  container.appendChild(btn)
  container.appendChild(dropdown)

  if (h4 && h4.parentNode) {
    if (h4.nextSibling) {
      h4.parentNode.insertBefore(container, h4.nextSibling)
    } else {
      h4.parentNode.appendChild(container)
    }
  } else {
    curlBlock.parentElement?.insertBefore(container, curlBlock)
  }

  curlBlock.setAttribute(ATTACHED_ATTR, 'true')
  if (parent) parent.setAttribute(ATTACHED_ATTR, 'true')
  return true
}

export function mountSwaggerCopyCode(doc: Document = document): SwaggerCopyCodeHandle {
  ensureStyles(doc)

  const scanAndMount = (root: ParentNode = doc): number => {
    let count = 0
    const curlBlocks = root.querySelectorAll<HTMLElement>('.curl-command')
    curlBlocks.forEach((block) => {
      if (attachCopyCodeDropdown(block, doc)) {
        count++
      }
    })
    return count
  }

  // Initial scan
  scanAndMount()

  // Global document click listener to dismiss dropdowns on outside click
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (!target?.closest('.oac-copy-code-container')) {
      doc.querySelectorAll('.oac-copy-code-dropdown').forEach((d) => d.classList.add('oac-hidden'))
    }
  }
  doc.addEventListener('click', onDocClick)

  // Listen for Execute button clicks to re-scan when responses render
  const onExecuteClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null
    if (target?.closest('.btn.execute')) {
      setTimeout(() => scanAndMount(), 300)
      setTimeout(() => scanAndMount(), 800)
      setTimeout(() => scanAndMount(), 1600)
    }
  }
  doc.addEventListener('click', onExecuteClick, true)

  // MutationObserver for dynamic DOM changes (e.g. endpoint executions)
  const observer = new MutationObserver(() => {
    scanAndMount()
  })

  try {
    observer.observe(doc.body || doc.documentElement, {
      childList: true,
      subtree: true,
    })
  } catch {
    // ignore in environments where body is not yet ready
  }

  return {
    scanAndMount,
    dispose: () => {
      observer.disconnect()
      doc.removeEventListener('click', onDocClick)
      doc.removeEventListener('click', onExecuteClick, true)
      doc.querySelectorAll('.oac-copy-code-container').forEach((el) => el.remove())
      doc.querySelectorAll(`[${ATTACHED_ATTR}]`).forEach((el) => el.removeAttribute(ATTACHED_ATTR))
      const s = doc.getElementById(STYLE_ID)
      if (s) s.remove()
    },
  }
}
