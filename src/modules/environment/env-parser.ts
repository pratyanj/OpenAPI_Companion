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
