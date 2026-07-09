import { useCallback, useEffect, useRef, useState } from 'react'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import { Toast, type ToastItem } from './Toast'

const AUTO_DISMISS_MS = 4000

/**
 * Renders transient toasts from `NOTIFY` events (planning/09 §10, FR-020).
 * Auto-dismisses; announces politely for assistive tech.
 */
export function ToastLayer({ bus }: { bus: EventBus }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  useEventBus(bus, 'NOTIFY', ({ kind, message }) => {
    const id = ++idRef.current
    setToasts((current) => [...current, { id, kind, message }])
    timers.current.set(
      id,
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
    )
  })

  useEffect(() => {
    const active = timers.current
    return () => {
      for (const timer of active.values()) clearTimeout(timer)
      active.clear()
    }
  }, [])

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-3 right-3 flex w-64 flex-col gap-2"
    >
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast {...t} onDismiss={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  )
}
