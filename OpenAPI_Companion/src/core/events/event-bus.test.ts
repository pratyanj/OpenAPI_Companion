import { describe, it, expect, vi } from 'vitest'
import { EventBus } from './event-bus'

describe('EventBus', () => {
  it('delivers a published payload to a subscriber', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.subscribe('THEME_CHANGED', handler)

    bus.publish('THEME_CHANGED', { theme: 'dark' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ theme: 'dark' })
  })

  it('does not deliver after unsubscribe', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    const off = bus.subscribe('PROJECT_CHANGED', handler)

    off()
    bus.publish('PROJECT_CHANGED', { projectId: 'p1' })

    expect(handler).not.toHaveBeenCalled()
  })

  it('only notifies subscribers of the matching event', () => {
    const bus = new EventBus()
    const onTheme = vi.fn()
    const onProject = vi.fn()
    bus.subscribe('THEME_CHANGED', onTheme)
    bus.subscribe('PROJECT_CHANGED', onProject)

    bus.publish('THEME_CHANGED', { theme: 'light' })

    expect(onTheme).toHaveBeenCalledTimes(1)
    expect(onProject).not.toHaveBeenCalled()
  })

  it('isolates a throwing subscriber from the others', () => {
    const bus = new EventBus()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = vi.fn(() => {
      throw new Error('boom')
    })
    const good = vi.fn()
    bus.subscribe('NOTIFY', bad)
    bus.subscribe('NOTIFY', good)

    bus.publish('NOTIFY', { kind: 'success', message: 'hi' })

    expect(bad).toHaveBeenCalledTimes(1)
    expect(good).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('supports multiple subscribers for the same event', () => {
    const bus = new EventBus()
    const a = vi.fn()
    const b = vi.fn()
    bus.subscribe('STORAGE_MIGRATED', a)
    bus.subscribe('STORAGE_MIGRATED', b)

    bus.publish('STORAGE_MIGRATED', { from: 0, to: 1 })

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('once() delivers a single time then detaches', () => {
    const bus = new EventBus()
    const handler = vi.fn()
    bus.once('RECENT_UPDATED', handler)

    bus.publish('RECENT_UPDATED', { endpointId: 'e1' })
    bus.publish('RECENT_UPDATED', { endpointId: 'e2' })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ endpointId: 'e1' })
  })

  it('allows a subscriber to unsubscribe during publish without skipping others', () => {
    const bus = new EventBus()
    const order: string[] = []
    const off1 = bus.subscribe('NOTIFY', () => {
      order.push('first')
      off1()
    })
    bus.subscribe('NOTIFY', () => order.push('second'))

    bus.publish('NOTIFY', { kind: 'success', message: 'x' })
    bus.publish('NOTIFY', { kind: 'success', message: 'y' })

    expect(order).toEqual(['first', 'second', 'second'])
  })
})
