/**
 * Swagger UI Native Variables Integration (ISOLATED World).
 *
 * Provides:
 * 1. Live variable autocomplete dropdown (`{{`) inside Swagger UI inputs & textareas
 *    to make developers' daily testing easy.
 * 2. Pre-execution hook that resolves any `{{...}}` placeholders in inputs before
 *    Swagger's Execute button triggers the request.
 */
import { setNativeValue } from '@/adapters/swagger/swagger-request-dom'
import { substitute } from '@/modules/environment/env-service'
import { DYNAMIC_VARIABLE_SUGGESTIONS, type VariableSuggestion } from '@/components/variable-constants'

export interface SwaggerVariablesHandle {
  updateVariables(variables: Record<string, string>, secrets?: string[]): void
  resolveOperationInputs(block: Element): number
  dispose(): void
}

const HOST_ID = 'oac-swagger-var-autocomplete-host'

export function mountSwaggerVariables(
  initialVariables: Record<string, string> = {},
  initialSecrets: string[] = [],
  doc: Document = document,
): SwaggerVariablesHandle {
  let activeVariables: Record<string, string> = { ...initialVariables }
  let activeSecrets: string[] = [...initialSecrets]

  // Create or reuse host for shadow DOM autocomplete popup
  let host = doc.getElementById(HOST_ID) as HTMLDivElement | null
  if (!host) {
    host = doc.createElement('div')
    host.id = HOST_ID
    host.style.position = 'absolute'
    host.style.top = '0'
    host.style.left = '0'
    host.style.width = '100%'
    host.style.pointerEvents = 'none'
    host.style.zIndex = '2147483647'
    doc.body.appendChild(host)
  }

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })

  // Style for the popup
  const styleEl = doc.createElement('style')
  styleEl.textContent = `
    .oac-popup {
      position: fixed;
      z-index: 2147483647;
      width: 320px;
      max-height: 260px;
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid #334155;
      border-radius: 8px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.4);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      pointer-events: auto;
    }
    .oac-header {
      padding: 6px 10px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-weight: 600;
      color: #94a3b8;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .oac-list {
      overflow-y: auto;
      max-height: 190px;
      margin: 0;
      padding: 4px;
      list-style: none;
    }
    .oac-item {
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
      transition: background 0.1s ease;
    }
    .oac-item.selected, .oac-item:hover {
      background: #3b82f6;
      color: #ffffff;
    }
    .oac-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .oac-item-name {
      font-weight: 600;
      font-family: monospace;
      font-size: 12px;
    }
    .oac-item-badge {
      font-size: 10px;
      padding: 1px 5px;
      border-radius: 9999px;
      background: rgba(255, 255, 255, 0.15);
    }
    .oac-item-preview {
      font-size: 11px;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: monospace;
    }
    .oac-item.selected .oac-item-preview {
      color: rgba(255, 255, 255, 0.85);
    }
    .oac-footer {
      padding: 4px 8px;
      background: #0f172a;
      border-top: 1px solid #334155;
      font-size: 10px;
      color: #64748b;
      text-align: center;
    }
  `
  shadow.innerHTML = ''
  shadow.appendChild(styleEl)

  const popup = doc.createElement('div')
  popup.className = 'oac-popup'
  popup.style.display = 'none'
  shadow.appendChild(popup)

  // State for active autocomplete
  let activeInput: HTMLInputElement | HTMLTextAreaElement | null = null
  let activeTriggerIndex = -1
  let activeQuery = ''
  let selectedIndex = 0
  let currentFiltered: VariableSuggestion[] = []

  function getSuggestions(): VariableSuggestion[] {
    const projectSuggestions: VariableSuggestion[] = Object.entries(activeVariables).map(
      ([name, val]) => {
        const isSecret = activeSecrets.includes(name)
        return {
          name,
          kind: 'project' as const,
          preview: isSecret ? '••••••••' : val,
          isSecret,
        }
      },
    )
    return [...projectSuggestions, ...DYNAMIC_VARIABLE_SUGGESTIONS]
  }

  function filterSuggestions(query: string): VariableSuggestion[] {
    const all = getSuggestions()
    if (!query) return all
    const q = query.toLowerCase()
    return all.filter((s) => s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)))
  }

  function renderPopup(): void {
    currentFiltered = filterSuggestions(activeQuery)
    if (currentFiltered.length === 0) {
      popup.style.display = 'none'
      return
    }

    if (selectedIndex >= currentFiltered.length) {
      selectedIndex = Math.max(0, currentFiltered.length - 1)
    }

    popup.innerHTML = ''
    popup.appendChild(styleEl.cloneNode(true))

    const header = doc.createElement('div')
    header.className = 'oac-header'
    header.innerHTML = `<span>Variables</span><span>${currentFiltered.length} available</span>`
    popup.appendChild(header)

    const list = doc.createElement('ul')
    list.className = 'oac-list'

    currentFiltered.forEach((item, idx) => {
      const li = doc.createElement('li')
      li.className = `oac-item${idx === selectedIndex ? ' selected' : ''}`
      li.innerHTML = `
        <div class="oac-item-row">
          <span class="oac-item-name">{{ ${item.name} }}</span>
          <span class="oac-item-badge">${item.kind}</span>
        </div>
        <div class="oac-item-preview">${item.preview ?? item.description ?? ''}</div>
      `
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        selectedIndex = idx
        insertSelected()
      })
      list.appendChild(li)
    })
    popup.appendChild(list)

    const footer = doc.createElement('div')
    footer.className = 'oac-footer'
    footer.textContent = '↑↓ Navigate • ↵ Insert • Esc Close'
    popup.appendChild(footer)

    popup.style.display = 'flex'
    updatePopupPosition()
  }

  function updatePopupPosition(): void {
    if (!activeInput || popup.style.display === 'none') return
    const rect = activeInput.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const popupHeight = 240

    let top: number
    if (spaceBelow < popupHeight && rect.top > popupHeight) {
      top = rect.top - popupHeight - 4
    } else {
      top = rect.bottom + 4
    }

    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 330))
    popup.style.top = `${top}px`
    popup.style.left = `${left}px`
  }

  function openAutocomplete(
    input: HTMLInputElement | HTMLTextAreaElement,
    query: string,
    triggerIdx: number,
  ): void {
    activeInput = input
    activeTriggerIndex = triggerIdx
    activeQuery = query
    selectedIndex = 0
    renderPopup()
  }

  function closeAutocomplete(): void {
    popup.style.display = 'none'
    activeInput = null
    activeTriggerIndex = -1
    activeQuery = ''
  }

  function insertSelected(): void {
    if (!activeInput || activeTriggerIndex < 0 || selectedIndex >= currentFiltered.length) {
      closeAutocomplete()
      return
    }

    const item = currentFiltered[selectedIndex]
    if (!item) {
      closeAutocomplete()
      return
    }

    const val = activeInput.value
    const beforeTrigger = val.slice(0, activeTriggerIndex)
    const afterCursor = val.slice(activeTriggerIndex + 2 + activeQuery.length)
    const inserted = `{{${item.name}}}`
    const nextVal = beforeTrigger + inserted + afterCursor

    setNativeValue(activeInput, nextVal)

    // Move cursor right after the inserted variable
    const newCursor = beforeTrigger.length + inserted.length
    try {
      activeInput.setSelectionRange(newCursor, newCursor)
      activeInput.focus()
    } catch {
      /* ignore if not focusable */
    }

    closeAutocomplete()
  }

  function isSwaggerInputField(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
    if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false
    return Boolean(
      el.closest('.opblock') ||
      el.closest('.parameters-container') ||
      el.closest('table.parameters') ||
      el.matches('.body-param__text') ||
      el.matches('.parameter')
    )
  }

  function onInput(e: Event): void {
    const target = e.target as Element | null
    if (!isSwaggerInputField(target)) {
      if (activeInput) closeAutocomplete()
      return
    }

    const val = target.value
    const cursor = target.selectionStart ?? val.length
    const beforeCursor = val.slice(0, cursor)

    // Check if cursor is immediately following {{...
    const match = beforeCursor.match(/\{\{\s*([$A-Za-z0-9_]*)$/)
    if (match && match.index !== undefined) {
      openAutocomplete(target, match[1] ?? '', match.index)
    } else {
      closeAutocomplete()
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (popup.style.display === 'none' || !activeInput) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIndex = (selectedIndex + 1) % currentFiltered.length
      renderPopup()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex = (selectedIndex - 1 + currentFiltered.length) % currentFiltered.length
      renderPopup()
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertSelected()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeAutocomplete()
    }
  }

  function onBlur(): void {
    setTimeout(() => {
      closeAutocomplete()
    }, 150)
  }

  // ---------------------------------------------------------------------------
  // In-Place Operation Variables Resolver (for Execute click or programmatic use)
  // ---------------------------------------------------------------------------

  function resolveOperationInputs(block: Element): number {
    const inputs = Array.from(
      block.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input.parameter, textarea.parameter, textarea.body-param__text, input, textarea',
      ),
    )

    let resolvedCount = 0
    for (const input of inputs) {
      if (!input.value || !input.value.includes('{{')) continue
      const { text: resolved } = substitute(input.value, activeVariables)
      if (resolved !== input.value) {
        setNativeValue(input, resolved)
        resolvedCount++
      }
    }
    return resolvedCount
  }

  // ---------------------------------------------------------------------------
  // Pre-Execution Click Interceptor
  // ---------------------------------------------------------------------------

  function onExecuteClick(e: Event): void {
    const path = e.composedPath?.() ?? []
    const target = (path.length ? path : [e.target]).find(
      (node): node is Element => node instanceof Element && node.matches?.('.btn.execute, .execute'),
    )
    if (!target) return
    const block = target.closest('.opblock')
    if (block) {
      resolveOperationInputs(block)
    }
  }

  // Bind document listeners
  doc.addEventListener('input', onInput, true)
  doc.addEventListener('keydown', onKeyDown as unknown as EventListener, true)
  doc.addEventListener('blur', onBlur, true)
  doc.addEventListener('click', onExecuteClick, true)
  window.addEventListener('scroll', updatePopupPosition, true)
  window.addEventListener('resize', updatePopupPosition)

  return {
    updateVariables(vars: Record<string, string>, secrets: string[] = []): void {
      activeVariables = { ...vars }
      activeSecrets = [...secrets]
    },
    resolveOperationInputs,
    dispose(): void {
      doc.removeEventListener('input', onInput, true)
      doc.removeEventListener('keydown', onKeyDown as unknown as EventListener, true)
      doc.removeEventListener('blur', onBlur, true)
      doc.removeEventListener('click', onExecuteClick, true)
      window.removeEventListener('scroll', updatePopupPosition, true)
      window.removeEventListener('resize', updatePopupPosition)
      if (host && host.parentNode) {
        host.parentNode.removeChild(host)
      }
    },
  }
}
