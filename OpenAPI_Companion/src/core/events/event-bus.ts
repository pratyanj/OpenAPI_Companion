import type { Unsubscribe } from '@/types'
import type { EventName, EventPayload, EventHandler } from './types'

type AnyHandler = (payload: unknown) => void

/**
 * Typed, synchronous, in-process pub/sub (planning/12_EVENT_SYSTEM.md §1).
 *
 * - One bus per JS context (background / content-sidebar). Cross-context events
 *   are bridged via chrome.runtime messaging and re-published locally.
 * - A throwing subscriber is caught and logged; it never breaks delivery to the
 *   others. Handlers are snapshotted before dispatch so a handler may safely
 *   (un)subscribe during publish.
 */
export class EventBus {
  private readonly handlers = new Map<EventName, Set<AnyHandler>>()

  publish<E extends EventName>(event: E, payload: EventPayload[E]): void {
    const set = this.handlers.get(event)
    if (!set || set.size === 0) return
    for (const handler of [...set]) {
      try {
        handler(payload)
      } catch (error) {
        console.error(`[EventBus] subscriber for "${event}" threw:`, error)
      }
    }
  }

  subscribe<E extends EventName>(event: E, handler: EventHandler<E>): Unsubscribe {
    let set = this.handlers.get(event)
    if (!set) {
      set = new Set<AnyHandler>()
      this.handlers.set(event, set)
    }
    const wrapped = handler as AnyHandler
    set.add(wrapped)
    return () => {
      const current = this.handlers.get(event)
      current?.delete(wrapped)
      if (current && current.size === 0) this.handlers.delete(event)
    }
  }

  /** Subscribe for a single delivery, then auto-unsubscribe. */
  once<E extends EventName>(event: E, handler: EventHandler<E>): Unsubscribe {
    const off = this.subscribe(event, (payload) => {
      off()
      handler(payload)
    })
    return off
  }

  /** Test/teardown helper — drop all subscribers. */
  clear(): void {
    this.handlers.clear()
  }
}

/** Per-context singleton for app-wide use. Tests should construct their own. */
export const bus = new EventBus()
