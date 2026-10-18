/**
 * Parser and serializer utilities for .env format and Postman environment JSON.
 */

export interface ParsedEnvResult {
  variables: Record<string, string>
  /** Keys inferred or marked as secrets (e.g. from Postman or detected patterns) */
  secrets: string[]
}

/**
 * Parse a standard `.env` text file into key-value pairs.
 * Supports:
 * - KEY=VALUE and export KEY=VALUE
 * - Single and double quoted values with escape sequences
 * - Comments (#) and blank lines
 * - Trailing inline comments on unquoted values
 */
export function parseDotEnv(content: string): ParsedEnvResult {
  const variables: Record<string, string> = {}
  const secrets = new Set<string>()

  const lines = content.split(/\r?\n/)
  let i = 0

  const isClosed = (str: string, q: string): boolean => {
    if (str.length < 2) return false
    if (!str.endsWith(q)) return false
    let backslashes = 0
    for (let j = str.length - 2; j >= 0 && str[j] === '\\'; j--) {
      backslashes++
    }
    return backslashes % 2 === 0
  }

  while (i < lines.length) {
    let line = lines[i]!.trim()
    i++
    if (!line || line.startsWith('#')) continue

    // Support "export KEY=value"
    if (line.startsWith('export ')) {
      line = line.slice(7).trim()
    }

    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const rawKey = line.slice(0, eqIndex).trim()
    let rawVal = line.slice(eqIndex + 1).trim()

    if (!rawKey) continue

    // Check quotes
    if (rawVal.startsWith('"') || rawVal.startsWith("'")) {
      const quote = rawVal[0]!
      while (!isClosed(rawVal, quote) && i < lines.length) {
        rawVal += '\n' + lines[i]!
        i++
      }

      if (isClosed(rawVal, quote)) {
        const inner = rawVal.slice(1, -1)
        if (quote === '"') {
          rawVal = inner
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
        } else {
          rawVal = inner.replace(/\\'/g, "'").replace(/\\\\/g, '\\')
        }
      }
    } else {
      // Remove trailing inline comments if preceded by whitespace
      const commentMatch = /\s+#.*$/.exec(rawVal)
      if (commentMatch) {
        rawVal = rawVal.slice(0, commentMatch.index).trim()
      }
    }

    variables[rawKey] = rawVal

    // Heuristic: if key contains SECRET, PASSWORD, TOKEN, PRIVATE, KEY, suggest secret
    if (/token|secret|password|private|api_?key/i.test(rawKey)) {
      secrets.add(rawKey)
    }
  }

  return { variables, secrets: Array.from(secrets) }
}

/**
 * Serializes variables to standard `.env` format.
 */
export function serializeDotEnv(
  variables: Record<string, string>,
  secrets: string[] = [],
  options?: { maskSecrets?: boolean },
): string {
  const secretSet = new Set(secrets)
  const lines: string[] = []

  for (const [key, value] of Object.entries(variables)) {
    if (!key.trim()) continue
    let formattedVal = value ?? ''

    if (options?.maskSecrets && secretSet.has(key)) {
      formattedVal = '••••••••'
    } else if (
      formattedVal.includes('\n') ||
      formattedVal.includes('\r') ||
      formattedVal.includes('"') ||
      formattedVal.includes('#') ||
      formattedVal.startsWith(' ') ||
      formattedVal.endsWith(' ')
    ) {
      formattedVal = `"${formattedVal
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')}"`
    }

    lines.push(`${key}=${formattedVal}`)
  }

  return lines.join('\n')
}

export interface PostmanEnvValue {
  key: string
  value: string
  type?: 'text' | 'secret' | 'default' | string
  enabled?: boolean
}

export interface PostmanEnvFormat {
  id?: string
  name?: string
  values: PostmanEnvValue[]
  _postman_variable_scope?: string
}

/**
 * Parses a Postman environment export JSON string.
 */
export function parsePostmanEnv(jsonText: string): {
  name?: string
  variables: Record<string, string>
  secrets: string[]
} {
  const parsed = JSON.parse(jsonText) as Partial<PostmanEnvFormat>
  const variables: Record<string, string> = {}
  const secrets: string[] = []

  if (Array.isArray(parsed.values)) {
    for (const item of parsed.values) {
      if (item && typeof item.key === 'string' && item.enabled !== false) {
        const k = item.key.trim()
        if (k) {
          variables[k] = typeof item.value === 'string' ? item.value : String(item.value ?? '')
          if (item.type === 'secret' || /token|secret|password|private|api_?key/i.test(k)) {
            secrets.push(k)
          }
        }
      }
    }
  }

  return {
    name: parsed.name,
    variables,
    secrets,
  }
}

/**
 * Exports variables in Postman Environment JSON format.
 */
export function exportPostmanEnv(
  name: string,
  variables: Record<string, string>,
  secrets: string[] = [],
  options?: { maskSecrets?: boolean },
): string {
  const secretSet = new Set(secrets)
  const values: PostmanEnvValue[] = Object.entries(variables).map(([key, value]) => {
    const isSecret = secretSet.has(key)
    return {
      key,
      value: options?.maskSecrets && isSecret ? '••••••••' : value,
      type: isSecret ? 'secret' : 'default',
      enabled: true,
    }
  })

  const payload: PostmanEnvFormat = {
    name: name || 'Environment',
    values,
    _postman_variable_scope: 'environment',
  }

  return JSON.stringify(payload, null, 2)
}

/**
 * Checks whether a variable key likely represents a sensitive secret/credential.
 */
export function isSecretKey(key: string): boolean {
  return /token|secret|password|private|api_?key|auth/i.test(key)
}

export type VariableFormat = 'postman' | 'json' | 'dotenv' | 'invalid' | 'unknown'

export interface DetectedVariableResult {
  format: VariableFormat
  name?: string
  variables: Record<string, string>
  secrets: string[]
  error?: string
}

export interface JsonVariableOptions {
  flattenNested?: boolean
  prefix?: string
}

/**
 * Parses raw JSON (key-value dictionary, nested response payload, or key/value array)
 * into environment variables and detects secret keys.
 */
export function parseJsonVariables(
  jsonText: string,
  options?: JsonVariableOptions,
): ParsedEnvResult {
  const parsed = JSON.parse(jsonText) as unknown
  const variables: Record<string, string> = {}
  const secrets = new Set<string>()

  if (parsed === null || parsed === undefined) {
    return { variables, secrets: [] }
  }

  // 1. Postman environment JSON: has .values array
  if (
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as PostmanEnvFormat).values)
  ) {
    const postman = parsePostmanEnv(jsonText)
    return { variables: postman.variables, secrets: postman.secrets }
  }

  // 2. Array of key-value objects: e.g. [{ key: "A", value: "B" }] or [{ name: "A", value: "B" }]
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === 'object') {
        const k = ((item as { key?: unknown }).key ?? (item as { name?: unknown }).name)
          ?.toString()
          .trim()
        if (k) {
          const val = (item as { value?: unknown }).value
          variables[k] = typeof val === 'string' ? val : String(val ?? '')
          if ((item as { type?: unknown }).type === 'secret' || isSecretKey(k)) {
            secrets.add(k)
          }
        }
      }
    }
    return { variables, secrets: Array.from(secrets) }
  }

  // 3. Standard JSON object / dictionary (API response, config, etc.)
  if (typeof parsed === 'object') {
    const shouldFlatten = options?.flattenNested !== false

    const walk = (obj: Record<string, unknown>, currentPrefix = '') => {
      for (const [key, val] of Object.entries(obj)) {
        const trimmedKey = key.trim()
        if (!trimmedKey) continue

        const fullKey = currentPrefix ? `${currentPrefix}_${trimmedKey}` : trimmedKey

        if (val === null || val === undefined) {
          variables[fullKey] = ''
        } else if (typeof val === 'object' && !Array.isArray(val)) {
          if (shouldFlatten) {
            walk(val as Record<string, unknown>, fullKey)
          } else {
            variables[fullKey] = JSON.stringify(val)
          }
        } else if (Array.isArray(val)) {
          // If array of primitives or objects, serialize to JSON
          variables[fullKey] = JSON.stringify(val)
        } else {
          variables[fullKey] = String(val)
        }

        if (isSecretKey(fullKey)) {
          secrets.add(fullKey)
        }
      }
    }

    walk(parsed as Record<string, unknown>, options?.prefix ?? '')
    return { variables, secrets: Array.from(secrets) }
  }

  return { variables, secrets: [] }
}

/**
 * Detects whether content is Postman environment JSON, standard raw JSON, or .env text,
 * parsing and extracting variables and diagnostics in real time.
 */
export function detectVariableContent(
  content: string,
  options?: JsonVariableOptions,
): DetectedVariableResult {
  const trimmed = content.trim()
  if (!trimmed) {
    return { format: 'unknown', variables: {}, secrets: [] }
  }

  // Check if content looks like JSON
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        !Array.isArray(parsed) &&
        Array.isArray((parsed as PostmanEnvFormat).values)
      ) {
        const postman = parsePostmanEnv(trimmed)
        return {
          format: 'postman',
          name: postman.name,
          variables: postman.variables,
          secrets: postman.secrets,
        }
      }

      const jsonResult = parseJsonVariables(trimmed, options)
      return {
        format: 'json',
        variables: jsonResult.variables,
        secrets: jsonResult.secrets,
      }
    } catch (err) {
      return {
        format: 'invalid',
        variables: {},
        secrets: [],
        error: err instanceof Error ? err.message : 'Invalid JSON format',
      }
    }
  }

  // Otherwise, treat as .env format
  try {
    const dotEnvResult = parseDotEnv(trimmed)
    if (Object.keys(dotEnvResult.variables).length > 0) {
      return {
        format: 'dotenv',
        variables: dotEnvResult.variables,
        secrets: dotEnvResult.secrets,
      }
    }
  } catch {
    // ignore
  }

  return {
    format: 'unknown',
    variables: {},
    secrets: [],
  }
}
