/**
 * Swagger UI 1-Click "Fill Realistic Mock Data" Integration.
 *
 * Adds a subtle, non-intrusive floating bar right above Swagger UI's body textarea
 * (`textarea.body-param__text`) allowing developers to fill realistic mock data
 * with 1 click or keyboard shortcut Alt+M.
 */
import { setNativeValue, readSwaggerExample, endpointIdOf } from '@/adapters/swagger/swagger-request-dom'
import {
  synthesizeFromJsonSample,
  type GenerationMode,
} from '@/modules/fake-data/schema-generator'

export interface SwaggerMockDataHandle {
  fillMockData(textarea: HTMLTextAreaElement, mode?: GenerationMode): boolean
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

const STYLE_ID = 'oac-mock-data-styles'
const ATTACHED_ATTR = 'data-oac-mock-attached'

const CSS_STYLES = `
.oac-mock-data-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  position: relative;
  margin: 6px 0 4px 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
  z-index: 5;
}

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
}

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
  transition: background 0.15s ease, color 0.15s ease;
}

.oac-mock-btn:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.oac-mock-btn:active {
  background: #dbeafe;
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
  transition: background 0.15s ease, color 0.15s ease;
}

.oac-mock-mode-btn:hover {
  background: #eff6ff;
  color: #1d4ed8;
}

.oac-mock-btn-group.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
}

.oac-mock-btn-group.success .oac-mock-btn,
.oac-mock-btn-group.success .oac-mock-mode-btn {
  color: #15803d !important;
}

.oac-mock-btn-group.error {
  background: #fef3c7 !important;
  border-color: #f59e0b !important;
}

.oac-mock-btn-group.error .oac-mock-btn,
.oac-mock-btn-group.error .oac-mock-mode-btn {
  color: #b45309 !important;
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
  // 1. Check if the textarea already contains valid JSON
  const current = textarea.value.trim()
  if (current) {
    try {
      return JSON.parse(current)
    } catch {
      // Current text might be partially edited or invalid; fall through to example
    }
  }

  // 2. Try Swagger example helpers if inside an operation block
  if (block) {
    const endpointId = endpointIdOf(block)
    const exampleFromDom = readSwaggerExample(doc, endpointId)
    if (exampleFromDom) {
      try {
        return JSON.parse(exampleFromDom)
      } catch {
        // Try trimming / finding outer object or array brackets
        const json = tryParseSubJson(exampleFromDom)
        if (json !== null) return json
      }
    }

    // 3. Fallback search inside block for any example <pre>
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

export function mountSwaggerMockData(doc: Document = document): SwaggerMockDataHandle {
  ensureStyles(doc)

  function showStatusFeedback(
    group: HTMLElement,
    fillBtn: HTMLButtonElement,
    success: boolean,
    label = success ? '✓ Filled!' : '⚠️ No Schema',
  ): void {
    const originalContent = fillBtn.innerHTML
    group.classList.remove('success', 'error')
    group.classList.add(success ? 'success' : 'error')
    fillBtn.innerHTML = `<span class="oac-mock-label">${label}</span>`

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

    const group = doc.createElement('div')
    group.className = 'oac-mock-btn-group'

    const fillBtn = doc.createElement('button')
    fillBtn.type = 'button'
    fillBtn.className = 'oac-mock-btn oac-mock-fill-btn'
    fillBtn.title = 'Fill realistic mock data (Alt+M)'
    fillBtn.innerHTML = `
      <span class="oac-mock-icon">🪄</span>
      <span class="oac-mock-label">Fake Data</span>
      <kbd class="oac-mock-kbd">Alt+M</kbd>
    `

    const modeBtn = doc.createElement('button')
    modeBtn.type = 'button'
    modeBtn.className = 'oac-mock-mode-btn'
    modeBtn.title = 'Select data generation mode'
    modeBtn.innerHTML = `
      <span class="oac-mock-mode-text">Realistic</span>
      <span class="oac-mock-arrow">▾</span>
    `

    const dropdown = doc.createElement('div')
    dropdown.className = 'oac-mock-dropdown'
    dropdown.style.display = 'none'

    const modes: Array<{ mode: GenerationMode; icon: string; title: string; desc: string }> = [
      { mode: 'realistic', icon: '✨', title: 'Realistic', desc: 'Names, emails, UUIDs, dates' },
      { mode: 'minimal', icon: '⚡', title: 'Minimal', desc: '1 item, minimal values' },
      { mode: 'boundary', icon: '⚠️', title: 'Boundary', desc: 'Limits & edge cases' },
      { mode: 'fuzzing', icon: '🧪', title: 'Fuzzing', desc: 'Vectors & unicode symbols' },
    ]

    modes.forEach(({ mode, icon, title, desc }) => {
      const item = doc.createElement('button')
      item.type = 'button'
      item.className = `oac-mock-dropdown-item${mode === currentMode ? ' active' : ''}`
      item.innerHTML = `<span>${icon}</span> <span><strong>${title}</strong> - ${desc}</span>`
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        currentMode = mode
        const textEl = modeBtn.querySelector('.oac-mock-mode-text')
        if (textEl) textEl.textContent = title
        dropdown.querySelectorAll('.oac-mock-dropdown-item').forEach((btn) => btn.classList.remove('active'))
        item.classList.add('active')
        dropdown.style.display = 'none'

        // Immediately execute with the chosen mode
        const ok = fillMockData(textarea, currentMode, doc)
        showStatusFeedback(group, fillBtn, ok)
      })
      dropdown.appendChild(item)
    })

    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.style.display = 'none'
      const ok = fillMockData(textarea, currentMode, doc)
      showStatusFeedback(group, fillBtn, ok)
    })

    modeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none'
    })

    // Close dropdown on outside click
    const onDocClick = (e: MouseEvent): void => {
      if (!bar.contains(e.target as Node)) {
        dropdown.style.display = 'none'
      }
    }
    doc.addEventListener('click', onDocClick)

    group.appendChild(fillBtn)
    group.appendChild(modeBtn)
    bar.appendChild(group)
    bar.appendChild(dropdown)

    // Insert directly before the textarea
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

  // Keyboard shortcut Alt+M
  function onKeyDown(e: KeyboardEvent): void {
    if (e.altKey && (e.key === 'm' || e.key === 'M')) {
      const target = doc.activeElement
      if (target instanceof HTMLTextAreaElement && target.matches('textarea.body-param__text')) {
        e.preventDefault()
        const ok = fillMockData(target, 'realistic', doc)
        const bar = target.previousElementSibling
        if (bar?.classList.contains('oac-mock-data-bar')) {
          const group = bar.querySelector<HTMLElement>('.oac-mock-btn-group')
          const fillBtn = bar.querySelector<HTMLButtonElement>('.oac-mock-fill-btn')
          if (group && fillBtn) {
            showStatusFeedback(group, fillBtn, ok)
          }
        }
      }
    }
  }

  // Observe dynamically mounted textareas (Swagger "Try it out" clicks)
  const observer = new MutationObserver(() => {
    scanAndMount()
  })

  observer.observe(doc.body || doc.documentElement, {
    childList: true,
    subtree: true,
  })

  doc.addEventListener('keydown', onKeyDown, true)

  // Run initial scan
  scanAndMount()

  return {
    fillMockData(textarea: HTMLTextAreaElement, mode: GenerationMode = 'realistic'): boolean {
      return fillMockData(textarea, mode, doc)
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
