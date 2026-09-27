import { describe, it, expect, vi, afterEach } from 'vitest'
import { act } from '@testing-library/react'
import { EventBus } from '@/core/events'
import { mountFeedbackModal } from './feedback-modal'

vi.mock('@/services/feedback-service', () => ({
  sendFeedback: vi.fn().mockResolvedValue({ ok: true, value: { savedLocally: false } }),
  getSavedUserEmail: vi.fn().mockResolvedValue('user@example.com'),
  getRuntimeMetadata: vi.fn().mockReturnValue({
    version: '1.2.1',
    browser: 'Chrome',
    os: 'Windows',
    timestamp: 123456,
    userAgent: 'test-agent',
  }),
  completeOnboarding: vi.fn().mockResolvedValue(undefined),
}))

describe('mountFeedbackModal (in-page feedback modal overlay)', () => {
  afterEach(() => {
    document.getElementById('oac-feedback-modal-host')?.remove()
  })

  const shadow = () => document.getElementById('oac-feedback-modal-host')?.shadowRoot ?? null
  const dialog = () => shadow()?.querySelector('[role="dialog"]') ?? null

  it('injects shadow host but renders nothing until opened', async () => {
    const bus = new EventBus()
    const modal = mountFeedbackModal(bus)
    expect(shadow()).not.toBeNull()
    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()
    await act(async () => {
      modal.destroy()
    })
  })

  it('opens and closes via imperative handle', async () => {
    const bus = new EventBus()
    const modal = mountFeedbackModal(bus)

    await act(async () => {
      modal.open()
    })

    expect(modal.isOpen()).toBe(true)
    expect(dialog()).not.toBeNull()
    expect(dialog()?.getAttribute('aria-label')).toBe('Share Feedback & Suggestions')

    await act(async () => {
      modal.close()
    })

    expect(modal.isOpen()).toBe(false)
    expect(dialog()).toBeNull()

    await act(async () => {
      modal.destroy()
    })
  })

  it('toggles open and closed state with initial category', async () => {
    const bus = new EventBus()
    const modal = mountFeedbackModal(bus)

    await act(async () => {
      modal.toggle({ initialCategory: 'bug' })
    })
    expect(modal.isOpen()).toBe(true)
    expect(dialog()?.textContent).toContain('Bug Report')

    await act(async () => {
      modal.toggle()
    })
    expect(modal.isOpen()).toBe(false)

    await act(async () => {
      modal.destroy()
    })
  })

  it('cleans up DOM and root on destroy', async () => {
    const bus = new EventBus()
    const modal = mountFeedbackModal(bus)

    await act(async () => {
      modal.open()
    })
    expect(document.getElementById('oac-feedback-modal-host')).not.toBeNull()

    await act(async () => {
      modal.destroy()
    })
    expect(document.getElementById('oac-feedback-modal-host')).toBeNull()
  })
})
