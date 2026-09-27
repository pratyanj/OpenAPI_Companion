import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createFakeArea } from '@/tests/fake-storage'
import {
  getPendingUpdate,
  setPendingUpdate,
  clearPendingUpdate,
  checkForUpdates,
  applyUpdateAndReload,
  UPDATE_AVAILABLE_KEY,
} from './update-service'

describe('update-service', () => {
  let fakeArea = createFakeArea()
  const mockReload = vi.fn()
  const mockRequestUpdateCheck = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    fakeArea = createFakeArea()
    mockReload.mockClear()
    mockRequestUpdateCheck.mockClear()

    vi.stubGlobal('chrome', {
      storage: {
        local: fakeArea,
      },
      runtime: {
        reload: mockReload,
        requestUpdateCheck: mockRequestUpdateCheck,
        lastError: null,
      },
    })
  })

  it('manages pending update state in chrome.storage.local', async () => {
    expect(await getPendingUpdate()).toBeNull()

    await setPendingUpdate('1.2.1')
    const update = await getPendingUpdate()
    expect(update).not.toBeNull()
    expect(update?.version).toBe('1.2.1')
    expect(update?.at).toBeGreaterThan(0)

    await clearPendingUpdate()
    expect(await getPendingUpdate()).toBeNull()
  })

  it('handles update_available from requestUpdateCheck', async () => {
    mockRequestUpdateCheck.mockImplementation((cb: (status: string, details?: { version: string }) => void) => {
      cb('update_available', { version: '1.2.5' })
    })

    const res = await checkForUpdates()
    expect(res.status).toBe('update_available')
    expect(res.version).toBe('1.2.5')

    const pending = await getPendingUpdate()
    expect(pending?.version).toBe('1.2.5')
  })

  it('handles no_update status', async () => {
    mockRequestUpdateCheck.mockImplementation((cb: (status: string) => void) => {
      cb('no_update')
    })

    const res = await checkForUpdates()
    expect(res.status).toBe('no_update')
  })

  it('handles throttled status', async () => {
    mockRequestUpdateCheck.mockImplementation((cb: (status: string) => void) => {
      cb('throttled')
    })

    const res = await checkForUpdates()
    expect(res.status).toBe('throttled')
  })

  it('handles lastError (e.g. unpacked dev extension)', async () => {
    vi.stubGlobal('chrome', {
      storage: { local: fakeArea },
      runtime: {
        requestUpdateCheck: (cb: (status: string) => void) => {
          cb('throttled')
        },
        lastError: { message: 'Cannot check updates for unpacked extension' },
      },
    })

    const res = await checkForUpdates()
    expect(res.status).toBe('unsupported')
    expect(res.message).toContain('unpacked')
  })

  it('clears pending update and invokes chrome.runtime.reload upon apply', async () => {
    await fakeArea.set({ [UPDATE_AVAILABLE_KEY]: { version: '1.2.1', at: 100 } })

    await applyUpdateAndReload()

    expect(mockReload).toHaveBeenCalledTimes(1)
    const pending = await fakeArea.get(UPDATE_AVAILABLE_KEY)
    expect(pending[UPDATE_AVAILABLE_KEY]).toBeUndefined()
  })
})
