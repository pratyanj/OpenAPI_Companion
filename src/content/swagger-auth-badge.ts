/**
 * Swagger UI Active Account & Token Expiry Status Badge:
 * - Injected directly below Swagger's native Authorize button
 * - Compact, sleek design matching Swagger UI's button proportions
 * - Real-time token expiry countdown timer (e.g. "14m", "45s", "Expired")
 * - Smart account name & role detection from vault & JWT claims
 * - 1-Click token renewal icon button with animated feedback
 * - 100% SVG vector icons (zero emojis)
 * - Clean status feedback (never displays raw error text in button label)
 */
import type { AuthRecord } from '@/modules/authentication/types'
import { extractUserDisplayFromJwt } from '@/utils/jwt'

export interface SwaggerAuthBadgeOptions {
  onRenew?: () => Promise<boolean>
  getAuthRecord?: () => Promise<AuthRecord | null>
  getAccountName?: () => Promise<string | null>
}

export interface SwaggerAuthBadgeHandle {
  update(record: AuthRecord | null, accountName?: string | null): void
  scanAndMount(root?: ParentNode): number
  dispose(): void
}

export const SVG_ICONS = {
  user: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  clock: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  refresh: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  key: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-1.5 1.5L14 9l-3 3-2 2-2 2m0 0l-3 3a2.828 2.828 0 1 1-4-4l3-3m6-6l2.5-2.5"/></svg>`,
  shield: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
}

const STYLE_ID = 'oac-auth-badge-styles'
const ATTACHED_ATTR = 'data-oac-auth-attached'

const CSS_STYLES = `
.swagger-ui .auth-wrapper {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  gap: 4px !important;
}

.oac-auth-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 3px 8px;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: #374151;
  user-select: none;
  line-height: 1.4;
  transition: all 0.15s ease;
  z-index: 10;
  max-width: 200px;
}

.oac-auth-status-badge:hover {
  border-color: #9ca3af;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.oac-auth-status-badge.expiring {
  border-color: #f59e0b;
  background: #fffbeb;
  color: #b45309;
}

.oac-auth-status-badge.expired {
  border-color: #f87171;
  background: #fef2f2;
  color: #b91c1c;
}

.oac-auth-identity {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
  max-width: 95px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oac-auth-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oac-auth-role-tag {
  display: inline-block;
  padding: 0 4px;
  font-size: 8px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  border-radius: 3px;
  line-height: 14px;
}

.oac-auth-divider {
  color: #cbd5e1;
  font-size: 10px;
}

.oac-auth-expiry {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.oac-auth-renew-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: #f3f4f6;
  border: 1px solid #d1d5db;
  border-radius: 3px;
  color: #4b5563;
  cursor: pointer;
  outline: none;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.oac-auth-renew-btn:hover {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.15);
}

.oac-auth-renew-btn:active {
  background: #dbeafe;
}

.oac-auth-renew-btn.success {
  background: #dcfce7 !important;
  border-color: #22c55e !important;
  color: #15803d !important;
}

.oac-auth-renew-btn.spinning .oac-auth-renew-icon svg {
  animation: oac-auth-spin 0.8s linear infinite;
}

@keyframes oac-auth-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.oac-auth-icon,
.oac-auth-renew-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.oac-auth-icon svg,
.oac-auth-renew-icon svg {
  display: block;
}
`

function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS_STYLES
  doc.head?.appendChild(style)
}

export interface ExpiryCalculation {
  status: 'active' | 'expiring' | 'expired' | 'none' | 'permanent'
  text: string
  tooltip: string
}

export function computeExpiryStatus(expiresAt?: number, now: number = Date.now()): ExpiryCalculation {
  if (!expiresAt) {
    return {
      status: 'permanent',
      text: 'Active',
      tooltip: 'Token is active with no expiry timestamp',
    }
  }

  const remainingMs = expiresAt - now

  if (remainingMs <= 0) {
    const elapsedSec = Math.floor(Math.abs(remainingMs) / 1000)
    let elapsedStr = 'just now'
    if (elapsedSec >= 60 && elapsedSec < 3600) {
      elapsedStr = `${Math.floor(elapsedSec / 60)}m ago`
    } else if (elapsedSec >= 3600) {
      elapsedStr = `${Math.floor(elapsedSec / 3600)}h ago`
    }
    return {
      status: 'expired',
      text: 'Expired',
      tooltip: `Token expired at ${new Date(expiresAt).toLocaleTimeString()} (${elapsedStr})`,
    }
  }

  if (remainingMs < 60000) {
    const sec = Math.max(1, Math.floor(remainingMs / 1000))
    return {
      status: 'expiring',
      text: `${sec}s`,
      tooltip: `Token expires in ${sec} seconds (${new Date(expiresAt).toLocaleTimeString()})`,
    }
  }

  if (remainingMs < 3600000) {
    const min = Math.ceil(remainingMs / 60000)
    return {
      status: min <= 5 ? 'expiring' : 'active',
      text: `${min}m`,
      tooltip: `Token expires in ${min} minutes (${new Date(expiresAt).toLocaleTimeString()})`,
    }
  }

  const hours = Math.floor(remainingMs / 3600000)
  const mins = Math.floor((remainingMs % 3600000) / 60000)
  const str = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  return {
    status: 'active',
    text: str,
    tooltip: `Token expires at ${new Date(expiresAt).toLocaleTimeString()} (in ${str})`,
  }
}

export function resolveAccountIdentity(
  record: AuthRecord | null,
  vaultAccountName?: string | null,
): { name: string; role?: string } {
  if (!record || !record.token) {
    return { name: 'Not Authorized' }
  }

  // 1. Check vault account name
  if (vaultAccountName && vaultAccountName.trim()) {
    const jwtDisplay = extractUserDisplayFromJwt(record.token)
    return {
      name: vaultAccountName.trim(),
      role: jwtDisplay?.role,
    }
  }

  // 2. Check JWT claims
  const jwtDisplay = extractUserDisplayFromJwt(record.token)
  if (jwtDisplay?.name) {
    return {
      name: jwtDisplay.name,
      role: jwtDisplay.role,
    }
  }
  if (jwtDisplay?.role) {
    return {
      name: jwtDisplay.role,
    }
  }

  // 3. Fallback to scheme name or Authorized
  if (record.schemeName) {
    return { name: record.schemeName }
  }

  return { name: 'Authorized' }
}

export function mountSwaggerAuthBadge(
  doc: Document = document,
  options: SwaggerAuthBadgeOptions = {},
): SwaggerAuthBadgeHandle {
  ensureStyles(doc)

  let currentRecord: AuthRecord | null = null
  let currentAccountName: string | null = null

  // Fetch initial auth state if getter provided
  if (options.getAuthRecord) {
    options.getAuthRecord().then((rec) => {
      currentRecord = rec
      if (options.getAccountName) {
        options.getAccountName().then((name) => {
          currentAccountName = name
          updateBadgeElements()
        })
      } else {
        updateBadgeElements()
      }
    })
  }

  function renderBadgeHtml(record: AuthRecord | null, accountName: string | null): string {
    const identity = resolveAccountIdentity(record, accountName)
    const expiry = record ? computeExpiryStatus(record.expiresAt) : { status: 'none', text: 'No Token', tooltip: '' }

    const isAuthorized = Boolean(record && record.token)
    const icon = isAuthorized ? SVG_ICONS.user : SVG_ICONS.key

    const roleHtml = identity.role ? `<span class="oac-auth-role-tag">${identity.role}</span>` : ''

    const expiryHtml = isAuthorized
      ? `
      <span class="oac-auth-divider">·</span>
      <div class="oac-auth-expiry" title="${expiry.tooltip}">
        <span class="oac-auth-icon">${SVG_ICONS.clock}</span>
        <span class="oac-auth-countdown">${expiry.text}</span>
      </div>
      <button type="button" class="oac-auth-renew-btn" title="1-Click Token Renewal" aria-label="Renew token">
        <span class="oac-auth-renew-icon">${SVG_ICONS.refresh}</span>
      </button>
    `
      : ''

    return `
      <div class="oac-auth-identity" title="${identity.name}">
        <span class="oac-auth-icon">${icon}</span>
        <span class="oac-auth-name">${identity.name}</span>
        ${roleHtml}
      </div>
      ${expiryHtml}
    `
  }

  function handleRenewClick(badge: HTMLElement): void {
    const renewBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-renew-btn')
    if (!renewBtn || renewBtn.classList.contains('spinning')) return

    renewBtn.classList.add('spinning')
    renewBtn.title = 'Renewing token...'

    const resetBtn = (success: boolean) => {
      renewBtn.classList.remove('spinning')
      const icon = renewBtn.querySelector<HTMLElement>('.oac-auth-renew-icon')
      if (success) {
        renewBtn.classList.add('success')
        renewBtn.title = 'Token renewed successfully'
        if (icon) icon.innerHTML = SVG_ICONS.check
        setTimeout(() => {
          renewBtn.classList.remove('success')
          if (icon) icon.innerHTML = SVG_ICONS.refresh
          renewBtn.title = '1-Click Token Renewal'
        }, 1500)
      } else {
        if (icon) icon.innerHTML = SVG_ICONS.refresh
        renewBtn.title = 'Could not auto-renew: Configure a login template in the Auth tab'
      }
    }

    if (options.onRenew) {
      options
        .onRenew()
        .then((ok) => {
          resetBtn(ok)
          if (ok && options.getAuthRecord) {
            options.getAuthRecord().then((rec) => {
              currentRecord = rec
              updateBadgeElements()
            })
          }
        })
        .catch(() => resetBtn(false))
    } else {
      setTimeout(() => resetBtn(false), 500)
    }
  }

  function updateBadgeElements(): void {
    const badges = Array.from(doc.querySelectorAll<HTMLElement>('.oac-auth-status-badge'))
    for (const badge of badges) {
      if (!currentRecord || !currentRecord.token) {
        badge.style.display = 'none'
        continue
      }
      badge.style.display = 'inline-flex'
      badge.innerHTML = renderBadgeHtml(currentRecord, currentAccountName)

      badge.classList.remove('expiring', 'expired')
      const expiry = computeExpiryStatus(currentRecord.expiresAt)
      if (expiry.status === 'expiring') badge.classList.add('expiring')
      else if (expiry.status === 'expired') badge.classList.add('expired')

      const renewBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-renew-btn')
      if (renewBtn) {
        renewBtn.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          handleRenewClick(badge)
        })
      }
    }
  }

  function attachToAuthWrapper(wrapper: Element): void {
    if (wrapper.hasAttribute(ATTACHED_ATTR)) return
    wrapper.setAttribute(ATTACHED_ATTR, 'true')

    if (wrapper instanceof HTMLElement) {
      wrapper.style.display = 'flex'
      wrapper.style.flexDirection = 'column'
      wrapper.style.alignItems = 'flex-end'
      wrapper.style.gap = '4px'
    }

    const badge = doc.createElement('div')
    badge.className = 'oac-auth-status-badge'
    badge.innerHTML = renderBadgeHtml(currentRecord, currentAccountName)

    if (!currentRecord || !currentRecord.token) {
      badge.style.display = 'none'
    } else {
      const expiry = computeExpiryStatus(currentRecord.expiresAt)
      if (expiry.status === 'expiring') badge.classList.add('expiring')
      else if (expiry.status === 'expired') badge.classList.add('expired')
    }

    const renewBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-renew-btn')
    if (renewBtn) {
      renewBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        handleRenewClick(badge)
      })
    }

    wrapper.appendChild(badge)
  }

  // Scan and mount to all existing .auth-wrapper instances
  function scanAndMount(root: ParentNode = doc): number {
    const wrappers = Array.from(root.querySelectorAll('.auth-wrapper, .scheme-container .auth-wrapper'))
    let mounted = 0
    for (const wrapper of wrappers) {
      if (!wrapper.hasAttribute(ATTACHED_ATTR)) {
        attachToAuthWrapper(wrapper)
        mounted++
      }
    }
    return mounted
  }

  scanAndMount(doc)

  // Live countdown timer (ticks every 10s)
  const timer = setInterval(() => {
    if (currentRecord && currentRecord.expiresAt) {
      updateBadgeElements()
    }
  }, 10_000)

  return {
    update(record: AuthRecord | null, accountName?: string | null): void {
      currentRecord = record
      if (accountName !== undefined) currentAccountName = accountName
      updateBadgeElements()
    },
    scanAndMount,
    dispose(): void {
      clearInterval(timer)
      const badges = Array.from(doc.querySelectorAll('.oac-auth-status-badge'))
      for (const b of badges) b.remove()
      const wrappers = Array.from(doc.querySelectorAll(`[${ATTACHED_ATTR}]`))
      for (const w of wrappers) w.removeAttribute(ATTACHED_ATTR)
    },
  }
}
