/**
 * Normalizes variable placeholders in JSON strings for structural syntax parsing.
 * Preserves existing quotation context:
 * - "{{VAR}}" inside quotes becomes "__VAR__" (without adding extra quotes)
 * - {{VAR}} outside quotes becomes '"__VAR__"' (providing a valid JSON string value)
 */
export function normalizeVariablesForJson(raw: string): string {
  let inString = false
  let isEscaped = false
  let result = ''
  let i = 0

  while (i < raw.length) {
    const char = raw[i]

    if (char === '\\' && inString) {
      isEscaped = !isEscaped
      result += char
      i++
      continue
    }

    if (char === '"' && !isEscaped) {
      inString = !inString
      result += char
      i++
      continue
    }

    isEscaped = false

    if (raw.slice(i, i + 2) === '{{') {
      const closingIdx = raw.indexOf('}}', i + 2)
      if (closingIdx !== -1) {
        if (inString) {
          result += '__VAR__'
        } else {
          result += '"__VAR__"'
        }
        i = closingIdx + 2
        continue
      }
    }

    result += char
    i++
  }

  return result
}

/**
 * Validates JSON structure while tolerating {{VARIABLE}} or {{VARIABLE:default}} syntax.
 */
export function validateJsonWithVariables(raw: string): { isValid: boolean; error: string | null } {
  if (!raw.trim()) return { isValid: true, error: null }
  const normalized = normalizeVariablesForJson(raw)
  try {
    JSON.parse(normalized)
    return { isValid: true, error: null }
  } catch (err) {
    return { isValid: false, error: (err as Error).message }
  }
}
