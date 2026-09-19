import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BRIDGE_TAG } from './swagger-protocol'
import { hookFetch, hookExecuteClick } from './main-world'

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

  it('injects global debug headers into outgoing fetch requests', async () => {
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncVariables',
          variables: {
            TENANT: 'acme_corp',
          },
        },
        source: window,
      }),
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncGlobalHeaders',
          headers: {
            'X-Tenant-ID': '{{TENANT}}',
            'X-Debug': 'true',
          },
        },
        source: window,
      }),
    )

    await window.fetch('https://api.example.com/items', {
      headers: {
        'Content-Type': 'application/json',
      },
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [, callInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(callInit.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Tenant-ID': 'acme_corp',
      'X-Debug': 'true',
    })
  })
})

describe('main-world execute parameter synchronization', () => {
  let unhook: () => void

  beforeEach(() => {
    unhook = hookExecuteClick(document)
  })

  afterEach(() => {
    unhook?.()
    delete (window as unknown as { ui?: unknown }).ui
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('intercepts Execute click, resolves placeholders, updates DOM, and syncs to Swagger specActions.changeParam', async () => {
    // Sync variables first
    window.dispatchEvent(
      new MessageEvent('message', {
        data: {
          tag: BRIDGE_TAG,
          dir: 'to-main',
          cmd: 'syncVariables',
          variables: {
            ID: '14',
            USER_ID: '16',
          },
        },
        source: window,
      }),
    )

    const changeParamSpy = vi.fn()
    const clearValidateParamsSpy = vi.fn()
    ;(window as unknown as { ui?: unknown }).ui = {
      specActions: {
        changeParam: changeParamSpy,
        clearValidateParams: clearValidateParamsSpy,
      },
    }

    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">PATCH</span>
          <span class="opblock-summary-path" data-path="/teams/{team_id}/members/{user_id}/promote">
            /teams/{team_id}/members/{user_id}/promote
          </span>
        </div>
        <table>
          <tbody>
            <tr>
              <td class="parameters-col_name">
                <div class="parameter__name required">team_id *</div>
                <div class="parameter__in">(path)</div>
              </td>
              <td>
                <input class="parameter" data-param-name="team_id" data-param-in="path" value="{{ID}}" />
              </td>
            </tr>
            <tr>
              <td class="parameters-col_name">
                <div class="parameter__name required">user_id *</div>
                <div class="parameter__in">(path)</div>
              </td>
              <td>
                <input class="parameter" data-param-name="user_id" data-param-in="path" value="{{USER_ID}}" />
              </td>
            </tr>
          </tbody>
        </table>
        <button class="btn execute">Execute</button>
      </div>
    `

    const block = document.querySelector('.opblock')!
    const teamInput = block.querySelector<HTMLInputElement>('input[data-param-name="team_id"]')!
    const userInput = block.querySelector<HTMLInputElement>('input[data-param-name="user_id"]')!
    const executeBtn = block.querySelector<HTMLButtonElement>('.btn.execute')!

    const executedClicks: Array<{ team: string; user: string }> = []
    executeBtn.addEventListener('click', () => {
      executedClicks.push({ team: teamInput.value, user: userInput.value })
    })

    // Click execute while inputs have {{ID}} and {{USER_ID}}
    executeBtn.click()

    // 1. Inputs are resolved immediately in DOM
    expect(teamInput.value).toBe('14')
    expect(userInput.value).toBe('16')

    // 2. Swagger UI's Redux state is updated synchronously via specActions.changeParam
    expect(changeParamSpy).toHaveBeenCalledWith(
      ['/teams/{team_id}/members/{user_id}/promote', 'patch'],
      'team_id',
      'path',
      '14',
      false,
    )
    expect(changeParamSpy).toHaveBeenCalledWith(
      ['/teams/{team_id}/members/{user_id}/promote', 'patch'],
      'user_id',
      'path',
      '16',
      false,
    )

    // 3. Validation errors are cleared
    expect(clearValidateParamsSpy).toHaveBeenCalledWith([
      '/teams/{team_id}/members/{user_id}/promote',
      'patch',
    ])

    // 4. Initial execution was held
    expect(executedClicks.length).toBe(0)

    // 5. Native click fires after delay
    await new Promise((r) => setTimeout(r, 90))
    expect(executedClicks).toEqual([{ team: '14', user: '16' }])
  })

  it('syncs existing DOM values to changeParam and clears validation errors even if inputs were already resolved', () => {
    const changeParamSpy = vi.fn()
    const clearValidateParamsSpy = vi.fn()
    ;(window as unknown as { ui?: unknown }).ui = {
      specActions: {
        changeParam: changeParamSpy,
        clearValidateParams: clearValidateParamsSpy,
      },
    }

    document.body.innerHTML = `
      <div class="opblock is-open">
        <div class="opblock-summary">
          <span class="opblock-summary-method">PATCH</span>
          <span class="opblock-summary-path" data-path="/teams/{team_id}/members/{user_id}/promote">
            /teams/{team_id}/members/{user_id}/promote
          </span>
        </div>
        <table>
          <tbody>
            <tr>
              <td class="parameters-col_name">
                <div class="parameter__name required">team_id *</div>
                <div class="parameter__in">(path)</div>
              </td>
              <td>
                <input class="parameter" data-param-name="team_id" data-param-in="path" value="14" />
              </td>
            </tr>
          </tbody>
        </table>
        <button class="btn execute">Execute</button>
      </div>
    `

    const block = document.querySelector('.opblock')!
    const executeBtn = block.querySelector<HTMLButtonElement>('.btn.execute')!

    executeBtn.click()

    expect(changeParamSpy).toHaveBeenCalledWith(
      ['/teams/{team_id}/members/{user_id}/promote', 'patch'],
      'team_id',
      'path',
      '14',
      false,
    )
    expect(clearValidateParamsSpy).toHaveBeenCalledWith([
      '/teams/{team_id}/members/{user_id}/promote',
      'patch',
    ])
  })
})
