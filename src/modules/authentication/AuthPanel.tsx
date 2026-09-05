import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Result } from '@/types'
import type { EndpointInfo } from '@/adapters'
import type { EventBus } from '@/core/events'
import { useEventBus } from '@/hooks'
import { cn } from '@/utils'
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  IconButton,
  Input,
  Spinner,
  AuthIcon,
  DeleteIcon,
  RevealIcon,
  HideIcon,
} from '@/components'
import type { RefreshLogEntry } from '@/services'
import type { AuthRecord, SavedCredential, SavedLogin } from './types'
import { authStatusOf } from './status'

/** Just the surface AuthPanel needs from AuthenticationService (eases testing). */
export interface AuthPanelService {
  current(environmentId: string): Promise<Result<AuthRecord | null>>
  clear(environmentId: string): Promise<Result<void>>
  isAutoRefreshEnabled(): Promise<boolean>
  setAutoRefreshEnabled(enabled: boolean): Promise<Result<void>>
  /** Whether applied tokens carry the `Bearer ` prefix (per project). */
  isBearerPrefixEnabled(environmentId: string): Promise<boolean>
  setBearerPrefixEnabled(environmentId: string, enabled: boolean): Promise<Result<void>>
  /**
   * Identifies the login request used for auto-refresh, if one exists.
   * Matches templates by convention (name/path includes login/signin/auth/token).
   */
  loginTemplate(environmentId: string): Promise<string | null>
  /**
   * Discovered auth endpoint from the spec (e.g. `POST /api/auth/login`).
   * Used for the inline "Add account" form so the user doesn't have to save
   * a request manually when the spec already declares a login path.
   */
  loginEndpoint(): Promise<string | null>
  /** Optional custom configured login endpoint override */
  configuredLoginEndpoint?(): Promise<string | null>
  setConfiguredLoginEndpoint?(endpointId: string | null): Promise<Result<void>>
  listEndpoints?(): EndpointInfo[]
  /** Creates a new saved credential by executing the login endpoint directly. */
  addByLogin(name: string, username: string, password: string): Promise<Result<SavedCredential>>
  listSaved(): Promise<Result<SavedCredential[]>>
  saveAs(name: string, environmentId: string): Promise<Result<SavedCredential>>
  activateSaved(id: string, environmentId: string): Promise<Result<void>>
  deleteSaved(id: string): Promise<Result<void>>
  /** Set or clear the login credentials attached to a saved token. */
  setLogin(id: string, login: SavedLogin | null): Promise<Result<void>>
  /** Re-authenticate now using whatever saved login is attached to the active token. */
  refreshNow(environmentId: string): Promise<Result<void>>
  /** Most recent refresher decisions, for diagnostics in the panel. */
  refreshActivity(): Promise<RefreshLogEntry[]>
}

interface AuthPanelProps {
  service: AuthPanelService
  bus: EventBus
  environmentId: string
  /** Jump to another tab — lets the setup steps link straight to Requests. */
  onNavigate?: (tabId: string) => void
}

const EMPTY_LOGIN: SavedLogin = { username: '', password: '' }

/** Password input with a reveal toggle, so a typo is catchable before submit. */
function PasswordField({
  value,
  onChange,
  label,
  onEnter,
  error,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  onEnter?: () => void
  error?: string | boolean | null
}) {
  const [shown, setShown] = useState(false)
  const hasError = Boolean(error)
  return (
    <div className="flex flex-col gap-1 w-full">
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border bg-bg pr-1 transition-colors',
          hasError
            ? 'border-danger focus-within:ring-1 focus-within:ring-danger'
            : 'border-border focus-within:ring-1 focus-within:ring-primary',
        )}
      >
        <input
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter?.()
          }}
          placeholder="Password"
          aria-label={label}
          className="min-w-0 flex-1 bg-transparent px-2.5 py-1.5 text-xs text-text focus:outline-none"
        />
        <IconButton
          label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown((v) => !v)}
        >
          {shown ? <HideIcon /> : <RevealIcon />}
        </IconButton>
      </div>
      {typeof error === 'string' && error && (
        <span className="text-[11px] text-danger dark:text-red-300 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded flex items-center gap-1 font-medium">
          <span className="shrink-0">⚠️</span>
          <span>{error}</span>
        </span>
      )}
    </div>
  )
}

const OUTCOME_CLASS: Record<RefreshLogEntry['outcome'], string> = {
  triggered: 'text-text',
  skipped: 'text-muted',
  success: 'text-success',
  failed: 'text-danger',
}

function clockTime(at: number): string {
  try {
    return new Date(at).toLocaleTimeString()
  } catch {
    return ''
  }
}

function mask(token: string): string {
  const tail = token.slice(-4)
  return `${'•'.repeat(Math.min(12, Math.max(4, token.length - 4)))}${tail}`
}

export function AuthPanel({ service, bus, environmentId, onNavigate }: AuthPanelProps) {
  const [record, setRecord] = useState<AuthRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [bearerPrefix, setBearerPrefix] = useState(true)
  const [saved, setSaved] = useState<SavedCredential[]>([])
  const [loginTemplate, setLoginTemplate] = useState<string | null>(null)
  const [loginEndpoint, setLoginEndpoint] = useState<string | null>(null)
  const [configuredLoginEp, setConfiguredLoginEp] = useState<string | null>(null)
  const [showEndpointPicker, setShowEndpointPicker] = useState(false)
  const [activity, setActivity] = useState<RefreshLogEntry[]>([])
  const [testing, setTesting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newAccount, setNewAccount] = useState({ name: '', username: '', password: '' })
  const [newAccountTouched, setNewAccountTouched] = useState({
    name: false,
    username: false,
    password: false,
  })
  /** Which vault entry has its login form open. */
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<SavedLogin>(EMPTY_LOGIN)
  const [editingTouched, setEditingTouched] = useState({ username: false, password: false })
  const [newName, setNewName] = useState('')
  const [saveCurrentTouched, setSaveCurrentTouched] = useState(false)

  const activeCred = useMemo(() => {
    if (!record?.token) return null
    const currentClean = record.token.replace(/^bearer\s+/i, '').trim()
    return (
      saved.find((cred) => cred.token.replace(/^bearer\s+/i, '').trim() === currentClean) ?? null
    )
  }, [record, saved])

  const credWithLogin = useMemo(() => {
    if (activeCred?.login?.username?.trim() && activeCred?.login?.password) {
      return activeCred
    }
    return (
      saved.find((cred) => Boolean(cred.login?.username?.trim() && cred.login?.password)) ?? null
    )
  }, [activeCred, saved])

  const hasLoginCredentials = Boolean(
    credWithLogin?.login?.username?.trim() && credWithLogin?.login?.password,
  )

  const isCurrentTokenSaved = useMemo(() => {
    if (!record?.token) return false
    const currentClean = record.token.replace(/^bearer\s+/i, '').trim()
    return saved.some((cred) => cred.token.replace(/^bearer\s+/i, '').trim() === currentClean)
  }, [record, saved])

  const load = useCallback(async () => {
    const [result, vault] = await Promise.all([service.current(environmentId), service.listSaved()])
    setRecord(result.ok ? result.value : null)
    if (vault.ok) setSaved(vault.value)
    setLoading(false)
  }, [service, environmentId])

  const report = (result: Result<unknown>) => {
    if (!result.ok) bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    return result.ok
  }

  const saveCurrent = async () => {
    setSaveCurrentTouched(true)
    const name = newName.trim()
    if (!name) return
    if (report(await service.saveAs(name, environmentId))) {
      setNewName('')
      setSaveCurrentTouched(false)
    }
    await load()
  }

  const activate = async (id: string) => {
    report(await service.activateSaved(id, environmentId))
    await load()
  }

  const addAccount = async () => {
    setNewAccountTouched({ name: true, username: true, password: true })
    const { name, username, password } = newAccount
    if (!name.trim() || !username.trim() || !password) return
    setBusy(true)
    const result = await service.addByLogin(name.trim(), username.trim(), password)
    setBusy(false)
    if (report(result)) {
      setNewAccount({ name: '', username: '', password: '' })
      setNewAccountTouched({ name: false, username: false, password: false })
      setAdding(false)
    }
    setActivity(await service.refreshActivity())
    await load()
  }

  const testRefresh = async () => {
    setTesting(true)
    const result = await service.refreshNow(environmentId)
    if (!result.ok) report(result)
    setActivity(await service.refreshActivity())
    setTesting(false)
    await load()
  }

  const openLoginForm = (cred: SavedCredential) => {
    setEditing(cred.id)
    setForm({ ...EMPTY_LOGIN, ...cred.login })
    setEditingTouched({ username: false, password: false })
  }

  const saveLogin = async (id: string) => {
    setEditingTouched({ username: true, password: true })
    // Both required — half a login can't sign anything in.
    const complete = form.username.trim() !== '' && form.password !== ''
    if (!complete) return
    report(await service.setLogin(id, form))
    setEditing(null)
    setEditingTouched({ username: false, password: false })
    await load()
  }

  const removeSaved = async (id: string) => {
    report(await service.deleteSaved(id))
    await load()
  }

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  useEffect(() => {
    void service.isAutoRefreshEnabled().then(setAutoRefresh)
    void service.isBearerPrefixEnabled(environmentId).then(setBearerPrefix)
    void service.loginTemplate(environmentId).then(setLoginTemplate)
    void service.loginEndpoint().then(setLoginEndpoint)
    if (service.configuredLoginEndpoint) {
      void service.configuredLoginEndpoint().then(setConfiguredLoginEp)
    }
    void service.refreshActivity().then(setActivity)
  }, [service, environmentId])

  useEventBus(bus, 'SETTINGS_UPDATED', (payload) => {
    if (payload.keys?.includes('auth-login-endpoint')) {
      void service.loginEndpoint().then(setLoginEndpoint)
      if (service.configuredLoginEndpoint) {
        void service.configuredLoginEndpoint().then(setConfiguredLoginEp)
      }
    }
  })

  useEventBus(bus, 'AUTH_UPDATED', () => void load())
  useEventBus(bus, 'AUTH_RESTORED', () => void load())
  useEventBus(bus, 'AUTH_CLEARED', () => void load())
  useEventBus(bus, 'AUTH_EXPIRED', () => void load())

  const toggleBearerPrefix = async (enabled: boolean) => {
    setBearerPrefix(enabled) // optimistic
    const result = await service.setBearerPrefixEnabled(environmentId, enabled)
    if (!result.ok) {
      setBearerPrefix(!enabled)
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    }
    await load() // the active token was re-applied in the new format
  }

  const toggleAutoRefresh = async (enabled: boolean) => {
    setAutoRefresh(enabled) // optimistic
    const result = await service.setAutoRefreshEnabled(enabled)
    if (!result.ok) {
      setAutoRefresh(!enabled)
      bus.publish('NOTIFY', { kind: 'error', message: result.error.message })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center p-6">
        <Spinner />
      </div>
    )
  }

  const status = authStatusOf(record)

  return (
    <div className="flex flex-col gap-3 p-4">
      {record ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text">Authentication</span>
            {status === 'expired' ? (
              <Badge kind="warning">Expired</Badge>
            ) : (
              <Badge kind="success">Authorized</Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <Badge kind="info">{record.type}</Badge>
            {record.schemeName ? <span className="font-mono">{record.schemeName}</span> : null}
          </div>

          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1">
            <code
              className="flex-1 truncate font-mono text-[11px] text-text"
              aria-label="Stored credential"
            >
              {revealed ? record.token : mask(record.token)}
            </code>
            <IconButton
              label={revealed ? 'Hide credential' : 'Show credential'}
              onClick={() => setRevealed((v) => !v)}
            >
              {revealed ? <HideIcon /> : <RevealIcon />}
            </IconButton>
            {/* Copies the real token, not the masked display value. */}
            <CopyButton text={record.token} label="Copy token" iconOnly />
          </div>

          {status === 'expired' ? (
            <p className="text-xs text-warning">
              Token expired — re-authorize in Swagger to refresh it.
            </p>
          ) : null}

          <Button variant="danger" onClick={() => void service.clear(environmentId)}>
            Clear authentication
          </Button>
        </>
      ) : (
        <EmptyState
          icon={<AuthIcon className="h-8 w-8 text-muted" />}
          title="Not authorized"
          message="Use Swagger's Authorize button — your credential is saved and restored automatically on refresh."
        />
      )}

      <hr className="border-border" />

      {/* Named credentials: switch accounts (admin / manager / read-only) without
          re-authorizing in Swagger each time. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-text">Saved tokens</span>

        {saved.length === 0 ? (
          <p className="text-[11px] text-muted">
            Save the current token under a name, then switch between accounts with one click.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {saved.map((cred) => {
              // Compare ignoring any Bearer prefix, so format changes don't break it.
              const active =
                record != null &&
                record.token.replace(/^bearer\s+/i, '') === cred.token.replace(/^bearer\s+/i, '')
              const expired = cred.expiresAt != null && cred.expiresAt <= Date.now()
              return (
                <li
                  key={cred.id}
                  className={`flex flex-col gap-1 rounded-md border px-2 py-1 ${
                    active ? 'border-primary bg-surface' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[11px] font-medium text-text">
                        {cred.name}
                      </span>
                      <span className="truncate font-mono text-[10px] text-muted">
                        {cred.type}
                        {expired ? ' · expired' : ''}
                      </span>
                    </div>
                    {active ? (
                      <Badge kind="success">In use</Badge>
                    ) : (
                      <Button variant="secondary" onClick={() => void activate(cred.id)}>
                        Use
                      </Button>
                    )}
                    <CopyButton text={cred.token} label={`Copy ${cred.name}`} iconOnly />
                    <IconButton
                      label={`${cred.login ? 'Edit' : 'Add'} login for ${cred.name}`}
                      onClick={() => openLoginForm(cred)}
                      className={cred.login ? 'text-success' : ''}
                    >
                      <AuthIcon />
                    </IconButton>
                    <IconButton
                      label={`Delete ${cred.name}`}
                      onClick={() => void removeSaved(cred.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </div>

                  {editing === cred.id ? (
                    <div className="flex flex-col gap-1 border-t border-border pt-1">
                      <p className="text-[10px] leading-snug text-muted">
                        Signs <strong>this</strong> account back in when its token expires, and
                        replaces only this saved token. Stored on this device in plain text; the
                        password is left out of backups.
                      </p>
                      {/* Name the target: credentials must never be posted to a
                          surprise endpoint (a loose match once hit forgot-password). */}
                      {loginEndpoint ? (
                        <p className="text-[10px] text-muted">
                          Will sign in via{' '}
                          <span className="font-mono text-text">{loginEndpoint}</span>
                        </p>
                      ) : (
                        <p className="text-[10px] text-warning">
                          No sign-in endpoint could be identified in this API, so credentials
                          can&apos;t be used yet. Saving a login request in the{' '}
                          <strong>Requests</strong> tab gives it something to run instead.
                        </p>
                      )}
                      <Input
                        value={form.username}
                        onChange={(e) => {
                          setForm({ ...form, username: e.target.value })
                          if (editingTouched.username)
                            setEditingTouched((t) => ({ ...t, username: true }))
                        }}
                        onBlur={() => setEditingTouched((t) => ({ ...t, username: true }))}
                        placeholder="Email / username"
                        aria-label={`Email for ${cred.name}`}
                        error={
                          editingTouched.username && !form.username.trim()
                            ? 'Email / username is required.'
                            : null
                        }
                      />
                      <PasswordField
                        value={form.password}
                        onChange={(password) => {
                          setForm({ ...form, password })
                          if (editingTouched.password)
                            setEditingTouched((t) => ({ ...t, password: true }))
                        }}
                        label={`Password for ${cred.name}`}
                        onEnter={() => void saveLogin(cred.id)}
                        error={
                          editingTouched.password && !form.password ? 'Password is required.' : null
                        }
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setEditing(null)
                            setEditingTouched({ username: false, password: false })
                          }}
                        >
                          Cancel
                        </Button>
                        <Button variant="primary" onClick={() => void saveLogin(cred.id)}>
                          Save login
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {/* Add an account without authorizing in Swagger first: sign in here and
            keep the issued token, with its credentials, under one name. */}
        {adding ? (
          <div className="flex flex-col gap-2 rounded-md border border-primary p-2.5 bg-surface/30">
            <span className="text-xs font-semibold text-text">Add account</span>
            <p className="text-[10px] leading-snug text-muted">
              Signs in with these details and saves the token it returns
              {loginEndpoint ? (
                <>
                  {' '}
                  via <span className="font-mono text-text">{loginEndpoint}</span>
                </>
              ) : null}
              .
            </p>
            <div className="flex flex-col gap-2">
              <Input
                value={newAccount.name}
                onChange={(e) => {
                  setNewAccount({ ...newAccount, name: e.target.value })
                  if (newAccountTouched.name) {
                    setNewAccountTouched((t) => ({ ...t, name: true }))
                  }
                }}
                onBlur={() => setNewAccountTouched((t) => ({ ...t, name: true }))}
                placeholder="Token name (e.g. Admin)"
                aria-label="New account name"
                error={
                  newAccountTouched.name && !newAccount.name.trim()
                    ? 'Token name is required.'
                    : null
                }
              />
              <Input
                value={newAccount.username}
                onChange={(e) => {
                  setNewAccount({ ...newAccount, username: e.target.value })
                  if (newAccountTouched.username) {
                    setNewAccountTouched((t) => ({ ...t, username: true }))
                  }
                }}
                onBlur={() => setNewAccountTouched((t) => ({ ...t, username: true }))}
                placeholder="Email / username"
                aria-label="New account email"
                error={
                  newAccountTouched.username && !newAccount.username.trim()
                    ? 'Email / username is required.'
                    : null
                }
              />
              <PasswordField
                value={newAccount.password}
                onChange={(password) => {
                  setNewAccount({ ...newAccount, password })
                  if (newAccountTouched.password) {
                    setNewAccountTouched((t) => ({ ...t, password: true }))
                  }
                }}
                label="New account password"
                onEnter={() => void addAccount()}
                error={
                  newAccountTouched.password && !newAccount.password
                    ? 'Password is required.'
                    : null
                }
              />
            </div>
            <div className="flex justify-end gap-1.5 pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(false)
                  setNewAccount({ name: '', username: '', password: '' })
                  setNewAccountTouched({ name: false, username: false, password: false })
                }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void addAccount()} disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in & save'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            + Add account with email &amp; password
          </Button>
        )}

        {/* Only show when there is an active Swagger token that is not yet saved */}
        {record && !isCurrentTokenSaved && (
          <div className="flex flex-col gap-1.5 rounded-md border border-primary/30 bg-primary/5 p-2 animate-in fade-in duration-150">
            <span className="text-[11px] font-medium text-text">Save current token</span>
            <div className="flex gap-1.5 items-start">
              <div className="flex-1">
                <Input
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    if (saveCurrentTouched) setSaveCurrentTouched(true)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveCurrent()
                  }}
                  placeholder="Name (e.g. Admin)"
                  aria-label="Name for the current token"
                  error={saveCurrentTouched && !newName.trim() ? 'Token name is required.' : null}
                />
              </div>
              <Button variant="primary" onClick={() => void saveCurrent()}>
                Save current
              </Button>
            </div>
          </div>
        )}
      </div>

      <hr className="border-border" />

      {/* Some APIs authorize with "Authorization: Bearer <token>", others want the
          raw token. Applies to what's authorized now, on switch, and on refresh. */}
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            checked={bearerPrefix}
            onChange={(e) => void toggleBearerPrefix(e.target.checked)}
          />
          Send token as “Bearer &lt;token&gt;”
        </label>
        <p className="text-[11px] text-muted">
          On: authorizes with <span className="font-mono">Bearer {'<token>'}</span>. Off: sends the
          raw token. Applied immediately and on every refresh.
        </p>
      </div>

      <hr className="border-border" />

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 text-xs text-text">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => void toggleAutoRefresh(e.target.checked)}
          />
          Auto-refresh token on expiry
        </label>
        <p className="text-[11px] text-muted">
          {hasLoginCredentials
            ? 'When a request returns 401, automatically signs in using your saved account credentials and updates the token.'
            : 'When a request returns 401, runs your saved login request and stores the new token.'}
        </p>
        {/* Setup lives in the product, not just in a changelog: the feature has a
            prerequisite the user can't guess, so spell it out where it's enabled. */}
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => void testRefresh()} disabled={testing}>
            {testing ? 'Refreshing…' : 'Refresh now'}
          </Button>
          <span className="text-[10px] text-muted">
            Runs the flow immediately, so you can watch it.
          </span>
        </div>

        {/* Proof of work: every decision the refresher made, most recent first.
            Without this the feature is invisible until it silently doesn't fire. */}
        {activity.length > 0 ? (
          <ul aria-label="Refresh activity" className="flex flex-col gap-0.5">
            {activity.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="flex gap-1 text-[10px] leading-snug">
                <span className="font-mono text-muted">{clockTime(entry.at)}</span>
                <span className={OUTCOME_CLASS[entry.outcome]}>{entry.message}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {service.listEndpoints && (
          <div className="flex flex-col gap-1 rounded-md border border-border bg-surface/50 p-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted">
                Sign-in endpoint:{' '}
                {loginEndpoint ? (
                  <span className="font-mono font-medium text-text">{loginEndpoint}</span>
                ) : (
                  <span className="text-warning">None detected</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => setShowEndpointPicker((v) => !v)}
                className="text-[11px] text-primary hover:underline"
              >
                {showEndpointPicker ? 'Done' : 'Change'}
              </button>
            </div>
            {showEndpointPicker && service.setConfiguredLoginEndpoint && (
              <div className="mt-1 flex flex-col gap-1 text-[11px]">
                <label className="text-muted">Select endpoint used for sign-in:</label>
                <select
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs font-mono text-text"
                  value={configuredLoginEp ?? ''}
                  onChange={async (e) => {
                    const val = e.target.value || null
                    setConfiguredLoginEp(val)
                    await service.setConfiguredLoginEndpoint?.(val)
                    const ep = await service.loginEndpoint()
                    setLoginEndpoint(ep)
                  }}
                >
                  <option value="">Auto-detect from Swagger (default)</option>
                  {service
                    .listEndpoints()
                    .filter((ep) => ['post', 'put'].includes(ep.method.toLowerCase()))
                    .map((ep) => (
                      <option key={ep.endpointId} value={ep.endpointId}>
                        {ep.method.toUpperCase()} {ep.path}
                        {ep.summary ? ` (${ep.summary})` : ''}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        )}

        <details className="rounded-md border border-border px-2 py-1">
          <summary className="cursor-pointer text-[11px] text-primary">How to set this up</summary>
          <div className="mt-1.5 flex flex-col gap-2 text-[11px] text-muted">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-text">
                Option A — Saved account credentials (Recommended)
              </span>
              <p>
                Click <strong>+ Add account with email &amp; password</strong> above, or click the
                key icon on any saved token to enter login credentials. When a call returns 401,
                OpenAPI Companion signs in automatically and updates your token.
              </p>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-text">Option B — Saved login request preset</span>
              <p>
                Execute your login endpoint once in Swagger, then open the <strong>Requests</strong>{' '}
                tab and save it as a template (with “login” or “auth” in the name).
              </p>
              {onNavigate ? (
                <Button
                  variant="secondary"
                  onClick={() => onNavigate('requests')}
                  className="mt-1 self-start"
                >
                  Open Requests tab
                </Button>
              ) : null}
            </div>
          </div>
        </details>

        {/* When auto-refresh is enabled:
            1. If account credentials exist: show green confirmation and suppress the warning.
            2. If saved login template exists: show green confirmation for template.
            3. If neither exists: show warning with clear instructions. */}
        {autoRefresh ? (
          hasLoginCredentials && credWithLogin?.login ? (
            <div className="flex flex-col gap-1 rounded-md border border-success/30 bg-success/5 p-2 animate-in fade-in duration-150">
              <p className="text-[11px] font-medium text-success">
                ✓ Will sign in using saved account credentials for “{credWithLogin.name}” (
                {credWithLogin.login.username}){loginEndpoint ? ` via ${loginEndpoint}` : ''}.
              </p>
            </div>
          ) : loginTemplate ? (
            <div className="flex flex-col gap-1 rounded-md border border-success/30 bg-success/5 p-2 animate-in fade-in duration-150">
              <p className="text-[11px] font-medium text-success">
                ✓ Will re-run your saved request “{loginTemplate}”.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 rounded-md border border-warning/30 bg-warning/5 p-2 animate-in fade-in duration-150">
              <p className="text-[11px] text-warning">
                No saved login credentials or request found, so this can&apos;t run yet. Add an
                account with email &amp; password above, or save your login endpoint from the{' '}
                <strong>Requests</strong> tab.
              </p>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}
