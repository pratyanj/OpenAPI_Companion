import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BRIDGE_TAG } from './swagger-protocol'
import { hookFetch } from './main-world'

describe('main-world network interception', () => {
  let originalFetch: typeof window.fetch
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })))
    originalFetch = window.fetch
    window.fetch = fetchSpy

    // Import or re-import main-world
    hookFetch()
  })

  afterEach(() => {
    window.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('resolves {{variables}} in outgoing fetch requests after syncing variables', async () => {
    // Send syncVariables message to window
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncVariables',
          variables: {
            API_HOST: 'https://api.example.com',
            USER_ID: 'user_42',
            AUTH_TOKEN: 'token_xyz',
          },
        },
        source: window,
      }),
    )

    // Make a fetch call with placeholders
    await window.fetch('{{API_HOST}}/users/{{USER_ID}}/details', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer {{AUTH_TOKEN}}',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assignee: '{{USER_ID}}',
      }),
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [callUrl, callInit] = fetchSpy.mock.calls[0] as [string, RequestInit]

    expect(callUrl).toBe('https://api.example.com/users/user_42/details')
    expect(callInit.headers).toMatchObject({
      Authorization: 'Bearer token_xyz',
      'Content-Type': 'application/json',
    })
    expect(callInit.body).toContain('"assignee":"user_42"')
  })

  it('resolves URL-encoded %7B%7BVAR%7D%7D placeholders in fetch URLs', async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncVariables',
          variables: {
            TASK_ID: '987',
          },
        },
        source: window,
      }),
    )

    await window.fetch('https://api.example.com/tasks/%7B%7BTASK_ID%7D%7D')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [callUrl] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(callUrl).toBe('https://api.example.com/tasks/987')
  })
})
