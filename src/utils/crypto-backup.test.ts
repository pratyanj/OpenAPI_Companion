import { describe, it, expect } from 'vitest'
import {
  encryptBackup,
  decryptBackup,
  isEncryptedBackup,
  uint8ArrayToBase64,
  base64ToUint8Array,
} from './crypto-backup'

describe('crypto-backup', () => {
  const metadata = {
    app: 'OpenAPI Companion',
    appVersion: '1.1.4',
    schemaVersion: 1,
    exportedAt: 1726000000000,
  }

  const samplePayload = JSON.stringify({
    app: 'OpenAPI Companion',
    entries: {
      'projects/p1/auth-vault/acc1': {
        login: { username: 'admin', password: 'super-secret-password-123!' },
      },
      'projects/p1/environment/default': {
        variables: { API_KEY: 'secret-token-xyz' },
      },
    },
  })

  it('converts Uint8Array to base64 and back accurately', () => {
    const original = new Uint8Array([0, 1, 2, 127, 128, 254, 255])
    const b64 = uint8ArrayToBase64(original)
    const restored = base64ToUint8Array(b64)
    expect(restored).toEqual(original)
  })

  it('encrypts and decrypts a backup payload with the correct passphrase', async () => {
    const passphrase = 'test-passphrase-42'
    const encrypted = await encryptBackup(samplePayload, passphrase, metadata)

    expect(encrypted.encrypted).toBe(true)
    expect(encrypted.app).toBe('OpenAPI Companion')
    expect(encrypted.crypto.algorithm).toBe('AES-GCM')
    expect(encrypted.crypto.kdf).toBe('PBKDF2')
    expect(encrypted.ciphertext).toBeTruthy()
    // Ciphertext should not contain raw plaintext password
    expect(encrypted.ciphertext).not.toContain('super-secret-password-123!')

    // Decrypt
    const decrypted = await decryptBackup(encrypted, passphrase)
    expect(decrypted).toBe(samplePayload)
    const parsed = JSON.parse(decrypted)
    expect(parsed.entries['projects/p1/auth-vault/acc1'].login.password).toBe(
      'super-secret-password-123!',
    )
  })

  it('decrypts from stringified JSON', async () => {
    const passphrase = 'test-passphrase-42'
    const encrypted = await encryptBackup(samplePayload, passphrase, metadata)
    const jsonString = JSON.stringify(encrypted)

    const decrypted = await decryptBackup(jsonString, passphrase)
    expect(decrypted).toBe(samplePayload)
  })

  it('rejects decryption when an incorrect passphrase is provided', async () => {
    const passphrase = 'correct-passphrase'
    const encrypted = await encryptBackup(samplePayload, passphrase, metadata)

    await expect(decryptBackup(encrypted, 'wrong-passphrase')).rejects.toThrow(
      /incorrect passphrase/i,
    )
  })

  it('rejects encryption with empty passphrase', async () => {
    await expect(encryptBackup(samplePayload, '', metadata)).rejects.toThrow(
      /passphrase cannot be empty/i,
    )
  })

  it('accurately identifies encrypted backup bundles with isEncryptedBackup', async () => {
    const encrypted = await encryptBackup(samplePayload, 'pass', metadata)

    expect(isEncryptedBackup(encrypted)).toBe(true)
    expect(isEncryptedBackup(JSON.stringify(encrypted))).toBe(true)

    // Plain backups or random objects
    expect(isEncryptedBackup({ app: 'OpenAPI Companion', entries: {} })).toBe(false)
    expect(isEncryptedBackup('{"app":"OpenAPI Companion"}')).toBe(false)
    expect(isEncryptedBackup(null)).toBe(false)
    expect(isEncryptedBackup('invalid json string')).toBe(false)
  })

  it('handles large payloads with special characters and unicode', async () => {
    const largeObject: Record<string, unknown> = {}
    for (let i = 0; i < 500; i++) {
      largeObject[`key_${i}`] = `Value with unicode 🚀 🔑 and quotes "test": ${i}`
    }
    const bigPayload = JSON.stringify(largeObject)
    const encrypted = await encryptBackup(bigPayload, 'unicode-passphrase-🔑', metadata)
    const decrypted = await decryptBackup(encrypted, 'unicode-passphrase-🔑')
    expect(decrypted).toBe(bigPayload)
  })
})
