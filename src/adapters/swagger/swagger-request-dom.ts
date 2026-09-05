import type { RequestSnapshot } from '../types'

/**
 * DOM helpers for Swagger UI's "Try it out" request fields. These live in the
 * shared page DOM, so the isolated content script can read/write them directly
 * (no MAIN-world bridge needed, unlike auth).
 *
 * v1 focuses on the **request body** (the field developers most often lose);
 * params/headers are a follow-up. Selectors match standard Swagger UI markup
 * and are the part most likely to need per-version tuning (risk R-01) — hence
 * they're isolated here and unit-tested against a synthetic structure.
 */

const OPEN_BLOCK = '.opblock.is-open'
const ANY_BLOCK = '.opblock'
const BODY_TEXTAREA = 'textarea.body-param__text'
// The clickable header. Swagger 5.x wraps it in a `.opblock-summary-control`
// button; 3.x/4.x put the handler on `.opblock-summary` itself — try both.
const SUMMARY_CONTROL = '.opblock-summary-control'
const SUMMARY = '.opblock-summary'
const TRY_OUT_BTN = '.try-out__btn'
const EXECUTE_BTN = '.btn.execute'

/** Set a React-controlled input/textarea/select value so Swagger's state updates. */
export function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  if (el instanceof HTMLSelectElement) {
    el.value = value
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

/**
 * Notify on every **Execute** click, with the operation it belongs to.
 *
 * History capture reads the rendered response DOM and must de-duplicate, since
 * its observer re-fires on unrelated mutations. Content alone can't tell "the
 * same response, re-read" from "called again with an identical result" — so this
 * supplies the missing signal: an actual execution happened. Capture-phase, and
 * matched via composedPath, so it still sees clicks Swagger stops later.
 * `replay()` clicks the same button, so replays are covered too.
 */
export function observeExecutions(
  cb: (endpointId: string) => void,
  doc: Document = document,
): () => void {
  const onClick = (event: Event): void => {
    const path = event.composedPath?.() ?? []
    const target = (path.length ? path : [event.target]).find(
      (node): node is Element => node instanceof Element && node.matches?.(EXECUTE_BTN),
    )
    if (!target) return
    const block = target.closest(ANY_BLOCK)
    const endpointId = block ? endpointIdOf(block) : null
    if (endpointId) cb(endpointId)
  }
  doc.addEventListener('click', onClick, true)
  return () => doc.removeEventListener('click', onClick, true)
}

/** Stable-ish id for an operation block: `"<method> <path>"`. */
export function endpointIdOf(block: Element): string | null {
  const method = block.querySelector('.opblock-summary-method')?.textContent?.trim().toLowerCase()
  const pathEl = block.querySelector('.opblock-summary-path')
  const path = pathEl?.getAttribute('data-path') ?? pathEl?.textContent?.trim()
  return method && path ? `${method} ${path}` : null
}

function bodyTextarea(block: Element): HTMLTextAreaElement | null {
  return block.querySelector<HTMLTextAreaElement>(BODY_TEXTAREA)
}

/** Read any filled or declared parameters (path, query, header) from an operation block. */
export function readParametersFromBlock(block: Element): {
  path: Record<string, string>
  query: Record<string, string>
  headers: Record<string, string>
} {
  const path: Record<string, string> = {}
  const query: Record<string, string> = {}
  const headers: Record<string, string> = {}

  const rows = Array.from(
    block.querySelectorAll('tr[data-param-name], table.parameters tr, .parameters-container tr'),
  )

  for (const row of rows) {
    const rawName =
      row.getAttribute('data-param-name') ??
      row
        .querySelector('.parameter__name')
        ?.textContent?.trim()
        .replace(/\s*\*\s*$/, '')
    if (!rawName) continue

    const rawIn =
      row.getAttribute('data-param-in') ??
      row.querySelector('.parameter__in')?.textContent?.trim().replace(/[()]/g, '').toLowerCase()

    const input = row.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input.parameter, select.parameter, textarea.parameter, input, select, textarea',
    )
    const val = input ? input.value : ''

    if (rawIn === 'path') {
      if (val) path[rawName] = val
    } else if (rawIn === 'query') {
      if (val) query[rawName] = val
    } else if (rawIn === 'header') {
      if (val) headers[rawName] = val
    }
  }

  return { path, query, headers }
}

export function readOpenRequests(doc: Document = document): RequestSnapshot[] {
  const snapshots: RequestSnapshot[] = []
  for (const block of Array.from(doc.querySelectorAll(OPEN_BLOCK))) {
    const endpointId = endpointIdOf(block)
    if (!endpointId) continue
    const method = endpointId.split(' ')[0] ?? 'unknown'
    const body = bodyTextarea(block)?.value
    const { path, query, headers } = readParametersFromBlock(block)
    snapshots.push({
      endpointId,
      method,
      body: body || undefined,
      path: Object.keys(path).length > 0 ? path : undefined,
      query: Object.keys(query).length > 0 ? query : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
    })
  }
  return snapshots
}

function findBlock(doc: Document, endpointId: string): Element | null {
  return (
    Array.from(doc.querySelectorAll(OPEN_BLOCK)).find((b) => endpointIdOf(b) === endpointId) ?? null
  )
}

/** Find an operation block whether or not it's currently expanded. */
export function findAnyBlock(doc: Document, endpointId: string): Element | null {
  return (
    Array.from(doc.querySelectorAll(ANY_BLOCK)).find((b) => endpointIdOf(b) === endpointId) ?? null
  )
}

/** Read Swagger's example or schema default request body for an operation. */
export function readSwaggerExample(doc: Document, endpointId: string): string | null {
  const block = findAnyBlock(doc, endpointId)
  if (!block) return null

  // 1. If the textarea is already filled, read it
  const textarea = bodyTextarea(block)
  if (textarea?.value?.trim()) return textarea.value.trim()

  // 2. Otherwise read example rendered in pre elements (OAS2/OAS3 examples)
  const exampleEl = block.querySelector(
    '.body-param__example pre, .model-example pre, .highlight-code pre, pre.example, .body-param-example pre',
  )
  if (exampleEl?.textContent?.trim()) {
    return exampleEl.textContent.trim()
  }

  return null
}

/** Expand a collapsed operation by clicking its summary control. */
function clickExpand(block: Element): void {
  const control =
    block.querySelector<HTMLElement>(SUMMARY_CONTROL) ?? block.querySelector<HTMLElement>(SUMMARY)
  control?.click()
}

/** Click the Execute button inside an operation block. Returns false if absent. */
export function clickExecute(block: Element): boolean {
  const execute = block.querySelector<HTMLButtonElement>(EXECUTE_BTN)
  if (!execute) return false
  execute.click()
  return true
}

export interface AutoExecuteOptions {
  body?: string
  path?: Record<string, string>
  query?: Record<string, string>
  headers?: Record<string, string>
  /** Poll interval between steps (ms). */
  pollMs?: number
  /** Give up after this long (ms). */
  timeoutMs?: number
  /** Injectable for tests. */
  setTimeoutFn?: (fn: () => void, ms: number) => unknown
}

type Phase = 'expand' | 'awaitOpen' | 'tryOut' | 'awaitExecute' | 'prepareBody' | 'awaitBody'

/**
 * Some Swagger versions (OAS2 body params) hide the body textarea behind an
 * "Edit Value"/"Edit" toggle even after "Try it out". Find that button — by its
 * known classes first, by its label as a fallback. Null when the version has no
 * such toggle (the textarea appears directly).
 */
function findEditValueButton(block: Element): HTMLElement | null {
  const direct = block.querySelector<HTMLElement>(
    '.body-param__example-edit, .body-param-edit button',
  )
  if (direct) return direct
  for (const btn of Array.from(block.querySelectorAll('button'))) {
    const label = btn.textContent?.trim().toLowerCase()
    if (label === 'edit' || label === 'edit value') return btn as HTMLElement
  }
  return null
}

/**
 * Fully replay an operation with no user interaction: scroll to it, expand it,
 * enable "Try it out", fill the body and parameters, and click Execute.
 */
export function autoExecute(
  doc: Document,
  endpointId: string,
  opts: AutoExecuteOptions = {},
): boolean {
  const { body, path, query, headers, pollMs = 120, timeoutMs = 6000 } = opts
  const schedule = opts.setTimeoutFn ?? ((fn, ms) => setTimeout(fn, ms))
  /** Give the edit-value textarea this long to mount before passing (ms). */
  const editWaitBudget = 2000

  const initial = findAnyBlock(doc, endpointId)
  if (!initial) return false
  ;(initial as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'start' })

  let phase: Phase = 'expand'
  let waited = 0
  let editWaited = 0
  let done = false

  const execute = (block: Element): void => {
    if (body != null) writeRequestBody(doc, endpointId, body)
    if (path || query || headers) {
      writeRequestParameters(doc, endpointId, { path, query, headers })
    }
    clickExecute(block)
    done = true
  }

  const tick = (): void => {
    const block = findAnyBlock(doc, endpointId)
    if (!block) return // operation left the page — stop.

    switch (phase) {
      case 'expand':
        if (block.classList.contains('is-open')) phase = 'tryOut'
        else {
          clickExpand(block)
          phase = 'awaitOpen'
        }
        break
      case 'awaitOpen':
        if (block.classList.contains('is-open')) phase = 'tryOut'
        break // else keep waiting; do NOT click again (would collapse it).
      case 'tryOut':
        if (block.querySelector(EXECUTE_BTN)) phase = 'prepareBody'
        else {
          block.querySelector<HTMLButtonElement>(TRY_OUT_BTN)?.click()
          phase = 'awaitExecute'
        }
        break
      case 'awaitExecute':
        if (block.querySelector(EXECUTE_BTN)) phase = 'prepareBody'
        break
    }

    if (phase === 'prepareBody') {
      // If parameters need filling, fill them once "Try it out" is active
      if (path || query || headers) {
        writeRequestParameters(doc, endpointId, { path, query, headers })
      }

      // Nothing to fill, or the field is already editable → run now.
      if (body == null || block.querySelector(BODY_TEXTAREA)) {
        execute(block)
      } else {
        const edit = findEditValueButton(block)
        if (edit) {
          edit.click() // OAS2 "Edit Value" — textarea mounts on re-render
          phase = 'awaitBody'
        } else {
          execute(block) // no toggle on this version — pass through
        }
      }
    } else if (phase === 'awaitBody') {
      if (block.querySelector(BODY_TEXTAREA)) {
        execute(block)
      } else {
        editWaited += pollMs
        if (editWaited > editWaitBudget) execute(block) // pass: run with the example value
      }
    }
    if (done) return

    waited += pollMs
    if (waited <= timeoutMs) schedule(tick, pollMs)
  }

  tick() // first action (expand) fires immediately.
  return true
}

/** Populate the body of an open operation. Returns false if it can't be found. */
export function writeRequestBody(doc: Document, endpointId: string, body: string): boolean {
  const block = findBlock(doc, endpointId)
  const textarea = block ? bodyTextarea(block) : null
  if (!textarea) return false
  setNativeValue(textarea, body)
  return true
}

/** Populate path, query, and header parameter inputs of an open operation in Swagger UI. */
export function writeRequestParameters(
  doc: Document,
  endpointId: string,
  params: {
    path?: Record<string, string>
    query?: Record<string, string>
    headers?: Record<string, string>
  },
): boolean {
  const block = findBlock(doc, endpointId) ?? findAnyBlock(doc, endpointId)
  if (!block) return false

  const allEntries: Array<{ name: string; value: string; inType?: string }> = []
  if (params.path) {
    for (const [k, v] of Object.entries(params.path)) {
      allEntries.push({ name: k, value: v, inType: 'path' })
    }
  }
  if (params.query) {
    for (const [k, v] of Object.entries(params.query)) {
      allEntries.push({ name: k, value: v, inType: 'query' })
    }
  }
  if (params.headers) {
    for (const [k, v] of Object.entries(params.headers)) {
      allEntries.push({ name: k, value: v, inType: 'header' })
    }
  }

  if (allEntries.length === 0) return true

  let anyWritten = false

  for (const entry of allEntries) {
    const cleanName = entry.name.trim()
    if (!cleanName) continue

    // Find candidate input in the block
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null = null

    // 1. Check data-param-name attribute
    const escaped = cleanName.replace(/"/g, '\\"')
    input = block.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `input[data-param-name="${escaped}"], select[data-param-name="${escaped}"], textarea[data-param-name="${escaped}"]`,
    )

    // 2. Check row matching
    if (!input) {
      const row = block.querySelector(`tr[data-param-name="${escaped}"]`)
      if (row) {
        input = row.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input, select, textarea',
        )
      }
    }

    // 3. Check placeholder
    if (!input) {
      input = block.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        `input[placeholder="${escaped}"], textarea[placeholder="${escaped}"]`,
      )
    }

    // 4. Search parameter rows by text label
    if (!input) {
      const allRows = Array.from(
        block.querySelectorAll('.parameters-container tr, table.parameters tr'),
      )
      for (const r of allRows) {
        const label = r
          .querySelector('.parameter__name')
          ?.textContent?.trim()
          .replace(/\s*\*\s*$/, '')
        if (label && label.toLowerCase() === cleanName.toLowerCase()) {
          input = r.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            'input, select, textarea',
          )
          if (input) break
        }
      }
    }

    if (input) {
      setNativeValue(input, entry.value)
      anyWritten = true
    }
  }

  return anyWritten
}

/** True if the operation is open and its body field is currently empty. */
export function isBodyEmpty(doc: Document, endpointId: string): boolean {
  const block = findBlock(doc, endpointId)
  const textarea = block ? bodyTextarea(block) : null
  return textarea != null && textarea.value.trim() === ''
}
