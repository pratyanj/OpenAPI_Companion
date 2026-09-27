import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeArea } from '@/tests/fake-storage'
import {
  getRuntimeMetadata,
  sendFeedback,
  isOnboardingCompleted,
  completeOnboarding,
  getSavedUserEmail,
  ONBOARDING_COMPLETED_KEY,
  FEEDBACK_STORAGE_KEY,
  PENDING_FEEDBACK_KEY,
} from './feedback-service'

describe('feedback-service', () => {
  let fakeArea = createFakeArea()

  beforeEach(() => {
    vi.restoreAllMocks()
    fakeArea = createFakeArea()
    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea,
      },
    })
  })

  it('collects runtime metadata with valid timestamp and app version', () => {
    const meta = getRuntimeMetadata()
    expect(meta.timestamp).toBeGreaterThan(0)
    expect(meta.version).toBeDefined()
    expect(meta.browser).toBeDefined()
    expect(meta.os).toBeDefined()
  })

  it('sends feedback payload successfully when network is available', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    }))
    vi.stubGlobal('fetch', fakeFetch)

    const res = await sendFeedback({
      type: 'user_feedback',
      email: 'dev@example.com',
      rating: 5,
      category: 'feature',
      message: 'Great extension!',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.savedLocally).toBe(false)
    }
    expect(fakeFetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to local pending storage when network fails', async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error('Network error / offline')
    })
    vi.stubGlobal('fetch', fakeFetch)

    const res = await sendFeedback({
      type: 'install_lead',
      email: 'lead@example.com',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.savedLocally).toBe(true)
    }
    const stored = await fakeArea.get(PENDING_FEEDBACK_KEY)
    expect(stored[PENDING_FEEDBACK_KEY]).toBeDefined()
    expect(Array.isArray(stored[PENDING_FEEDBACK_KEY])).toBe(true)
  })

  it('delegates to chrome.runtime.sendMessage when available in extension context', async () => {
    const mockSendMessage = vi.fn((_message, callback) => {
      callback({ ok: true })
    })
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea },
      runtime: { sendMessage: mockSendMessage },
    })

    const res = await sendFeedback({
      type: 'user_feedback',
      email: 'dev@example.com',
      rating: 5,
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.savedLocally).toBe(false)
    }
    expect(mockSendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SUBMIT_FEEDBACK' }),
      expect.any(Function),
    )
  })

  it('falls back to offline storage if chrome.runtime.sendMessage fails', async () => {
    const mockSendMessage = vi.fn((_message, callback) => {
      callback({ ok: false, error: 'Network failure' })
    })
    const fakeFetch = vi.fn(async () => {
      throw new Error('fetch error')
    })
    vi.stubGlobal('fetch', fakeFetch)
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea },
      runtime: { sendMessage: mockSendMessage },
    })

    const res = await sendFeedback({
      type: 'user_feedback',
      email: 'dev@example.com',
    })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.savedLocally).toBe(true)
    }
    const stored = await fakeArea.get(PENDING_FEEDBACK_KEY)
    expect(stored[PENDING_FEEDBACK_KEY]).toHaveLength(1)
  })

  it('reads and writes onboarding completion status and email', async () => {
    expect(await isOnboardingCompleted()).toBe(false)

    await completeOnboarding('user@company.com')

    const stored = await fakeArea.get([ONBOARDING_COMPLETED_KEY, FEEDBACK_STORAGE_KEY])
    expect(stored[ONBOARDING_COMPLETED_KEY]).toBe(true)
    expect(stored[FEEDBACK_STORAGE_KEY]).toBe('user@company.com')
    expect(await isOnboardingCompleted()).toBe(true)
    expect(await getSavedUserEmail()).toBe('user@company.com')
  })
})
