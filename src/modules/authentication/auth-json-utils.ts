/**
 * Utilities for extracting and parsing login credentials and extra payload fields
 * from raw JSON objects pasted by developers.
 */

export interface ExtraFieldEntry {
  id: string
  key: string
  value: string
  type: 'string' | 'boolean' | 'number'
}

export function recordToExtraFields(
  record?: Record<string, string | number | boolean>,
): ExtraFieldEntry[] {
  if (!record) return []
  return Object.entries(record).map(([k, v], idx) => ({
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    key: k,
    value: String(v),
    type: typeof v === 'boolean' ? 'boolean' : typeof v === 'number' ? 'number' : 'string',
  }))
}

export function extraFieldsToRecord(
  entries: ExtraFieldEntry[],
): Record<string, string | number | boolean> | undefined {
  const result: Record<string, string | number | boolean> = {}
  let count = 0
  for (const entry of entries) {
    const trimmedKey = entry.key.trim()
    if (!trimmedKey) continue
    count++
    if (entry.type === 'boolean') {
      result[trimmedKey] = entry.value.toLowerCase() === 'true'
    } else if (entry.type === 'number') {
      const num = Number(entry.value)
      result[trimmedKey] = Number.isNaN(num) ? entry.value : num
    } else {
      result[trimmedKey] = entry.value
    }
  }
  return count > 0 ? result : undefined
}

/**
 * Derives a human-friendly account persona name from a username or email.
 * If the username contains an '@', returns the prefix before '@'.
 * Otherwise returns the trimmed username.
 *
 * Examples:
 *   'admin@example.com' -> 'admin'
 *   'john.doe@company.org' -> 'john.doe'
 *   'service_worker' -> 'service_worker'
 */
export function deriveAccountNameFromUsername(username: string): string {
  const trimmed = username.trim()
  if (!trimmed) return ''
  const atIdx = trimmed.indexOf('@')
  if (atIdx > 0) {
    return trimmed.slice(0, atIdx).trim()
  }
  return trimmed
}

export interface ParsedAccountJson {
  name: string
  username: string
  password: string
  extraFields: Record<string, string | number | boolean>
  extraFieldEntries: ExtraFieldEntry[]
  detectedKeys: {
    nameKey?: string
    usernameKey?: string
    passwordKey?: string
    extraCount: number
  }
}

export type ParseAccountJsonResult =
  { ok: true; value: ParsedAccountJson } | { ok: false; error: string }

const USERNAME_KEYS = [
  'username',
  'email',
  'user',
  'login',
  'identifier',
  'user_email',
  'user_name',
  'username_or_email',
  'email_or_username',
]

const PASSWORD_KEYS = ['password', 'pass', 'secret', 'pwd', 'user_password', 'auth_password']

const NAME_KEYS = ['name', 'account', 'persona', 'title', 'account_name', 'token_name']

/**
 * Parses raw JSON text into structured account credentials:
 * - Automatically finds username/email
 * - Automatically finds password
 * - Derives account name from email prefix if not explicitly specified
 * - Gathers all other primitive properties into extra payload fields
 */
export function parseAccountJson(raw: string): ParseAccountJsonResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: 'JSON cannot be empty' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    return { ok: false, error: `Invalid JSON syntax: ${(err as Error).message}` }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON must be an object with key-value pairs' }
  }

  const obj = parsed as Record<string, unknown>
  const entries = Object.entries(obj)
  if (entries.length === 0) {
    return { ok: false, error: 'JSON object is empty' }
  }

  let foundName: string | undefined
  let nameKey: string | undefined
  let foundUsername: string | undefined
  let usernameKey: string | undefined
  let foundPassword: string | undefined
  let passwordKey: string | undefined
  const extraFields: Record<string, string | number | boolean> = {}

  // 1. Find username
  for (const [k, v] of entries) {
    const lk = k.toLowerCase().replace(/[-_]/g, '')
    if (!foundUsername) {
      for (const target of USERNAME_KEYS) {
        if (
          lk === target.replace(/[-_]/g, '') &&
          (typeof v === 'string' || typeof v === 'number')
        ) {
          foundUsername = String(v)
          usernameKey = k
          break
        }
      }
    }
  }

  // 2. Find password
  for (const [k, v] of entries) {
    if (k === usernameKey) continue
    const lk = k.toLowerCase().replace(/[-_]/g, '')
    if (!foundPassword) {
      for (const target of PASSWORD_KEYS) {
        if (
          lk === target.replace(/[-_]/g, '') &&
          (typeof v === 'string' || typeof v === 'number')
        ) {
          foundPassword = String(v)
          passwordKey = k
          break
        }
      }
    }
  }

  // 3. Find name/account title
  for (const [k, v] of entries) {
    if (k === usernameKey || k === passwordKey) continue
    const lk = k.toLowerCase().replace(/[-_]/g, '')
    if (!foundName) {
      for (const target of NAME_KEYS) {
        if (lk === target.replace(/[-_]/g, '') && typeof v === 'string') {
          foundName = v
          nameKey = k
          break
        }
      }
    }
  }

  // If no explicit name provided, auto-derive from username
  if (!foundName && foundUsername) {
    foundName = deriveAccountNameFromUsername(foundUsername)
  }

  // 4. Capture remaining primitive properties as extraFields
  for (const [k, v] of entries) {
    if (k === usernameKey || k === passwordKey || k === nameKey) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      extraFields[k] = v
    }
  }

  const extraFieldEntries = recordToExtraFields(extraFields)

  return {
    ok: true,
    value: {
      name: foundName ?? '',
      username: foundUsername ?? '',
      password: foundPassword ?? '',
      extraFields,
      extraFieldEntries,
      detectedKeys: {
        nameKey,
        usernameKey,
        passwordKey,
        extraCount: Object.keys(extraFields).length,
      },
    },
  }
}
