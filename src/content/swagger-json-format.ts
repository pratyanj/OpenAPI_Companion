/**
 * Swagger UI 1-Click JSON Formatter & Syntax Validator.
 *
 * Provides instant JSON prettification (2-space indent), smart auto-repair
 * (unclosed strings, trailing commas, missing commas, quotes, Python literals, comments),
 * and real-time syntax validation on request body textareas.
 *
 * Uses crisp SVG icons only (never emojis) to guarantee rock-solid stability.
 */
import { setNativeValue } from '@/adapters/swagger/swagger-request-dom'

export const SVG_ICONS = {
  format: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="21" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>`,
  wand: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  sparkle: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  zap: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  alert: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  flask: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31L4.69 17.5a2 2 0 0 0 1.62 3.12h11.38a2 2 0 0 0 1.62-3.12L14 9.31V2"/><path d="M8.5 2h7"/><path d="M7 16h10"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  chevronDown: `<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
}

export interface JsonValidationResult {
  valid: boolean
  isEmpty?: boolean
  error?: string
  shortError?: string
  line?: number
  column?: number
}

/**
 * Formats a clean error message while preserving the full human-readable
 * error text and line/column details.
 */
export function cleanErrorMessage(msg: string): string {
  let cleaned = msg.replace(/^JSON\.parse:\s*/i, '')

  const v8Dump = cleaned.match(/^(Unexpected token [^,]+),\s*"[\s\S]*"\s*is not valid JSON$/i)
  if (v8Dump) {
    return `${v8Dump[1]} is not valid JSON`
  }

  return cleaned.trim() || 'Invalid JSON syntax'
}

/**
 * Validates whether the given string is well-formed JSON.
 * If invalid, extracts line and column numbers.
 */
export function validateJsonSyntax(text: string): JsonValidationResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { valid: true, isEmpty: true }
  }

  try {
    JSON.parse(trimmed)
    return { valid: true, isEmpty: false }
  } catch (err: unknown) {
    const rawError = (err instanceof Error ? err.message : String(err)) || 'Invalid JSON'
    const short = cleanErrorMessage(rawError)

    const lineColMatch = rawError.match(/line (\d+) column (\d+)/i)
    if (lineColMatch) {
      return {
        valid: false,
        isEmpty: false,
        error: rawError,
        shortError: short,
        line: parseInt(lineColMatch[1], 10),
        column: parseInt(lineColMatch[2], 10),
      }
    }

    const posMatch = rawError.match(/position (\d+)/i)
    if (posMatch) {
      const pos = parseInt(posMatch[1], 10)
      const prefix = trimmed.slice(0, Math.max(0, pos))
      const lines = prefix.split('\n')
      const line = lines.length
      const column = lines[lines.length - 1].length + 1
      return {
        valid: false,
        isEmpty: false,
        error: rawError,
        shortError: short,
        line,
        column,
      }
    }

    return {
      valid: false,
      isEmpty: false,
      error: rawError,
      shortError: short,
    }
  }
}

/**
 * Smart JSON auto-repair for formatting:
 * Automatically heals common developer editing syntax errors:
 * 1. Smart/curly quotes from Word, Slack, Notion, Mac
 * 2. Unclosed string literals before comma, newline, or closing brace
 * 3. Comments
 * 4. Missing outer braces
 * 5. Python / JS literals (True, False, None, undefined, NaN)
 * 6. Single quotes -> double quotes
 * 7. Unquoted keys -> quoted keys
 * 8. Missing commas between consecutive property lines
 * 9. Double/multiple consecutive commas
 * 10. Trailing commas before } or ]
 */
export function repairJsonString(input: string): string {
  let str = input.trim()
  if (!str) return str

  // 1. Replace smart / curly quotes
  str = str.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
  str = str.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")

  // 2. Strip comments
  str = str.replace(/\/\/[^\n\r]*/g, "")
  str = str.replace(/\/\*[\s\S]*?\*\//g, "")

  // 3. Fix unclosed string literals before comma, brace, or bracket
  str = str.replace(/:\s*"([^"\n\r,}]*)\s*(,|}|])/g, ': "$1"$2')

  // Also fix unclosed string literal at end of line
  const rawLines = str.split('\n')
  const repairedLines = rawLines.map(line => {
    const quotes = (line.match(/(?<!\\)"/g) || []).length
    if (quotes % 2 !== 0) {
      if (/:\s*"[^"]*\s*$/.test(line)) {
        return line.replace(/:\s*"([^"]*)\s*$/, ': "$1"')
      }
      if (/,\s*$/.test(line)) {
        return line.replace(/,\s*$/, '\",')
      }
      return line + '"'
    }
    return line
  })
  str = repairedLines.join('\n')

  // 4. Wrap bare key-value pairs if outer braces are missing
  if (!str.startsWith('{') && !str.startsWith('[') && str.includes(':')) {
    str = '{' + str + '}'
  }

  // 5. Replace Python / JS values (True, False, None, undefined, NaN)
  str = str.replace(/:\s*True\b/g, ': true')
  str = str.replace(/:\s*False\b/g, ': false')
  str = str.replace(/:\s*None\b/g, ': null')
  str = str.replace(/:\s*undefined\b/g, ': null')
  str = str.replace(/:\s*NaN\b/g, ': null')

  // 6. Convert single quotes to double quotes
  str = str.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')

  // 7. Quote unquoted object keys like { name: "val" } -> { "name": "val" }
  str = str.replace(/([{\[,]\s*)([a-zA-Z0-9_$-]+)\s*:/g, '$1"$2":')

  // 8. Fix missing commas between properties on separate lines: e.g. "val"\n"key":
  str = str.replace(/(["\dtruefalsenull\]}])\s*\n\s*(["{])/gi, '$1,\n$2')

  // 9. Fix double or multiple commas
  str = str.replace(/,\s*,+/g, ",")

  // 10. Remove trailing commas before } or ]
  str = str.replace(/,(\s*[}\]])/g, "$1")

  return str
}

export interface FormatResult {
  success: boolean
  formatted?: string
  error?: string
  shortError?: string
  line?: number
  column?: number
}

/**
 * Parses and reformats a JSON string with 2-space indentation.
 * Automatically auto-repairs common developer syntax quirks (trailing commas, unclosed quotes, etc.).
 */
export function formatJsonText(text: string): FormatResult {
  const trimmed = text.trim()
  if (!trimmed) {
    return { success: false, error: 'Request body is empty', shortError: 'Empty' }
  }

  // 1. Try standard JSON.parse first
  try {
    const parsed = JSON.parse(trimmed)
    const formatted = JSON.stringify(parsed, null, 2)
    return { success: true, formatted }
  } catch {
    // 2. Standard parse failed - attempt smart auto-repair
    try {
      const repaired = repairJsonString(trimmed)
      const parsed = JSON.parse(repaired)
      const formatted = JSON.stringify(parsed, null, 2)
      return { success: true, formatted }
    } catch {
      // 3. If repair still fails, return detailed syntax validation error
      const validation = validateJsonSyntax(trimmed)
      return {
        success: false,
        error: validation.error,
        shortError: validation.shortError,
        line: validation.line,
        column: validation.column,
      }
    }
  }
}

/**
 * Checks whether a JSON text is already formatted with standard 2-space indentation.
 */
export function isAlreadyFormatted(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  try {
    const parsed = JSON.parse(trimmed)
    return trimmed === JSON.stringify(parsed, null, 2)
  } catch {
    return false
  }
}

/**
 * Formats the JSON content of a Swagger request body textarea.
 * Sets native value safely and triggers input/change events.
 */
export function formatTextareaJson(textarea: HTMLTextAreaElement): FormatResult {
  const res = formatJsonText(textarea.value)
  if (res.success && res.formatted !== undefined) {
    setNativeValue(textarea, res.formatted)
  }
  return res
}
