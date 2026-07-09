import type { EventBus } from '@/core/events'

export type ToastKind = 'success' | 'warning' | 'error'

/**
 * Publishes user-facing toast requests onto the event bus. The `<ToastLayer>`
 * subscribes to `NOTIFY` and renders them (planning/11 NotificationService,
 * planning/12 NOTIFY). Keeps callers decoupled from the UI.
 */
export class NotificationService {
  constructor(private readonly bus: EventBus) {}

  notify(kind: ToastKind, message: string): void {
    this.bus.publish('NOTIFY', { kind, message })
  }

  success(message: string): void {
    this.notify('success', message)
  }

  warning(message: string): void {
    this.notify('warning', message)
  }

  error(message: string): void {
    this.notify('error', message)
  }
}
