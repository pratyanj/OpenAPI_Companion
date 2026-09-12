import { describe, it, expect } from 'vitest'
import {
  validateJsonSyntax,
  formatJsonText,
  formatTextareaJson,
  cleanErrorMessage,
  repairJsonString,
  SVG_ICONS,
} from './swagger-json-format'

describe('swagger-json-format', () => {
  describe('SVG_ICONS', () => {
    it('contains valid SVG markup without any emojis', () => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
      for (const [name, svg] of Object.entries(SVG_ICONS)) {
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.endsWith('</svg>')).toBe(true)
        expect(emojiRegex.test(svg), `Icon ${name} should not contain emojis`).toBe(false)
      }
    })
  })

  describe('validateJsonSyntax', () => {
    it('returns valid for empty or whitespace strings', () => {
      expect(validateJsonSyntax('')).toEqual({ valid: true, isEmpty: true })
      expect(validateJsonSyntax('   \n\t  ')).toEqual({ valid: true, isEmpty: true })
    })

    it('returns valid for well-formed JSON objects and arrays', () => {
      expect(validateJsonSyntax('{"name": "test", "active": true}')).toEqual({
        valid: true,
        isEmpty: false,
      })
      expect(validateJsonSyntax('[1, 2, 3]')).toEqual({
        valid: true,
        isEmpty: false,
      })
    })

    it('identifies syntax errors and calculates line/column numbers', () => {
      const invalidJson = '{\n  "title": "item",\n  "count":\n}'
      const result = validateJsonSyntax(invalidJson)
      expect(result.valid).toBe(false)
      expect(result.isEmpty).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.shortError).toBeDefined()
    })

    it('detects trailing comma syntax error', () => {
      const trailingComma = '{\n  "a": 1,\n}'
      const result = validateJsonSyntax(trailingComma)
      expect(result.valid).toBe(false)
      expect(result.line).toBe(3)
    })
  })

  describe('cleanErrorMessage', () => {
    it('cleans Firefox JSON.parse prefix while preserving full description and line/column', () => {
      const firefox = 'JSON.parse: expected double-quoted property name at line 4 column 1 of the JSON data'
      expect(cleanErrorMessage(firefox)).toBe('expected double-quoted property name at line 4 column 1 of the JSON data')
    })

    it('extracts concise error message from verbose V8 parse error dumps', () => {
      const raw = 'Unexpected token \'}\', \"{\\n  \\"a\\": 1\\n}\" is not valid JSON'
      expect(cleanErrorMessage(raw)).toBe("Unexpected token '}' is not valid JSON")
    })

    it('preserves Chrome position and line information', () => {
      const raw = 'Expected double-quoted property name in JSON at position 12 (line 3 column 1)'
      expect(cleanErrorMessage(raw)).toBe(raw)
    })
  })

  describe('repairJsonString', () => {
    it('heals unclosed string literals before comma or newline (user case 2)', () => {
      const unclosed = '{\n  "email": "user@example.com",\n  "password": "string,\n}'
      const repaired = repairJsonString(unclosed)
      expect(JSON.parse(repaired)).toEqual({
        email: 'user@example.com',
        password: 'string',
      })
    })

    it('removes trailing commas from objects and arrays (user case 1)', () => {
      const withTrailing = '{\n  "email": "user@example.com",\n  "password": "string",\n}'
      const repaired = repairJsonString(withTrailing)
      expect(JSON.parse(repaired)).toEqual({
        email: 'user@example.com',
        password: 'string',
      })
    })

    it('converts single quotes to double quotes', () => {
      const singleQuotes = "{'title': 'Test', 'count': 5}"
      const repaired = repairJsonString(singleQuotes)
      expect(JSON.parse(repaired)).toEqual({ title: 'Test', count: 5 })
    })

    it('quotes unquoted property keys', () => {
      const unquoted = '{name: "Alice", active: true}'
      const repaired = repairJsonString(unquoted)
      expect(JSON.parse(repaired)).toEqual({ name: 'Alice', active: true })
    })

    it('fixes Python booleans and None values', () => {
      const py = '{\n  "active": True,\n  "archived": False,\n  "parent": None\n}'
      const repaired = repairJsonString(py)
      expect(JSON.parse(repaired)).toEqual({
        active: true,
        archived: false,
        parent: null,
      })
    })

    it('fixes smart curly quotes from Word, Slack, or Notion', () => {
      const smart = '{\n  \u201Ctitle\u201D: \u201CHello\u201D\n}'
      const repaired = repairJsonString(smart)
      expect(JSON.parse(repaired)).toEqual({ title: 'Hello' })
    })

    it('fixes missing commas between property lines', () => {
      const missingComma = '{\n  "a": 1\n  "b": 2\n}'
      const repaired = repairJsonString(missingComma)
      expect(JSON.parse(repaired)).toEqual({ a: 1, b: 2 })
    })
  })

  describe('formatJsonText', () => {
    it('returns error if input is empty', () => {
      const res = formatJsonText('   ')
      expect(res.success).toBe(false)
      expect(res.error).toBe('Request body is empty')
    })

    it('auto-repairs unclosed string literal and formats with 2 spaces', () => {
      const unclosed = '{\n  "email": "user@example.com",\n  "password": "string,\n}'
      const res = formatJsonText(unclosed)
      expect(res.success).toBe(true)
      expect(res.formatted).toBe(
        JSON.stringify(
          {
            email: 'user@example.com',
            password: 'string',
          },
          null,
          2,
        ),
      )
    })

    it('prettifies compact JSON with 2 spaces indentation', () => {
      const compact = '{"name":"Alice","skills":["ts","react"],"count":10}'
      const res = formatJsonText(compact)
      expect(res.success).toBe(true)
      expect(res.formatted).toBe(
        JSON.stringify(
          {
            name: 'Alice',
            skills: ['ts', 'react'],
            count: 10,
          },
          null,
          2,
        ),
      )
    })

    it('preserves error details when text cannot be parsed or repaired', () => {
      const res = formatJsonText('just some random unparseable text')
      expect(res.success).toBe(false)
      expect(res.error).toBeDefined()
      expect(res.formatted).toBeUndefined()
    })
  })

  describe('formatTextareaJson', () => {
    it('formats textarea value in-place when valid or repairable', () => {
      const ta = document.createElement('textarea')
      ta.value = '{"email":"test@example.com","password":"secret,}'

      const res = formatTextareaJson(ta)
      expect(res.success).toBe(true)
      expect(ta.value).toBe('{\n  "email": "test@example.com",\n  "password": "secret"\n}')
    })

    it('does not overwrite or clear textarea value when JSON is fundamentally unparseable', () => {
      const ta = document.createElement('textarea')
      const invalid = '{"unclosed": '
      ta.value = invalid

      const res = formatTextareaJson(ta)
      expect(res.success).toBe(false)
      expect(ta.value).toBe(invalid)
    })
  })
})
