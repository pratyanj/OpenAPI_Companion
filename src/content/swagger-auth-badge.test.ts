import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  mountSwaggerAuthBadge,
  computeExpiryStatus,
  resolveAccountIdentity,
} from './swagger-auth-badge'
import type { AuthRecord, SavedCredential } from '@/modules/authentication/types'

function makeJwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(payload)}.sig`
}

function createAuthWrapper(buttonText = 'Authorize'): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'auth-wrapper'
  wrapper.innerHTML = `
    <button class="btn authorize unlocked">
      <span>${buttonText}</span>
    </button>
  `
  return wrapper
}

describe('computeExpiryStatus', () => {
  it('returns permanent/active status when expiresAt is not provided', () => {
    const res = computeExpiryStatus(undefined)
    expect(res.status).toBe('permanent')
    expect(res.text).toBe('Active')
  })

  it('formats remaining hours and minutes compactly', () => {
    const now = 1_700_000_000_000
    const expiresAt = now + 2 * 3600_000 + 15 * 60_000 // 2h 15m
    const res = computeExpiryStatus(expiresAt, now)
    expect(res.status).toBe('active')
    expect(res.text).toBe('2h 15m')
  })

  it('formats remaining minutes compactly and marks expiring if <= 5m', () => {
    const now = 1_700_000_000_000
    const expiresAt = now + 14 * 60_000 // 14m
    const res1 = computeExpiryStatus(expiresAt, now)
    expect(res1.status).toBe('active')
    expect(res1.text).toBe('14m')

    const expiresSoon = now + 3 * 60_000 // 3m
    const res2 = computeExpiryStatus(expiresSoon, now)
    expect(res2.status).toBe('expiring')
    expect(res2.text).toBe('3m')
  })

  it('formats remaining seconds compactly when under 1 minute', () => {
    const now = 1_700_000_000_000
    const expiresAt = now + 45_000 // 45s
    const res = computeExpiryStatus(expiresAt, now)
    expect(res.status).toBe('expiring')
    expect(res.text).toBe('45s')
  })

  it('formats expired timestamps with short label', () => {
    const now = 1_700_000_000_000
    const expiresAt = now - 5 * 60_000 // expired 5m ago
    const res = computeExpiryStatus(expiresAt, now)
    expect(res.status).toBe('expired')
    expect(res.text).toBe('Expired')
    expect(res.tooltip).toContain('5m ago')
  })
})

describe('resolveAccountIdentity', () => {
  it('returns Not Authorized when record is missing or has no token', () => {
    expect(resolveAccountIdentity(null)).toEqual({ name: 'Not Authorized' })
  })

  it('prefers vault account name if provided', () => {
    const record: AuthRecord = {
      type: 'bearer',
      token: makeJwt({ role: 'admin', name: 'John' }),
      environmentId: 'env-1',
      updatedAt: Date.now(),
    }
    const identity = resolveAccountIdentity(record, 'Admin Account')
    expect(identity.name).toBe('Admin Account')
    expect(identity.role).toBe('admin')
  })

  it('extracts name and role from JWT claims when no vault name given', () => {
    const record: AuthRecord = {
      type: 'bearer',
      token: makeJwt({ name: 'Alice Smith', role: 'Manager' }),
      environmentId: 'env-1',
      updatedAt: Date.now(),
    }
    const identity = resolveAccountIdentity(record)
    expect(identity.name).toBe('Alice Smith')
    expect(identity.role).toBe('Manager')
  })

  it('falls back to schemeName or Authorized', () => {
    const record: AuthRecord = {
      type: 'apiKey',
      token: 'raw-api-key',
      schemeName: 'ApiKeyAuth',
      environmentId: 'env-1',
      updatedAt: Date.now(),
    }
    const identity = resolveAccountIdentity(record)
    expect(identity.name).toBe('ApiKeyAuth')
  })
})

describe('swagger-auth-badge mounting & interactions', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    vi.useRealTimers()
  })

  it('injects badge below Authorize button and displays active account & compact expiry', () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const record: AuthRecord = {
      type: 'bearer',
      token: makeJwt({ name: 'Admin User', role: 'Admin' }),
      environmentId: 'env-1',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 14 * 60_000, // 14m
    }

    const handle = mountSwaggerAuthBadge(document)
    handle.update(record, 'Admin')

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain('Admin')
    expect(badge?.textContent).toContain('14m')
    expect(badge?.querySelector('.oac-auth-renew-btn')).not.toBeNull()

    // Zero emojis check
    expect(badge?.innerHTML).not.toMatch(/[\uD800-\uDFFF]/)

    handle.dispose()
  })

  it('triggers 1-click renewal and updates button status with feedback', async () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const onRenew = vi.fn().mockResolvedValue(true)

    const record: AuthRecord = {
      type: 'bearer',
      token: 'token-1',
      environmentId: 'env-1',
      updatedAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    }

    const handle = mountSwaggerAuthBadge(document, { onRenew })
    handle.update(record, 'Admin')

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    const renewBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-renew-btn')!

    renewBtn.click()

    expect(renewBtn.classList.contains('spinning')).toBe(true)

    await Promise.resolve()

    expect(onRenew).toHaveBeenCalled()
    expect(renewBtn.classList.contains('success')).toBe(true)
    expect(renewBtn.title).toContain('renewed')

    // Reverts after 1500ms
    vi.advanceTimersByTime(1600)
    expect(renewBtn.classList.contains('success')).toBe(false)

    handle.dispose()
  })

  it('countdown updates periodically when timer fires', () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const now = Date.now()
    const record: AuthRecord = {
      type: 'bearer',
      token: makeJwt({ sub: 'u1' }),
      environmentId: 'env-1',
      updatedAt: now,
      expiresAt: now + 2 * 60_000, // 2m
    }

    const handle = mountSwaggerAuthBadge(document)
    handle.update(record, 'Admin')

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    expect(badge.textContent).toContain('2m')

    // Advance by 70 seconds -> should now be 50s (timer ticks every 10s)
    vi.advanceTimersByTime(70_000)

    expect(badge.textContent).toContain('50s')
    expect(badge.classList.contains('expiring')).toBe(true)

    handle.dispose()
  })

  it('opens account switcher dropdown when identity button is clicked', () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const saved: SavedCredential[] = [
      {
        id: 'cred-1',
        name: 'Admin Account',
        type: 'bearer',
        token: makeJwt({ role: 'Admin', name: 'admin@example.com' }),
        createdAt: Date.now(),
      },
      {
        id: 'cred-2',
        name: 'Staff Account',
        type: 'bearer',
        token: makeJwt({ role: 'Staff', name: 'staff@example.com' }),
        createdAt: Date.now(),
      },
    ]

    const handle = mountSwaggerAuthBadge(document)
    handle.update(null, null, saved)

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    expect(badge.style.display).not.toBe('none')

    const identityBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-identity-btn')!
    identityBtn.click()

    const dropdown = badge.querySelector<HTMLElement>('.oac-account-dropdown')
    expect(dropdown).not.toBeNull()
    expect(dropdown?.textContent).toContain('Switch Account / Role')
    expect(dropdown?.textContent).toContain('2 Accounts')
    expect(dropdown?.textContent).toContain('Admin Account')
    expect(dropdown?.textContent).toContain('Staff Account')

    handle.dispose()
  })

  it('selects an account and calls onSelectAccount when item is clicked', async () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const onSelectAccount = vi.fn().mockResolvedValue(true)
    const saved: SavedCredential[] = [
      {
        id: 'cred-1',
        name: 'Admin Account',
        type: 'bearer',
        token: 'token-admin',
        createdAt: Date.now(),
      },
      {
        id: 'cred-2',
        name: 'Staff Account',
        type: 'bearer',
        token: 'token-staff',
        createdAt: Date.now(),
      },
    ]

    const handle = mountSwaggerAuthBadge(document, { onSelectAccount })
    handle.update(null, null, saved)

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    const identityBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-identity-btn')!
    identityBtn.click()

    const staffItem = badge.querySelector<HTMLElement>('.oac-account-item[data-cred-id="cred-2"]')!
    staffItem.click()

    expect(onSelectAccount).toHaveBeenCalledWith('cred-2')
    // Dropdown closes after selection
    expect(badge.querySelector('.oac-account-dropdown')).toBeNull()

    handle.dispose()
  })

  it('closes dropdown when clicking outside or pressing Escape', () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const saved: SavedCredential[] = [
      {
        id: 'cred-1',
        name: 'Admin',
        type: 'bearer',
        token: 'token-1',
        createdAt: Date.now(),
      },
    ]

    const handle = mountSwaggerAuthBadge(document)
    handle.update(null, null, saved)

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    const identityBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-identity-btn')!
    identityBtn.click()

    expect(badge.querySelector('.oac-account-dropdown')).not.toBeNull()

    // Press Escape
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(badge.querySelector('.oac-account-dropdown')).toBeNull()

    // Reopen and click outside
    identityBtn.click()
    expect(badge.querySelector('.oac-account-dropdown')).not.toBeNull()

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(badge.querySelector('.oac-account-dropdown')).toBeNull()

    handle.dispose()
  })

  it('does not render manage accounts in auth tab footer in dropdown', () => {
    const wrapper = createAuthWrapper()
    document.body.appendChild(wrapper)

    const handle = mountSwaggerAuthBadge(document)
    handle.update(null, null, [])

    const badge = wrapper.querySelector<HTMLElement>('.oac-auth-status-badge')!
    const record: AuthRecord = {
      type: 'bearer',
      token: 'some-token',
      environmentId: 'env-1',
      updatedAt: Date.now(),
    }
    handle.update(record, 'Anonymous')

    const identityBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-identity-btn')!
    identityBtn.click()

    expect(badge.querySelector('.oac-account-dropdown')).not.toBeNull()
    expect(badge.querySelector('.oac-account-dropdown-footer')).toBeNull()
    expect(badge.querySelector('.oac-account-manage-btn')).toBeNull()

    handle.dispose()
  })

  it('injects compact switcher next to Execute button in .execute-wrapper and switches accounts', async () => {
    const headerWrapper = createAuthWrapper()
    document.body.appendChild(headerWrapper)

    const opblock = document.createElement('div')
    opblock.className = 'opblock'
    const execWrapper = document.createElement('div')
    execWrapper.className = 'execute-wrapper'
    execWrapper.innerHTML = '<button class="btn execute">Execute</button>'
    opblock.appendChild(execWrapper)
    document.body.appendChild(opblock)

    const onSelectAccount = vi.fn().mockResolvedValue(true)
    const saved: SavedCredential[] = [
      {
        id: 'cred-admin',
        name: 'Admin',
        type: 'bearer',
        token: 'token-admin',
        createdAt: Date.now(),
      },
      {
        id: 'cred-staff',
        name: 'Staff',
        type: 'bearer',
        token: 'token-staff',
        createdAt: Date.now(),
      },
    ]

    const handle = mountSwaggerAuthBadge(document, { onSelectAccount })
    handle.update(null, null, saved)

    const execSwitcher = execWrapper.querySelector<HTMLElement>('.oac-execute-account-switcher')
    expect(execSwitcher).not.toBeNull()

    const execBtn = execSwitcher?.querySelector<HTMLButtonElement>('.oac-execute-account-btn')
    expect(execBtn).not.toBeNull()
    expect(execBtn?.textContent).toContain('Users')

    // Click to open dropdown in execute bar
    execBtn?.click()

    const dropdown = execSwitcher?.querySelector<HTMLElement>('.oac-account-dropdown')
    expect(dropdown).not.toBeNull()
    expect(dropdown?.textContent).toContain('Admin')
    expect(dropdown?.textContent).toContain('Staff')

    // Click Staff to switch account directly from execute bar
    const staffItem = dropdown?.querySelector<HTMLElement>(
      '.oac-account-item[data-cred-id="cred-staff"]',
    )!
    staffItem.click()

    expect(onSelectAccount).toHaveBeenCalledWith('cred-staff')
    expect(execSwitcher?.querySelector('.oac-account-dropdown')).toBeNull()

    handle.dispose()
  })
  it('mounts account switcher into .execute-wrapper of open operations', () => {
    const authWrapper = createAuthWrapper()
    document.body.appendChild(authWrapper)

    const execWrapper = document.createElement('div')
    execWrapper.className = 'execute-wrapper'
    execWrapper.innerHTML = `<button class="btn execute opblock-control__btn">Execute</button>`
    document.body.appendChild(execWrapper)

    const record: AuthRecord = {
      type: 'bearer',
      token: makeJwt({ role: 'Admin', name: 'admin@app.com' }),
      environmentId: 'env-1',
      updatedAt: Date.now(),
    }

    const handle = mountSwaggerAuthBadge(document)
    handle.update(record, 'Admin User')

    const opBtn = execWrapper.querySelector<HTMLButtonElement>('.oac-op-account-switcher')
    expect(opBtn).not.toBeNull()
    expect(opBtn?.textContent).toContain('Admin User')

    // Also verify header badge
    const headerBadge = authWrapper.querySelector<HTMLElement>('.oac-auth-status-badge')
    expect(headerBadge?.textContent).toContain('Admin User')

    handle.dispose()
  })

  it('allows 1-click account switching directly from inside an open operation', async () => {
    const authWrapper = createAuthWrapper()
    document.body.appendChild(authWrapper)

    const execWrapper = document.createElement('div')
    execWrapper.className = 'execute-wrapper'
    execWrapper.innerHTML = `<button class="btn execute opblock-control__btn">Execute</button>`
    document.body.appendChild(execWrapper)

    const onSelectAccount = vi.fn().mockResolvedValue(true)
    const saved: SavedCredential[] = [
      {
        id: 'cred-admin',
        name: 'Admin',
        type: 'bearer',
        token: 'token-admin',
        createdAt: Date.now(),
      },
      {
        id: 'cred-staff',
        name: 'Staff',
        type: 'bearer',
        token: 'token-staff',
        createdAt: Date.now(),
      },
    ]

    const handle = mountSwaggerAuthBadge(document, { onSelectAccount })
    handle.update(null, null, saved)

    const opBtn = execWrapper.querySelector<HTMLButtonElement>('.oac-op-account-switcher')!
    expect(opBtn).not.toBeNull()
    opBtn.click()

    const container = execWrapper.querySelector('.oac-op-account-container')!
    const dropdown = container.querySelector('.oac-account-dropdown')
    expect(dropdown).not.toBeNull()
    expect(dropdown?.textContent).toContain('Staff')

    const staffItem = container.querySelector<HTMLElement>(
      '.oac-account-item[data-cred-id="cred-staff"]',
    )!
    staffItem.click()

    expect(onSelectAccount).toHaveBeenCalledWith('cred-staff')

    // Dropdown closes
    expect(container.querySelector('.oac-account-dropdown')).toBeNull()

    handle.dispose()
  })

  it('mounts into execute bar with oac-execute-account-switcher and oac-op-account-container', () => {
    const execWrapper = document.createElement('div')
    execWrapper.className = 'execute-wrapper'
    execWrapper.innerHTML = '<button class="btn execute opblock-control__btn">Execute</button>'
    document.body.appendChild(execWrapper)

    const handle = mountSwaggerAuthBadge(document)
    const opBtn = execWrapper.querySelector('.oac-op-account-switcher')
    const container = execWrapper.querySelector('.oac-execute-account-switcher')
    expect(opBtn).not.toBeNull()
    expect(container).not.toBeNull()
    handle.dispose()
    execWrapper.remove()
  })
})
