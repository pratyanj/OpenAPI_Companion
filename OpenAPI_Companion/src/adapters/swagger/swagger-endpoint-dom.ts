import type { EndpointInfo } from '../types'
import { endpointIdOf } from './swagger-request-dom'

/**
 * DOM helpers for enumerating and navigating Swagger operations (for the
 * Productivity endpoint index). Reads the shared page DOM directly. Selectors
 * are the per-version-tunable part (risk R-01) and are unit-tested against a
 * synthetic structure.
 */

const ANY_BLOCK = '.opblock'
const TAG_SECTION = '.opblock-tag-section'
const SUMMARY_CONTROL = '.opblock-summary-control'
const SUMMARY = '.opblock-summary'
const SUMMARY_DESC = '.opblock-summary-description'

/** The tag/section name an operation block belongs to, if any. */
function tagOf(block: Element): string | undefined {
  const section = block.closest(TAG_SECTION)
  const tag =
    section?.querySelector('[data-tag]')?.getAttribute('data-tag') ??
    section?.querySelector('.opblock-tag')?.getAttribute('data-tag') ??
    section?.querySelector('.opblock-tag a, .opblock-tag span')?.textContent?.trim()
  return tag || undefined
}

/** All operations on the page, in document order. */
export function listEndpoints(doc: Document = document): EndpointInfo[] {
  const out: EndpointInfo[] = []
  const seen = new Set<string>()
  for (const block of Array.from(doc.querySelectorAll(ANY_BLOCK))) {
    const endpointId = endpointIdOf(block)
    if (!endpointId || seen.has(endpointId)) continue
    seen.add(endpointId)
    const [method = 'get', path = ''] = endpointId.split(' ')
    const summary = block.querySelector(SUMMARY_DESC)?.textContent?.trim() || undefined
    out.push({ endpointId, method, path, summary, tag: tagOf(block) })
  }
  return out
}

/** Expand an operation and scroll it into view (no execute). False if absent. */
export function openEndpoint(doc: Document, endpointId: string): boolean {
  const block = Array.from(doc.querySelectorAll(ANY_BLOCK)).find(
    (b) => endpointIdOf(b) === endpointId,
  )
  if (!block) return false
  if (!block.classList.contains('is-open')) {
    const control =
      block.querySelector<HTMLElement>(SUMMARY_CONTROL) ?? block.querySelector<HTMLElement>(SUMMARY)
    control?.click()
  }
  ;(block as HTMLElement).scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  return true
}
