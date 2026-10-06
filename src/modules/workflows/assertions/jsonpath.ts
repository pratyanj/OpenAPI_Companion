/**
 * Safe, zero-dependency JSONPath parser & value extractor.
 * Adheres strictly to Chrome Web Store Manifest V3 CSP rules (no eval / Function).
 */

/**
 * Tokenizes a JSONPath expression into property keys and numeric array indices.
 * Example: `$.data.items[0].name` -> `['data', 'items', 0, 'name']`
 */
export function parseJsonPath(path: string): Array<string | number> {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '$') {
    return []
  }

  // Strip leading '$' and optional leading '.'
  let clean = trimmed.startsWith('$') ? trimmed.slice(1) : trimmed
  if (clean.startsWith('.')) {
    clean = clean.slice(1)
  }

  const tokens: Array<string | number> = []
  // Matches property keys and bracketed indices/keys e.g. "items[0][1].name" or "['prop']"
  const regex = /([^.[\]]+)|\[(\d+)\]|\[['"]([^'"]+)['"]\]/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(clean)) !== null) {
    if (match[1] !== undefined) {
      // Standard dot-property or standalone name
      tokens.push(match[1])
    } else if (match[2] !== undefined) {
      // Numeric index in brackets [0]
      tokens.push(Number(match[2]))
    } else if (match[3] !== undefined) {
      // Quoted string in brackets ['prop']
      tokens.push(match[3])
    }
  }

  return tokens
}

/**
 * Resolves a JSONPath expression against a parsed JSON data object.
 * Returns `undefined` if the path cannot be fully resolved.
 */
export function extractJsonPath(data: unknown, path: string): unknown {
  if (data === null || data === undefined) {
    return undefined
  }

  const tokens = parseJsonPath(path)
  if (tokens.length === 0) {
    return data
  }

  let current: unknown = data

  for (let i = 0; i < tokens.length; i++) {
    if (current === null || current === undefined) {
      return undefined
    }

    const token = tokens[i]!

    // Handle .length on arrays or strings
    if (token === 'length') {
      if (Array.isArray(current) || typeof current === 'string') {
        current = current.length
        continue
      }
    }

    if (typeof token === 'number') {
      if (Array.isArray(current)) {
        current = current[token]
      } else {
        return undefined
      }
    } else {
      if (
        typeof current === 'object' &&
        current !== null &&
        token in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[token]
      } else {
        return undefined
      }
    }
  }

  return current
}
