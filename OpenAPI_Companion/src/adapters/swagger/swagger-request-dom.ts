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

/** Set a React-controlled input/textarea value so Swagger's state updates. */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
  descriptor?.set?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
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

export function readOpenRequests(doc: Document = document): RequestSnapshot[] {
  const snapshots: RequestSnapshot[] = []
  for (const block of Array.from(doc.querySelectorAll(OPEN_BLOCK))) {
    const endpointId = endpointIdOf(block)
    if (!endpointId) continue
    const method = endpointId.split(' ')[0] ?? 'unknown'
    const body = bodyTextarea(block)?.value
    snapshots.push({ endpointId, method, body: body || undefined })
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
 * enable "Try it out", fill the body, and click Execute.
 *
 * Swagger re-renders (asynchronously, via React) after each of expand / try-out /
 * edit-value, so this drives a small **polling state machine**: it performs one
 * action per tick and waits `pollMs` for the DOM to settle before the next,
 * clicking each control exactly once (never toggling it back off). The
 * edit-value step is best-effort ("try or pass"): versions without the toggle
 * skip it, and if the textarea never appears we execute with Swagger's example
 * value rather than stall. Returns false only if the endpoint isn't on the page
 * at all; otherwise the sequence runs to completion asynchronously. See risk
 * R-01 — selectors/timing are the tunable part.
 */
export function autoExecute(
  doc: Document,
  endpointId: string,
  opts: AutoExecuteOptions = {},
): boolean {
  const { body, pollMs = 120, timeoutMs = 6000 } = opts
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
    if (body != null) writeRequestBody(doc, endpointId, body) // best-effort fill
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

/** True if the operation is open and its body field is currently empty. */
export function isBodyEmpty(doc: Document, endpointId: string): boolean {
  const block = findBlock(doc, endpointId)
  const textarea = block ? bodyTextarea(block) : null
  return textarea != null && textarea.value.trim() === ''
}
