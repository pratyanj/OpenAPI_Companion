/**
 * Swagger UI Active Account & Token Expiry Status Badge + Multi-Account Switcher:
 * - Dual-location integration:
 *   1. Swagger Header: Injected directly below Swagger's native Authorize button in .auth-wrapper
 *   2. Every Operation: Injected directly into .execute-wrapper next to Execute/Clear/Last Payload
 * - Compact, sleek design matching Swagger UI's button proportions
 * - Interactive 1-Click Multi-Account & Role Switcher dropdown
 * - Real-time token expiry countdown timer (e.g. "14m", "45s", "Expired")
 * - Smart account name & role detection from vault & JWT claims
 * - 1-Click token renewal icon button with animated feedback
 * - 100% SVG vector icons (zero emojis)
 * - Clean status feedback (never displays raw error text in button label)
 */
import type { AuthRecord, SavedCredential } from '@/modules/authentication/types'
import { extractUserDisplayFromJwt } from '@/utils/jwt'

export interface SwaggerAuthBadgeOptions {
  onRenew?: () => Promise<boolean>
  getAuthRecord?: () => Promise<AuthRecord | null>
  getAccountName?: () => Promise<string | null>
  getSavedCredentials?: () => Promise<SavedCredential[]>
  onSelectAccount?: (credentialId: string) => Promise<boolean>
  onManageAccounts?: () => void
}

export interface SwaggerAuthBadgeHandle {
  update(
    record: AuthRecord | null,
    accountName?: string | null,
    savedCredentials?: SavedCredential[],
  ): void
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
  chevronDown: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  users: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  externalLink: `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
}

const STYLE_ID = 'oac-auth-badge-styles'
const ATTACHED_ATTR = 'data-oac-auth-attached'
const ATTACHED_EXEC_ATTR = 'data-oac-exec-auth-attached'

const CSS_STYLES = `
.swagger-ui .auth-wrapper {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
  gap: 4px !important;
  position: relative !important;
}

.oac-auth-status-badge {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  margin: 0 !important;
  padding: 3px 8px !important;
  background: #ffffff !important;
  border: 1px solid #d1d5db !important;
  border-radius: 4px !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  font-size: 11px !important;
  font-weight: 500 !important;
  color: #374151 !important;
  user-select: none !important;
  line-height: 1.4 !important;
  transition: all 0.15s ease !important;
  z-index: 10 !important;
  max-width: 260px !important;
  position: relative !important;
}

.oac-auth-status-badge:hover {
  border-color: #9ca3af !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
}

.oac-auth-status-badge.expiring {
  border-color: #f59e0b !important;
  background: #fffbeb !important;
  color: #b45309 !important;
}

.oac-auth-status-badge.expired {
  border-color: #f87171 !important;
  background: #fef2f2 !important;
  color: #b91c1c !important;
}

.oac-auth-identity-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  background: transparent !important;
  border: none !important;
  padding: 1px 4px !important;
  margin: -1px -4px !important;
  border-radius: 3px !important;
  color: inherit !important;
  font-family: inherit !important;
  font-size: inherit !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  outline: none !important;
  max-width: 150px !important;
  transition: background 0.12s ease !important;
}

.oac-auth-identity-btn:hover {
  background: rgba(0, 0, 0, 0.06) !important;
}

.oac-auth-name {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

.oac-auth-chevron {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: #6b7280 !important;
  transition: transform 0.15s ease !important;
  flex-shrink: 0 !important;
}

.oac-auth-identity-btn.open .oac-auth-chevron,
.oac-op-account-switcher.open .oac-auth-chevron {
  transform: rotate(180deg) !important;
}

.oac-auth-role-tag {
  display: inline-block !important;
  padding: 0 4px !important;
  font-size: 8px !important;
  font-weight: 700 !important;
  text-transform: uppercase !important;
  letter-spacing: 0.03em !important;
  background: #eff6ff !important;
  border: 1px solid #bfdbfe !important;
  color: #1d4ed8 !important;
  border-radius: 3px !important;
  line-height: 14px !important;
  flex-shrink: 0 !important;
}

.oac-auth-divider {
  color: #cbd5e1 !important;
  font-size: 10px !important;
}

.oac-auth-expiry {
  display: inline-flex !important;
  align-items: center !important;
  gap: 3px !important;
  white-space: nowrap !important;
}

.oac-auth-renew-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 20px !important;
  height: 20px !important;
  padding: 0 !important;
  background: #f3f4f6 !important;
  border: 1px solid #d1d5db !important;
  border-radius: 3px !important;
  color: #4b5563 !important;
  cursor: pointer !important;
  outline: none !important;
  transition: all 0.15s ease !important;
  flex-shrink: 0 !important;
}

.oac-auth-renew-btn:hover {
  background: #eff6ff !important;
  border-color: #3b82f6 !important;
  color: #1d4ed8 !important;
  box-shadow: 0 1px 2px rgba(59, 130, 246, 0.15) !important;
}

.oac-auth-renew-btn:active {
  background: #dbeafe !important;
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
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  color: currentColor !important;
}

.oac-auth-icon svg,
.oac-auth-renew-icon svg {
  display: block !important;
}

/* Operation-level Execute Bar Switcher Layout */
.swagger-ui .execute-wrapper,
.swagger-ui .opblock-body > .btn-group {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: stretch !important;
  gap: 8px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 20px !important;
}

.swagger-ui .execute-wrapper .btn,
.swagger-ui .opblock-body > .btn-group .btn {
  border-radius: 4px !important;
}

.swagger-ui .execute-wrapper .btn.execute,
.swagger-ui .opblock-body > .btn-group .btn.execute {
  flex: 1 1 auto !important;
  width: auto !important;
  min-width: 140px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.swagger-ui .execute-wrapper .btn.btn-clear,
.swagger-ui .opblock-body > .btn-group .btn.btn-clear {
  flex: 0 0 auto !important;
  width: auto !important;
  min-width: 100px !important;
  margin: 0 !important;
  align-self: stretch !important;
  box-sizing: border-box !important;
}

.swagger-ui .execute-wrapper .oac-op-account-container,
.swagger-ui .opblock-body > .btn-group .oac-op-account-container,
.swagger-ui .execute-wrapper .oac-execute-account-switcher,
.swagger-ui .opblock-body > .btn-group .oac-execute-account-switcher {
  display: inline-flex !important;
  flex: 0 0 auto !important;
  margin: 0 !important;
  position: relative !important;
  align-self: stretch !important;
  box-sizing: border-box !important;
}

.swagger-ui .execute-wrapper .oac-execute-account-btn,
.swagger-ui .opblock-body > .btn-group .oac-execute-account-btn,
.swagger-ui .execute-wrapper .oac-op-account-switcher,
.swagger-ui .opblock-body > .btn-group .oac-op-account-switcher {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  height: 100% !important;
  min-height: 38px !important;
  min-width: 140px !important;
  padding: 8px 18px !important;
  margin: 0 !important;
  background: #ffffff !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 4px !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  font-family: inherit !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #334155 !important;
  cursor: pointer !important;
  outline: none !important;
  line-height: 1.4 !important;
  transition: all 0.15s ease !important;
  box-sizing: border-box !important;
  white-space: nowrap !important;
  text-decoration: none !important;
}

.swagger-ui .execute-wrapper .oac-execute-account-btn:hover,
.swagger-ui .opblock-body > .btn-group .oac-execute-account-btn:hover,
.swagger-ui .execute-wrapper .oac-op-account-switcher:hover,
.swagger-ui .opblock-body > .btn-group .oac-op-account-switcher:hover {
  background: #f8fafc !important;
  border-color: #94a3af !important;
  color: #0f172a !important;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
}

.swagger-ui .execute-wrapper .oac-execute-account-btn.open,
.swagger-ui .opblock-body > .btn-group .oac-execute-account-btn.open,
.swagger-ui .execute-wrapper .oac-op-account-switcher.open,
.swagger-ui .opblock-body > .btn-group .oac-op-account-switcher.open {
  border-color: #3b82f6 !important;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25) !important;
}

.oac-op-account-container .oac-account-dropdown {
  position: absolute !important;
  top: calc(100% + 5px) !important;
  right: 0 !important;
  z-index: 99999 !important;
}

.oac-account-dropdown.oac-drop-up,
.oac-op-account-container .oac-account-dropdown.oac-drop-up {
  top: auto !important;
  bottom: calc(100% + 5px) !important;
}

/* Multi-Account Switcher Dropdown */
.oac-account-dropdown {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  min-width: 240px;
  max-width: 320px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 8px 10px -6px rgba(0, 0, 0, 0.08);
  z-index: 99999;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  animation: oac-drop-in 0.12s cubic-bezier(0.16, 1, 0.3, 1);
  text-align: left;
}

@keyframes oac-drop-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.oac-account-dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 6px;
  border-bottom: 1px solid #f3f4f6;
  background: #f9fafb;
}

.oac-account-dropdown-title {
  font-size: 9px;
  font-weight: 700;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.oac-account-count-pill {
  font-size: 9px;
  font-weight: 600;
  color: #374151;
  background: #e5e7eb;
  padding: 1px 5px;
  border-radius: 10px;
}

.oac-account-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.oac-account-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.12s ease;
  color: #374151;
  text-decoration: none;
}

.oac-account-item:hover {
  background: #f3f4f6;
}

.oac-account-item.active {
  background: #f0fdf4;
  color: #166534;
}

.oac-account-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #16a34a;
}

.oac-account-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #d1d5db;
}

.oac-account-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.oac-account-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.oac-account-item-name {
  font-size: 11px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oac-account-user-sub {
  font-size: 10px;
  color: #6b7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.oac-account-status-pill {
  font-size: 9px;
  font-weight: 500;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.oac-account-status-pill.active {
  background: #dcfce7;
  color: #15803d;
}

.oac-account-status-pill.expiring {
  background: #fef3c7;
  color: #b45309;
}

.oac-account-status-pill.expired {
  background: #fee2e2;
  color: #b91c1c;
}

.oac-account-empty {
  padding: 12px 10px;
  text-align: center;
  font-size: 11px;
  color: #6b7280;
}

.oac-account-empty-sub {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 2px;
}

.oac-account-dropdown-footer {
  padding: 6px 8px;
  border-top: 1px solid #f3f4f6;
  background: #f9fafb;
}

.oac-account-manage-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 6px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: #4b5563;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
}

.oac-account-manage-btn:hover {
  background: #e5e7eb;
  color: #111827;
}

/* Feature Toggle Disabling */
body.oac-disable-account-switcher .oac-auth-chevron,
body.oac-disable-account-switcher .oac-account-dropdown,
body.oac-disable-account-switcher .oac-op-account-container,
body.oac-disable-account-switcher .oac-op-account-switcher,
body.oac-disable-account-switcher .oac-execute-account-switcher,
body.oac-disable-account-switcher .oac-execute-account-btn,
body.oac-disable-account-switcher .swagger-ui .execute-wrapper .oac-execute-account-switcher,
body.oac-disable-account-switcher .swagger-ui .opblock-body > .btn-group .oac-execute-account-switcher,
body.oac-disable-account-switcher .swagger-ui .execute-wrapper .oac-op-account-container,
body.oac-disable-account-switcher .swagger-ui .opblock-body > .btn-group .oac-op-account-container,
body.oac-disable-account-switcher .swagger-ui .execute-wrapper .oac-execute-account-btn,
body.oac-disable-account-switcher .swagger-ui .opblock-body > .btn-group .oac-execute-account-btn,
body.oac-disable-account-switcher .swagger-ui .execute-wrapper .oac-op-account-switcher,
body.oac-disable-account-switcher .swagger-ui .opblock-body > .btn-group .oac-op-account-switcher {
  display: none !important;
}

body.oac-disable-account-switcher .oac-auth-identity-btn {
  cursor: default !important;
  pointer-events: none !important;
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
  savedCredentials: SavedCredential[] = [],
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

  // 2. Check if token matches any saved credential in vault
  const cleanActive = record.token.replace(/^bearer\s+/i, '').trim()
  const matched = savedCredentials.find(
    (c) => c.token.replace(/^bearer\s+/i, '').trim() === cleanActive,
  )
  if (matched && matched.name) {
    const jwtDisplay = extractUserDisplayFromJwt(record.token)
    return {
      name: matched.name,
      role: jwtDisplay?.role,
    }
  }

  // 3. Check JWT claims
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

  // 4. Fallback to scheme name or Authorized
  if (record.schemeName && !/^bearer(auth)?$/i.test(record.schemeName)) {
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
  let currentSavedCredentials: SavedCredential[] = []
  let isDropdownOpen = false

  const refreshInitialData = async () => {
    if (options.getAuthRecord) {
      currentRecord = await options.getAuthRecord()
    }
    if (options.getAccountName) {
      currentAccountName = await options.getAccountName()
    }
    if (options.getSavedCredentials) {
      currentSavedCredentials = await options.getSavedCredentials()
    }
    updateBadgeElements()
  }
  void refreshInitialData()

  function closeAllDropdowns(): void {
    isDropdownOpen = false
    const dropdowns = Array.from(doc.querySelectorAll('.oac-account-dropdown'))
    for (const d of dropdowns) d.remove()
    const btns = Array.from(doc.querySelectorAll('.oac-auth-identity-btn, .oac-op-account-switcher'))
    for (const b of btns) b.classList.remove('open')
  }

  function handleAccountSelect(credentialId: string): void {
    if (options.onSelectAccount) {
      options.onSelectAccount(credentialId).then((success) => {
        if (success) {
          void refreshInitialData()
        }
      })
    }
    closeAllDropdowns()
  }

  function renderAccountDropdown(anchor: HTMLElement, triggerBtn?: HTMLElement | null): void {
    const existing = anchor.querySelector('.oac-account-dropdown')
    if (existing) {
      existing.remove()
      triggerBtn?.classList.remove('open')
      isDropdownOpen = false
      return
    }

    closeAllDropdowns()
    isDropdownOpen = true

    triggerBtn?.classList.add('open')

    const dropdown = doc.createElement('div')
    dropdown.className = 'oac-account-dropdown'

    const rect = triggerBtn?.getBoundingClientRect() ?? anchor.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const openUpwards = spaceBelow < 280 && rect.top > 280
    if (openUpwards) {
      dropdown.classList.add('oac-drop-up')
      dropdown.style.top = 'auto'
      dropdown.style.bottom = 'calc(100% + 5px)'
    } else {
      dropdown.classList.remove('oac-drop-up')
      dropdown.style.top = 'calc(100% + 5px)'
      dropdown.style.bottom = 'auto'
    }

    // Horizontal placement: align to left edge if near left side of viewport
    if (rect.left < 260) {
      dropdown.style.left = '0'
      dropdown.style.right = 'auto'
    } else {
      dropdown.style.right = '0'
      dropdown.style.left = 'auto'
    }

    const header = doc.createElement('div')
    header.className = 'oac-account-dropdown-header'
    header.innerHTML = `
      <span class="oac-account-dropdown-title">Switch Account / Role</span>
      <span class="oac-account-count-pill">${currentSavedCredentials.length} Accounts</span>
    `
    dropdown.appendChild(header)

    const list = doc.createElement('div')
    list.className = 'oac-account-list'

    if (currentSavedCredentials.length === 0) {
      list.innerHTML = `
        <div class="oac-account-empty">
          No saved accounts in vault
          <div class="oac-account-empty-sub">Save accounts in the Auth tab to switch roles with 1 click.</div>
        </div>
      `
    } else {
      for (const cred of currentSavedCredentials) {
        const cleanCredToken = cred.token.replace(/^bearer\s+/i, '').trim()
        const cleanActiveToken = currentRecord?.token?.replace(/^bearer\s+/i, '').trim()
        const isCurrentActive =
          (cleanActiveToken && cleanActiveToken === cleanCredToken) ||
          (currentAccountName && currentAccountName === cred.name)

        const jwtInfo = extractUserDisplayFromJwt(cred.token)
        const role = jwtInfo?.role
        const roleTag = role ? `<span class="oac-auth-role-tag">${role}</span>` : ''

        const username = cred.login?.username || jwtInfo?.name || ''
        const userSub = username ? `<span class="oac-account-user-sub">${username}</span>` : ''

        const expiry = computeExpiryStatus(cred.expiresAt)

        const item = doc.createElement('div')
        item.className = `oac-account-item ${isCurrentActive ? 'active' : ''}`
        item.dataset.credId = cred.id
        item.innerHTML = `
          <div class="oac-account-check">
            ${isCurrentActive ? SVG_ICONS.check : '<span class="oac-account-dot"></span>'}
          </div>
          <div class="oac-account-info">
            <div class="oac-account-name-row">
              <span class="oac-account-item-name">${cred.name}</span>
              ${roleTag}
            </div>
            ${userSub}
          </div>
          <span class="oac-account-status-pill ${expiry.status}">${expiry.text}</span>
        `

        item.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          handleAccountSelect(cred.id)
        })

        list.appendChild(item)
      }
    }
    dropdown.appendChild(list)

    const footer = doc.createElement('div')
    footer.className = 'oac-account-dropdown-footer'
    const manageBtn = doc.createElement('button')
    manageBtn.type = 'button'
    manageBtn.className = 'oac-account-manage-btn'
    manageBtn.innerHTML = `
      <span>Manage Accounts in Auth Tab</span>
      <span class="oac-manage-icon">${SVG_ICONS.externalLink}</span>
    `
    manageBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeAllDropdowns()
      options.onManageAccounts?.()
    })
    footer.appendChild(manageBtn)
    dropdown.appendChild(footer)

    anchor.appendChild(dropdown)
  }

  function renderBadgeHtml(record: AuthRecord | null, accountName: string | null): string {
    const isAuthorized = Boolean(record && record.token)
    let displayName = 'Switch Account'
    let roleHtml = ''
    let icon = SVG_ICONS.key

    if (isAuthorized) {
      const identity = resolveAccountIdentity(record, accountName, currentSavedCredentials)
      displayName = identity.name
      roleHtml = identity.role ? `<span class="oac-auth-role-tag">${identity.role}</span>` : ''
      icon = SVG_ICONS.user
    } else if (currentSavedCredentials.length > 0) {
      displayName = 'Switch Account'
      icon = SVG_ICONS.users
    }

    const expiry = record ? computeExpiryStatus(record.expiresAt) : { status: 'none', text: 'No Token', tooltip: '' }

    const expiryHtml = isAuthorized
      ? `
      <span class="oac-auth-divider">|</span>
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
      <button type="button" class="oac-auth-identity-btn" title="Click to switch account or role" aria-label="Switch account">
        <span class="oac-auth-icon">${icon}</span>
        <span class="oac-auth-name">${displayName}</span>
        ${roleHtml}
        <span class="oac-auth-chevron">${SVG_ICONS.chevronDown}</span>
      </button>
      ${expiryHtml}
    `
  }

  function renderOpSwitcherHtml(record: AuthRecord | null, accountName: string | null): string {
    const isAuthorized = Boolean(record && record.token)
    let displayName = 'Users'
    let roleHtml = ''
    let icon = SVG_ICONS.users

    if (isAuthorized) {
      const identity = resolveAccountIdentity(record, accountName, currentSavedCredentials)
      displayName = (identity.name === 'Authorized' || identity.name === 'BearerAuth') ? 'Users' : identity.name
      roleHtml = identity.role ? `<span class="oac-auth-role-tag">${identity.role}</span>` : ''
      icon = SVG_ICONS.user
    } else if (currentSavedCredentials.length > 0) {
      displayName = 'Users'
      icon = SVG_ICONS.users
    }

    return `
      <span class="oac-auth-icon">${icon}</span>
      <span class="oac-auth-name">${displayName}</span>
      ${roleHtml}
      <span class="oac-auth-chevron">${SVG_ICONS.chevronDown}</span>
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

  function wireBadgeListeners(badge: HTMLElement): void {
    const identityBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-identity-btn')
    if (identityBtn) {
      identityBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        renderAccountDropdown(badge, identityBtn)
      })
    }

    const renewBtn = badge.querySelector<HTMLButtonElement>('.oac-auth-renew-btn')
    if (renewBtn) {
      renewBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        handleRenewClick(badge)
      })
    }
  }

  function updateBadgeElements(): void {
    // 1. Update header status badges
    const badges = Array.from(doc.querySelectorAll<HTMLElement>('.oac-auth-status-badge'))
    const hasAuth = Boolean(currentRecord && currentRecord.token)

    for (const badge of badges) {
      badge.style.display = 'inline-flex'
      badge.innerHTML = renderBadgeHtml(currentRecord, currentAccountName)

      badge.classList.remove('expiring', 'expired')
      if (hasAuth && currentRecord) {
        const expiry = computeExpiryStatus(currentRecord.expiresAt)
        if (expiry.status === 'expiring') badge.classList.add('expiring')
        else if (expiry.status === 'expired') badge.classList.add('expired')
      }

      wireBadgeListeners(badge)
    }

    // 2. Update all operation-level account switcher buttons in .execute-wrapper
    const opBtns = Array.from(doc.querySelectorAll<HTMLElement>('.oac-op-account-switcher, .oac-execute-account-btn'))
    for (const opBtn of opBtns) {
      opBtn.innerHTML = renderOpSwitcherHtml(currentRecord, currentAccountName)
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
      wrapper.style.position = 'relative'
    }

    const badge = doc.createElement('div')
    badge.className = 'oac-auth-status-badge'
    badge.style.display = 'inline-flex'
    badge.innerHTML = renderBadgeHtml(currentRecord, currentAccountName)

    const hasAuth = Boolean(currentRecord && currentRecord.token)
    if (hasAuth && currentRecord) {
      const expiry = computeExpiryStatus(currentRecord.expiresAt)
      if (expiry.status === 'expiring') badge.classList.add('expiring')
      else if (expiry.status === 'expired') badge.classList.add('expired')
    }

    wireBadgeListeners(badge)
    wrapper.appendChild(badge)
  }

  function attachToExecuteWrapper(wrapper: Element): void {
    if (wrapper.hasAttribute(ATTACHED_EXEC_ATTR)) return
    wrapper.setAttribute(ATTACHED_EXEC_ATTR, 'true')

    const container = doc.createElement('div')
    container.className = 'oac-execute-account-switcher oac-op-account-container'

    const btn = doc.createElement('button')
    btn.type = 'button'
    btn.className = 'btn oac-execute-account-btn oac-op-account-switcher'
    btn.setAttribute('aria-label', 'Switch account or role')
    btn.title = 'Switch account or role for this endpoint'
    btn.innerHTML = renderOpSwitcherHtml(currentRecord, currentAccountName)

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      renderAccountDropdown(container, btn)
    })

    container.appendChild(btn)

    // Always append container so it sits at the right end of the execution row:
    // [ Execute ] [ Users ▾ ] or [ Execute ] [ Clear ] [ Users ▾ ]
    wrapper.appendChild(container)
  }

  // Scan and mount to all existing .auth-wrapper and .execute-wrapper instances
  function scanAndMount(root: ParentNode = doc): number {
    let mounted = 0

    // 1. Header .auth-wrapper instances
    const wrappers = Array.from(root.querySelectorAll('.auth-wrapper, .scheme-container .auth-wrapper, .swagger-ui .auth-wrapper'))
    for (const wrapper of wrappers) {
      if (!wrapper.hasAttribute(ATTACHED_ATTR)) {
        attachToAuthWrapper(wrapper)
        mounted++
      }
    }

    // Fallback: if no .auth-wrapper exists on page, mount into .scheme-container or .information-container
    if (mounted === 0 && !doc.querySelector(`[${ATTACHED_ATTR}]`)) {
      const headerContainer = root.querySelector('.swagger-ui .scheme-container .schemes, .swagger-ui .scheme-container, .swagger-ui .information-container')
      if (headerContainer && !headerContainer.hasAttribute(ATTACHED_ATTR)) {
        attachToAuthWrapper(headerContainer)
        mounted++
      }
    }

    // 2. Scan all execution bars across open operations (both before and after execute)
    const execWrappers = Array.from(
      root.querySelectorAll('.execute-wrapper, .opblock-body > .btn-group')
    )
    for (const execWrapper of execWrappers) {
      if (!execWrapper.hasAttribute(ATTACHED_EXEC_ATTR)) {
        attachToExecuteWrapper(execWrapper)
        mounted++
      } else {
        // Ensure container remains at the right end even after Swagger UI mounts Clear button
        const existingContainer = execWrapper.querySelector('.oac-op-account-container')
        if (existingContainer && execWrapper.lastElementChild !== existingContainer) {
          execWrapper.appendChild(existingContainer)
        }
      }
    }

    return mounted
  }

  // Global document click listener to close dropdowns when clicking outside
  const onDocClick = (e: MouseEvent) => {
    if (isDropdownOpen) {
      const target = e.target
      const isInside = target instanceof Element && Boolean(
        target.closest('.oac-auth-status-badge') ||
        target.closest('.oac-op-account-container') ||
        target.closest('.oac-execute-account-switcher') ||
        target.closest('.oac-account-dropdown')
      )
      if (!isInside) {
        closeAllDropdowns()
      }
    }
  }

  const onDocKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isDropdownOpen) {
      closeAllDropdowns()
    }
  }

  doc.addEventListener('click', onDocClick)
  doc.addEventListener('keydown', onDocKeyDown)

  scanAndMount(doc)

  // Live countdown timer (ticks every 10s)
  const timer = setInterval(() => {
    if (currentRecord && currentRecord.expiresAt && !isDropdownOpen) {
      updateBadgeElements()
    }
  }, 10_000)

  return {
    update(
      record: AuthRecord | null,
      accountName?: string | null,
      savedCredentials?: SavedCredential[],
    ): void {
      currentRecord = record
      if (accountName !== undefined) currentAccountName = accountName
      if (savedCredentials !== undefined) currentSavedCredentials = savedCredentials
      updateBadgeElements()
    },
    scanAndMount,
    dispose(): void {
      clearInterval(timer)
      doc.removeEventListener('click', onDocClick)
      doc.removeEventListener('keydown', onDocKeyDown)
      const badges = Array.from(doc.querySelectorAll('.oac-auth-status-badge'))
      for (const b of badges) b.remove()
      const opContainers = Array.from(doc.querySelectorAll('.oac-op-account-container'))
      for (const c of opContainers) c.remove()
      const wrappers = Array.from(doc.querySelectorAll(`[${ATTACHED_ATTR}], [${ATTACHED_EXEC_ATTR}]`))
      for (const w of wrappers) {
        w.removeAttribute(ATTACHED_ATTR)
        w.removeAttribute(ATTACHED_EXEC_ATTR)
      }
    },
  }
}
