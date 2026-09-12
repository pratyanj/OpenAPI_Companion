/**
 * Swagger UI Request Body Toolbar:
 * - 1-Click "Fill Realistic Mock Data" (Alt+M)
 * - 1-Click "JSON Formatter" (Alt+Shift+F)
 * - Real-Time Live Syntax Validator Indicator
 *
 * Uses crisp SVG icons exclusively (no emojis) to avoid system font crashes.
 */
import { setNativeValue, readSwaggerExample, endpointIdOf } from '@/adapters/swagger/swagger-request-dom'
import {
  synthesizeFromJsonSample,
  type GenerationMode,
} from '@/modules/fake-data/schema-generator'
import {
  SVG_ICONS,
  validateJsonSyntax,
  formatTextareaJson,
  isAlreadyFormatted,
  type JsonValidationResult,
} from './swagger-json-format'

export interface SwaggerMockDataHandle {
  fillMockData(textarea: HTMLTextAreaElement, mode?: GenerationMode): boolean
  formatJson(textarea: HTMLTextAreaElement): boolean
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-mock-data-styles'
const ATTACHED_ATTR = 'data-oac-mock-attached'

const CSS_STYLES = `
.oac-mock-data-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  position: relative;
  margin: 6px 0 6px 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
  z-index: 5;
  gap: 8px;
}

.oac-body-btn-container {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

.oac-json-format-group.hidden {
  display: none !important;
}

.oac-json-format-group,
.oac-mock-btn-group {
  display: inline-flex;
  align-items: center;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  position: relative;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.oac-json-format-group:hover,
.oac-mock-btn-group:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 5px rgba(59, 130, 246, 0.15);
}

.oac-mock-fill-btn {
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
}

.oac-mock-mode-btn {
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
}

.oac-mock-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: #334155;
  line-height: 1.4;
  outline: none;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.oac-mock-btn:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.oac-mock-btn:active {
  background: #dbeafe;
}

.oac-mock-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.oac-mock-icon svg {
  display: block;
}

.oac-mock-kbd {
  display: inline-block;
  font-size: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 1px 4px;
  border-radius: 4px;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #64748b;
  margin-left: 2px;
}

.oac-mock-mode-btn {
  border-left: 1px solid #e2e8f0;
  padding: 4px 6px;
  font-size: 10px;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: transparent;
  border-top: none;
  border-bottom: none;
  border-right: none;
  cursor: pointer;
  font-weight: 500;
  outline: none;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

.oac-mock-mode-btn:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.oac-json-format-group.success,
.oac-mock-btn-group.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
}

.oac-json-format-group.success .oac-mock-btn,
.oac-mock-btn-group.success .oac-mock-btn,
.oac-mock-btn-group.success .oac-mock-mode-btn {
  color: #15803d !important;
}

.oac-json-format-group.error,
.oac-mock-btn-group.error {
  background: #fee2e2 !important;
  border-color: #ef4444 !important;
}

.oac-json-format-group.error .oac-mock-btn,
.oac-mock-btn-group.error .oac-mock-btn,
.oac-mock-btn-group.error .oac-mock-mode-btn {
  color: #b91c1c !important;
}

.oac-json-syntax-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 5px;
  line-height: 1.4;
  transition: all 0.15s ease;
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
  white-space: normal;
}

.oac-json-syntax-badge.empty,
.oac-json-syntax-badge.valid {
  display: none !important;
}

.oac-json-syntax-badge.invalid {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.oac-json-error-text {
  display: inline;
}

.oac-mock-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  padding: 4px;
  min-width: 195px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.oac-mock-dropdown-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: none;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: #334155;
  text-align: left;
  transition: background 0.1s ease;
  width: 100%;
}

.oac-mock-dropdown-item:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.oac-mock-dropdown-item.active {
  background: #3b82f6;
  color: #ffffff;
  font-weight: 600;
}

.oac-mock-dropdown-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: currentColor;
}
`;

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

/**
 * Extracts a candidate JSON sample from either the current textarea or Swagger UI's
 * pre-rendered example DOM.
 */
export function extractJsonCandidate(
  textarea: HTMLTextAreaElement,
  block: Element | null,
  doc: Document,
): unknown | null {
  const current = textarea.value.trim()
  if (current) {
    try {
      return JSON.parse(current)
    } catch {
      // Current text might be partially edited or invalid; fall through to example
    }
  }

  if (block) {
    const endpointId = endpointIdOf(block)
    const exampleFromDom = readSwaggerExample(doc, endpointId)
    if (exampleFromDom) {
      try {
        return JSON.parse(exampleFromDom)
      } catch {
        const json = tryParseSubJson(exampleFromDom)
        if (json !== null) return json
      }
    }

    const preEl = block.querySelector(
      '.body-param__example pre, .model-example pre, .highlight-code pre, pre.example, .example-value pre, .body-param pre',
    )
    if (preEl?.textContent?.trim()) {
      const parsed = tryParseSubJson(preEl.textContent.trim())
      if (parsed !== null) return parsed
    }
  }

  return null
}

function tryParseSubJson(text: string): unknown | null {
  try {
    return JSON.parse(text)
  } catch {
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1))
      } catch {
        /* ignore */
      }
    }
    const firstBracket = text.indexOf('[')
    const lastBracket = text.lastIndexOf(']')
    if (firstBracket !== -1 && lastBracket > firstBracket) {
      try {
        return JSON.parse(text.slice(firstBracket, lastBracket + 1))
      } catch {
        /* ignore */
      }
    }
  }
  return null
}

/**
 * Synthesizes mock data from a sample and fills it into the given Swagger textarea.
 */
export function fillMockData(
  textarea: HTMLTextAreaElement,
  mode: GenerationMode = 'realistic',
  doc: Document = document,
): boolean {
  const block = textarea.closest('.opblock')
  const sample = extractJsonCandidate(textarea, block, doc)
  if (!sample) return false

  try {
    const synthesized = synthesizeFromJsonSample(sample, { mode })
    const formatted = JSON.stringify(synthesized, null, 2)
    setNativeValue(textarea, formatted)
    return true
  } catch {
    return false
  }
}

export function updateFormatButtonVisibility(textarea: HTMLTextAreaElement, formatGroup: HTMLElement): void {
  if (isAlreadyFormatted(textarea.value)) {
    formatGroup.classList.add('hidden')
  } else {
    formatGroup.classList.remove('hidden')
  }
}

export function updateSyntaxBadge(textarea: HTMLTextAreaElement, badge: HTMLElement): void {
  const result: JsonValidationResult = validateJsonSyntax(textarea.value)

  // Only visible when developer inputs invalid JSON. Hidden when valid or empty.
  if (result.isEmpty || result.valid) {
    badge.className = 'oac-json-syntax-badge empty'
    badge.innerHTML = ''
    badge.removeAttribute('title')
    return
  }

  badge.className = 'oac-json-syntax-badge invalid'
  const short = result.shortError || 'Syntax Error'
  const alreadyHasLine = /line\s+\d+/i.test(short)
  const loc = (!alreadyHasLine && result.line !== undefined)
    ? ` (Line ${result.line}${result.column ? `:${result.column}` : ''})`
    : ''
  badge.innerHTML = `<span class="oac-mock-icon">${SVG_ICONS.alert}</span><span class="oac-json-error-text">${short}${loc}</span>`
  badge.title = result.error || 'Invalid JSON syntax'
}

export function triggerFormatAction(
  textarea: HTMLTextAreaElement,
  formatGroup: HTMLElement,
  formatBtn: HTMLButtonElement,
  badge: HTMLElement,
): boolean {
  const res = formatTextareaJson(textarea)
  updateSyntaxBadge(textarea, badge)

  const originalContent = formatBtn.innerHTML
  formatGroup.classList.remove('success', 'error')

  if (res.success) {
    formatGroup.classList.add('success')
    formatBtn.innerHTML = `
      <span class="oac-mock-icon">${SVG_ICONS.check}</span>
      <span class="oac-mock-label">Formatted</span>
    `
    setTimeout(() => {
      formatGroup.classList.remove('success')
      formatBtn.innerHTML = originalContent
      formatGroup.classList.add('hidden')
    }, 900)
    return true
  } else {
    // When formatting fails, never show error message inside the button label.
    // The detailed error is clearly shown in the red syntax status badge on the left.
    formatGroup.classList.add('error')
    setTimeout(() => {
      formatGroup.classList.remove('error')
    }, 1500)
    return false
  }
}

export function mountSwaggerMockData(doc: Document = document): SwaggerMockDataHandle {
  ensureStyles(doc)

  function showStatusFeedback(
    group: HTMLElement,
    fillBtn: HTMLButtonElement,
    success: boolean,
    badge: HTMLElement,
    textarea: HTMLTextAreaElement,
  ): void {
    updateSyntaxBadge(textarea, badge)
    const bar = group.parentElement
    const fmtGroup = bar?.querySelector<HTMLElement>('.oac-json-format-group')
    if (fmtGroup) updateFormatButtonVisibility(textarea, fmtGroup)
    const originalContent = fillBtn.innerHTML
    group.classList.remove('success', 'error')
    group.classList.add(success ? 'success' : 'error')

    const icon = success ? SVG_ICONS.check : SVG_ICONS.alert
    const label = success ? 'Filled' : 'No Schema'
    fillBtn.innerHTML = `
      <span class="oac-mock-icon">${icon}</span>
      <span class="oac-mock-label">${label}</span>
    `

    setTimeout(() => {
      group.classList.remove('success', 'error')
      fillBtn.innerHTML = originalContent
    }, success ? 1500 : 1800)
  }

  function attachToTextarea(textarea: HTMLTextAreaElement): void {
    if (textarea.hasAttribute(ATTACHED_ATTR)) return
    if (textarea.previousElementSibling?.classList.contains('oac-mock-data-bar')) {
      textarea.setAttribute(ATTACHED_ATTR, 'true')
      return
    }

    textarea.setAttribute(ATTACHED_ATTR, 'true')

    let currentMode: GenerationMode = 'realistic'

    const bar = doc.createElement('div')
    bar.className = 'oac-mock-data-bar'

    // Left: Live Syntax Status Badge (non-truncated, flexible width)
    const syntaxBadge = doc.createElement('div')
    syntaxBadge.className = 'oac-json-syntax-badge empty'

    // Right: Action Buttons Container (fixed right alignment, never squashed)
    const btnContainer = doc.createElement('div')
    btnContainer.className = 'oac-body-btn-container'

    // 1-Click Format JSON Button
    const formatGroup = doc.createElement('div')
    formatGroup.className = 'oac-json-format-group'

    const formatBtn = doc.createElement('button')
    formatBtn.type = 'button'
    formatBtn.className = 'oac-mock-btn oac-json-format-btn'
    formatBtn.title = 'Prettify JSON with 2-space indentation (Alt+Shift+F)'
    formatBtn.innerHTML = `
      <span class="oac-mock-icon">${SVG_ICONS.format}</span>
      <span class="oac-mock-label">Format JSON</span>
      <kbd class="oac-mock-kbd">Alt+Shift+F</kbd>
    `

    formatGroup.appendChild(formatBtn)

    // 1-Click Fake Data Button Group
    const mockGroup = doc.createElement('div')
    mockGroup.className = 'oac-mock-btn-group'

    const fillBtn = doc.createElement('button')
    fillBtn.type = 'button'
    fillBtn.className = 'oac-mock-btn oac-mock-fill-btn'
    fillBtn.title = 'Fill realistic mock data (Alt+M)'
    fillBtn.innerHTML = `
      <span class="oac-mock-icon">${SVG_ICONS.wand}</span>
      <span class="oac-mock-label">Fake Data</span>
      <kbd class="oac-mock-kbd">Alt+M</kbd>
    `

    const modeBtn = doc.createElement('button')
    modeBtn.type = 'button'
    modeBtn.className = 'oac-mock-mode-btn'
    modeBtn.title = 'Select data generation mode'
    modeBtn.innerHTML = `
      <span class="oac-mock-mode-text">Realistic</span>
      <span class="oac-mock-arrow">${SVG_ICONS.chevronDown}</span>
    `

    const dropdown = doc.createElement('div')
    dropdown.className = 'oac-mock-dropdown'
    dropdown.style.display = 'none'

    const modes: Array<{ mode: GenerationMode; icon: string; title: string; desc: string }> = [
      { mode: 'realistic', icon: SVG_ICONS.sparkle, title: 'Realistic', desc: 'Names, emails, UUIDs, dates' },
      { mode: 'minimal', icon: SVG_ICONS.zap, title: 'Minimal', desc: '1 item, minimal values' },
      { mode: 'boundary', icon: SVG_ICONS.alert, title: 'Boundary', desc: 'Limits & edge cases' },
      { mode: 'fuzzing', icon: SVG_ICONS.flask, title: 'Fuzzing', desc: 'Vectors & unicode symbols' },
    ]

    modes.forEach(({ mode, icon, title, desc }) => {
      const item = doc.createElement('button')
      item.type = 'button'
      item.className = `oac-mock-dropdown-item${mode === currentMode ? ' active' : ''}`
      item.innerHTML = `<span class="oac-mock-dropdown-icon">${icon}</span> <span><strong>${title}</strong> - ${desc}</span>`
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        currentMode = mode
        const textEl = modeBtn.querySelector('.oac-mock-mode-text')
        if (textEl) textEl.textContent = title
        dropdown.querySelectorAll('.oac-mock-dropdown-item').forEach((btn) => btn.classList.remove('active'))
        item.classList.add('active')
        dropdown.style.display = 'none'

        const ok = fillMockData(textarea, currentMode, doc)
        showStatusFeedback(mockGroup, fillBtn, ok, syntaxBadge, textarea)
      })
      dropdown.appendChild(item)
    })

    formatBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.style.display = 'none'
      triggerFormatAction(textarea, formatGroup, formatBtn, syntaxBadge)
    })

    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.style.display = 'none'
      const ok = fillMockData(textarea, currentMode, doc)
      showStatusFeedback(mockGroup, fillBtn, ok, syntaxBadge, textarea)
    })

    modeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none'
    })

    const onDocClick = (e: MouseEvent): void => {
      if (!bar.contains(e.target as Node)) {
        dropdown.style.display = 'none'
      }
    }
    doc.addEventListener('click', onDocClick)

    // Live validation and format button visibility listener on textarea
    textarea.addEventListener('input', () => {
      updateSyntaxBadge(textarea, syntaxBadge)
      updateFormatButtonVisibility(textarea, formatGroup)
    })

    // Initial syntax and visibility check
    updateSyntaxBadge(textarea, syntaxBadge)
    updateFormatButtonVisibility(textarea, formatGroup)

    mockGroup.appendChild(fillBtn)
    mockGroup.appendChild(modeBtn)

    btnContainer.appendChild(formatGroup)
    btnContainer.appendChild(mockGroup)

    bar.appendChild(syntaxBadge)
    bar.appendChild(btnContainer)
    bar.appendChild(dropdown)

    textarea.parentElement?.insertBefore(bar, textarea)
  }

  function scanAndMount(root: ParentNode = doc): number {
    const textareas = Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea.body-param__text'))
    let count = 0
    for (const ta of textareas) {
      if (!ta.hasAttribute(ATTACHED_ATTR)) {
        attachToTextarea(ta)
        count++
      }
    }
    return count
  }

  function onKeyDown(e: KeyboardEvent): void {
    // Alt+Shift+F: Format JSON
    if (e.altKey && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
      const target = doc.activeElement
      if (target instanceof HTMLTextAreaElement && target.matches('textarea.body-param__text')) {
        e.preventDefault()
        const bar = target.previousElementSibling
        if (bar?.classList.contains('oac-mock-data-bar')) {
          const formatGroup = bar.querySelector<HTMLElement>('.oac-json-format-group')
          const formatBtn = bar.querySelector<HTMLButtonElement>('.oac-json-format-btn')
          const badge = bar.querySelector<HTMLElement>('.oac-json-syntax-badge')
          if (formatGroup && formatBtn && badge) {
            triggerFormatAction(target, formatGroup, formatBtn, badge)
            return
          }
        }
        formatTextareaJson(target)
      }
    }

    // Alt+M: Fill mock data
    if (e.altKey && !e.shiftKey && (e.key === 'm' || e.key === 'M')) {
      const target = doc.activeElement
      if (target instanceof HTMLTextAreaElement && target.matches('textarea.body-param__text')) {
        e.preventDefault()
        const ok = fillMockData(target, 'realistic', doc)
        const bar = target.previousElementSibling
        if (bar?.classList.contains('oac-mock-data-bar')) {
          const group = bar.querySelector<HTMLElement>('.oac-mock-btn-group')
          const fillBtn = bar.querySelector<HTMLButtonElement>('.oac-mock-fill-btn')
          const badge = bar.querySelector<HTMLElement>('.oac-json-syntax-badge')
          if (group && fillBtn && badge) {
            showStatusFeedback(group, fillBtn, ok, badge, target)
          }
        }
      }
    }
  }

  const observer = new MutationObserver(() => {
    scanAndMount()
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  doc.addEventListener('keydown', onKeyDown, true)

  scanAndMount()

  return {
    fillMockData(textarea: HTMLTextAreaElement, mode: GenerationMode = 'realistic'): boolean {
      return fillMockData(textarea, mode, doc)
    },
    formatJson(textarea: HTMLTextAreaElement): boolean {
      const res = formatTextareaJson(textarea)
      return res.success
    },
    scanAndMount,
    dispose(): void {
      observer.disconnect()
      doc.removeEventListener('keydown', onKeyDown, true)
      const bars = doc.querySelectorAll('.oac-mock-data-bar')
      bars.forEach((b) => b.parentNode?.removeChild(b))
      const textareas = doc.querySelectorAll<HTMLTextAreaElement>(`textarea[${ATTACHED_ATTR}]`)
      textareas.forEach((ta) => ta.removeAttribute(ATTACHED_ATTR))
    },
  }
}
