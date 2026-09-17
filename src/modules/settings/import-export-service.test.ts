import { describe, it, expect, vi } from 'vitest'
import { StorageService, projectKey, settingsKey } from '@/core/storage'
import { EventBus } from '@/core/events'
import { createFakeArea } from '@/tests/fake-storage'
import { APP_NAME, SCHEMA_VERSION } from '@/constants'
import { ImportExportService, type Downloader } from './import-export-service'

function setup(download?: Downloader, bus = new EventBus()) {
  const storage = new StorageService({ area: createFakeArea(), now: () => 42 })
  const service = new ImportExportService({ storage, bus, now: () => 42, download })
  return { storage, service, bus }
}

async function seed(storage: StorageService) {
  await storage.set(
    projectKey('p1', 'authentication', 'default'),
    { token: 'secret' },
    { immediate: true },
  )
  await storage.set(settingsKey('theme'), 'dark', { immediate: true })
}

describe('ImportExportService.exportAll', () => {
  it('produces a versioned bundle of every entry and emits DATA_EXPORTED', async () => {
    const bus = new EventBus()
    const exported = vi.fn()
    bus.subscribe('DATA_EXPORTED', exported)
    const { service, storage } = setup(undefined, bus)
    await seed(storage)

    const r = await service.exportAll()
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const bundle = JSON.parse(r.value)
    expect(bundle.app).toBe(APP_NAME)
    expect(bundle.schemaVersion).toBe(SCHEMA_VERSION)
    expect(bundle.entries[projectKey('p1', 'authentication', 'default')]).toEqual({
      token: 'secret',
    })
    expect(bundle.entries[settingsKey('theme')]).toBe('dark')
    expect(exported).toHaveBeenCalled()
  })
})

describe('ImportExportService.backup', () => {
  it('downloads the bundle and emits DATA_BACKED_UP', async () => {
    const download = vi.fn()
    const backedUp = vi.fn()
    const { service, storage, bus } = setup(download)
    bus.subscribe('DATA_BACKED_UP', backedUp)
    await seed(storage)

    const r = await service.backup()
    expect(r.ok && r.value).toBe('openapi-companion-backup-42.json')
    expect(download).toHaveBeenCalledWith(
      'openapi-companion-backup-42.json',
      expect.stringContaining('"app"'),
      'application/json',
    )
    expect(backedUp).toHaveBeenCalledWith(
      expect.objectContaining({ auto: false, filename: 'openapi-companion-backup-42.json' }),
    )
  })
})

describe('ImportExportService.previewImport', () => {
  const bundle = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      app: APP_NAME,
      appVersion: '0.1.0',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: 1,
      entries: {
        [projectKey('p1', 'authentication', 'default')]: { token: 't' },
        [settingsKey('theme')]: 'dark',
      },
      ...over,
    })

  it('summarizes a valid bundle and flags secrets', () => {
    const { service } = setup()
    const r = service.previewImport(bundle())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.total).toBe(2)
    expect(r.value.projectCount).toBe(1)
    expect(r.value.containsSecrets).toBe(true)
    expect(r.value.byRoot).toEqual({ projects: 1, settings: 1 })
  })

  it('rejects invalid JSON', () => {
    const { service } = setup()
    const r = service.previewImport('{ not json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('IMPORT_INVALID')
  })

  it('rejects a foreign / malformed file', () => {
    const { service } = setup()
    expect(service.previewImport(JSON.stringify({ app: 'Other', entries: {} })).ok).toBe(false)
    expect(service.previewImport(JSON.stringify({ app: APP_NAME })).ok).toBe(false)
  })

  it('rejects a newer schema version', () => {
    const { service } = setup()
    const r = service.previewImport(bundle({ schemaVersion: SCHEMA_VERSION + 1 }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('IMPORT_UNSUPPORTED_VERSION')
  })

  it('rejects keys outside the extension namespace (sanitization)', () => {
    const { service } = setup()
    const r = service.previewImport(bundle({ entries: { '__proto__/evil': 1, 'window.x': 2 } }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe('IMPORT_UNSAFE')
  })
})

describe('ImportExportService.applyImport', () => {
  const bundle = JSON.stringify({
    app: APP_NAME,
    appVersion: '0.1.0',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: 1,
    entries: {
      [settingsKey('theme')]: 'light',
      [projectKey('p9', 'history', 'index')]: [1],
    },
  })

  it('replace mode overwrites existing keys and emits DATA_IMPORTED', async () => {
    const bus = new EventBus()
    const imported = vi.fn()
    bus.subscribe('DATA_IMPORTED', imported)
    const { service, storage } = setup(undefined, bus)
    await storage.set(settingsKey('theme'), 'dark', { immediate: true })

    const r = await service.applyImport(bundle, 'replace')
    expect(r.ok && r.value).toEqual({ imported: 2, skipped: 0, renamed: 0 })
    const theme = await storage.getData(settingsKey('theme'))
    expect(theme.ok && theme.value).toBe('light')
    expect(imported).toHaveBeenCalledWith({ summary: { imported: 2, skipped: 0, renamed: 0 } })
  })

  it('skip mode keeps existing keys and only adds new ones', async () => {
    const { service, storage } = setup()
    await storage.set(settingsKey('theme'), 'dark', { immediate: true })

    const r = await service.applyImport(bundle, 'skip')
    expect(r.ok && r.value).toEqual({ imported: 1, skipped: 1, renamed: 0 })
    // Existing theme preserved…
    const theme = await storage.getData(settingsKey('theme'))
    expect(theme.ok && theme.value).toBe('dark')
    // …new project entry added.
    const hist = await storage.getData(projectKey('p9', 'history', 'index'))
    expect(hist.ok && hist.value).toEqual([1])
  })

  it('does not write anything when the file is invalid', async () => {
    const { service, storage } = setup()
    const r = await service.applyImport('nope', 'replace')
    expect(r.ok).toBe(false)
    const all = await storage.list('')
    expect(all.ok && all.value).toEqual([])
  })

  // Backups get emailed, committed and shared. A token expires; a password does
  // not — so the password must not travel in the file.
  it('omits saved passwords from the export', async () => {
    const area = createFakeArea()
    const storage = new StorageService({ area, now: () => 0 })
    await storage.set('oac/project/p1/auth-vault/cred_admin', {
      id: 'cred_admin',
      name: 'admin',
      type: 'bearer',
      token: 'TOKEN_KEPT',
      createdAt: 0,
      login: {
        url: '/auth/login',
        username: 'admin@acme.io',
        password: 'SUPER_SECRET',
        usernameField: 'email',
        passwordField: 'password',
      },
    })
    const io = new ImportExportService({ storage, now: () => 0 })

    const exported = await io.exportAll()
    expect(exported.ok).toBe(true)
    if (!exported.ok) return

    expect(exported.value).not.toContain('SUPER_SECRET')
    // Everything else survives: the token, and the rest of the login details.
    expect(exported.value).toContain('TOKEN_KEPT')
    expect(exported.value).toContain('admin@acme.io')
  })

  it('includes saved passwords in export when protected by a passphrase, and successfully restores them', async () => {
    const area = createFakeArea()
    const storage = new StorageService({ area, now: () => 0 })
    const key = 'projects/p1/auth-vault/cred_admin'
    await storage.set(key, {
      id: 'cred_admin',
      name: 'admin',
      type: 'bearer',
      token: 'TOKEN_KEPT',
      createdAt: 0,
      login: {
        url: '/auth/login',
        username: 'admin@acme.io',
        password: 'SUPER_SECRET',
        usernameField: 'email',
        passwordField: 'password',
      },
    })
    const io = new ImportExportService({ storage, now: () => 0 })

    // Export with passphrase
    const exported = await io.exportAll('my-passphrase')
    expect(exported.ok).toBe(true)
    if (!exported.ok) return

    // Plaintext password is not visible in the ciphertext JSON
    expect(exported.value).not.toContain('SUPER_SECRET')
    expect(io.isEncrypted(exported.value)).toBe(true)

    // previewImport detects encryption
    const previewRes = io.previewImport(exported.value)
    expect(previewRes.ok).toBe(false)
    if (!previewRes.ok) {
      expect(previewRes.error.code).toBe('IMPORT_ENCRYPTED')
    }

    // Decrypting with wrong passphrase fails
    const badDecrypt = await io.decryptBackup(exported.value, 'wrong-pass')
    expect(badDecrypt.ok).toBe(false)

    // Decrypting with correct passphrase succeeds and reveals password
    const goodDecrypt = await io.decryptBackup(exported.value, 'my-passphrase')
    expect(goodDecrypt.ok).toBe(true)
    if (!goodDecrypt.ok) return
    expect(goodDecrypt.value).toContain('SUPER_SECRET')

    // Applying import with passphrase restores the password into storage
    const targetArea = createFakeArea()
    const targetStorage = new StorageService({ area: targetArea, now: () => 0 })
    const targetIo = new ImportExportService({ storage: targetStorage, now: () => 0 })

    const importRes = await targetIo.applyImport(exported.value, 'replace', 'my-passphrase')
    expect(importRes.ok).toBe(true)

    const restoredCred = await targetStorage.getData<{ login?: { password?: string } }>(key)
    expect(restoredCred.ok && restoredCred.value?.login?.password).toBe('SUPER_SECRET')
  })
})
