import { useEffect, useRef } from 'react'
import type { EventBus, EventName, EventPayload } from '@/core/events'

/**
 * Subscribe a component to an event for its lifetime; auto-unsubscribes on
 * unmount (planning/10 §4, prevents listener leaks — security §1.13). The
 * handler is kept in a ref so re-renders don't churn the subscription.
 */
export function useEventBus<E extends EventName>(
  bus: EventBus,
  event: E,
  handler: (payload: EventPayload[E]) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const off = bus.subscribe(event, (payload) => handlerRef.current(payload))
    return off
  }, [bus, event])
}
