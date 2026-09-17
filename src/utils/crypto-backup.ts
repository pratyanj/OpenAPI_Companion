/**
 * Web Crypto AES-GCM + PBKDF2 Passphrase Encryption for Backups.
 *
 * Encrypts exported data bundles containing credentials and sensitive tokens
 * with a user-supplied passphrase, and decrypts them upon restore.
 */

export interface EncryptedCryptoMetadata {
  algorithm: 'AES-GCM'
  kdf: 'PBKDF2'
  iterations: number
  hash: 'SHA-256'
  salt: string // base64
  iv: string // base64
}

export interface EncryptedExportBundle {
  app: string
  appVersion: string
  schemaVersion: number
  exportedAt: number
  encrypted: true
  crypto: EncryptedCryptoMetadata
  ciphertext: string // base64
}

export const PBKDF2_ITERATIONS = 100_000

/** Chunked base64 encoder that avoids call stack limits on large payloads. */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, chunk as unknown as number[])
  }
  return btoa(binary)
}

/** Decodes a base64 string to a Uint8Array. */
export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  )
}

/**
 * Checks if a string or object matches the shape of an encrypted backup bundle.
 */
export function isEncryptedBackup(content: unknown): content is EncryptedExportBundle {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content)
      return isEncryptedBackup(parsed)
    } catch {
      return false
    }
  }
  if (typeof content !== 'object' || content === null) return false
  const obj = content as Record<string, unknown>
  return (
    obj.encrypted === true &&
    typeof obj.ciphertext === 'string' &&
    typeof obj.crypto === 'object' &&
    obj.crypto !== null
  )
}

/**
 * Encrypts plaintext JSON (e.g. an ExportBundle) with a passphrase using AES-GCM + PBKDF2.
 */
export async function encryptBackup(
  plaintextJson: string,
  passphrase: string,
  metadata: { app: string; appVersion: string; schemaVersion: number; exportedAt: number },
): Promise<EncryptedExportBundle> {
  if (!passphrase || !passphrase.trim()) {
    throw new Error('Passphrase cannot be empty for encrypted backup.')
  }

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const key = await deriveKey(passphrase, salt, PBKDF2_ITERATIONS, ['encrypt'])
  const enc = new TextEncoder()
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintextJson),
  )

  return {
    ...metadata,
    encrypted: true,
    crypto: {
      algorithm: 'AES-GCM',
      kdf: 'PBKDF2',
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
    },
    ciphertext: uint8ArrayToBase64(new Uint8Array(encrypted)),
  }
}

/**
 * Decrypts an encrypted backup bundle with the user's passphrase.
 * Throws an error if the passphrase is wrong or the ciphertext is altered.
 */
export async function decryptBackup(
  bundleOrJson: EncryptedExportBundle | string,
  passphrase: string,
): Promise<string> {
  if (!passphrase) {
    throw new Error('Passphrase is required to decrypt this backup.')
  }

  let bundle: EncryptedExportBundle
  if (typeof bundleOrJson === 'string') {
    try {
      bundle = JSON.parse(bundleOrJson) as EncryptedExportBundle
    } catch {
      throw new Error('Invalid JSON format for encrypted backup.')
    }
  } else {
    bundle = bundleOrJson
  }

  if (!isEncryptedBackup(bundle)) {
    throw new Error('Invalid encrypted backup bundle structure.')
  }

  const { crypto: meta, ciphertext } = bundle
  if (meta.algorithm !== 'AES-GCM' || meta.kdf !== 'PBKDF2') {
    throw new Error(`Unsupported encryption format: ${meta.algorithm} / ${meta.kdf}`)
  }

  const salt = base64ToUint8Array(meta.salt)
  const iv = base64ToUint8Array(meta.iv)
  const cipherBytes = base64ToUint8Array(ciphertext)

  const iterations = meta.iterations || PBKDF2_ITERATIONS
  const key = await deriveKey(passphrase, salt, iterations, ['decrypt'])

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipherBytes,
    )
    const dec = new TextDecoder()
    return dec.decode(decrypted)
  } catch {
    throw new Error('Incorrect passphrase or corrupted encrypted backup.')
  }
}
