import { describe, it, expect } from 'vitest'
import {
  parseDotEnv,
  serializeDotEnv,
  parsePostmanEnv,
  exportPostmanEnv,
  parseJsonVariables,
  detectVariableContent,
} from './env-parser'

describe('env-parser', () => {
  describe('parseDotEnv', () => {
    it('parses basic KEY=value lines and ignores comments and blanks', () => {
      const input = `
# Server config
PORT=8080
HOST=localhost

# Empty lines above
API_KEY=xyz123
`
      const result = parseDotEnv(input)
      expect(result.variables).toEqual({
        PORT: '8080',
        HOST: 'localhost',
        API_KEY: 'xyz123',
      })
      expect(result.secrets).toContain('API_KEY')
    })

    it('handles export prefix', () => {
      const input = `export APP_ENV=production\nexport DB_NAME=testdb`
      const result = parseDotEnv(input)
      expect(result.variables).toEqual({
        APP_ENV: 'production',
        DB_NAME: 'testdb',
      })
    })

    it('handles quoted strings with escaped characters', () => {
      const input = `
GREETING="Hello \\"World\\"\nNew Line"
SINGLE_QUOTE='Simple string'
`
      const result = parseDotEnv(input)
      expect(result.variables.GREETING).toBe('Hello "World"\nNew Line')
      expect(result.variables.SINGLE_QUOTE).toBe('Simple string')
    })

    it('strips unquoted trailing comments', () => {
      const input = `TIMEOUT=5000 # in milliseconds`
      const result = parseDotEnv(input)
      expect(result.variables.TIMEOUT).toBe('5000')
    })
  })

  describe('serializeDotEnv', () => {
    it('serializes variables to .env format', () => {
      const vars = {
        BASE_URL: 'https://api.example.com',
        PORT: '3000',
      }
      const output = serializeDotEnv(vars)
      expect(output).toBe('BASE_URL=https://api.example.com\nPORT=3000')
    })

    it('quotes values containing special characters or newlines', () => {
      const vars = {
        NOTE: 'Line 1\nLine 2',
        WITH_HASH: 'foo#bar',
      }
      const output = serializeDotEnv(vars)
      expect(output).toContain('NOTE="Line 1\\nLine 2"')
      expect(output).toContain('WITH_HASH="foo#bar"')
    })

    it('masks secrets if maskSecrets option is true', () => {
      const vars = {
        TOKEN: 'secret-token-value',
        USER: 'john',
      }
      const output = serializeDotEnv(vars, ['TOKEN'], { maskSecrets: true })
      expect(output).toContain('TOKEN=••••••••')
      expect(output).toContain('USER=john')
    })
  })

  describe('parsePostmanEnv', () => {
    it('parses Postman environment JSON and identifies secrets', () => {
      const postmanJson = JSON.stringify({
        id: '123',
        name: 'Staging Env',
        values: [
          { key: 'API_URL', value: 'https://staging.api.com', enabled: true, type: 'default' },
          { key: 'AUTH_SECRET', value: 'shh', enabled: true, type: 'secret' },
          { key: 'DISABLED_KEY', value: 'skip me', enabled: false, type: 'default' },
        ],
      })

      const result = parsePostmanEnv(postmanJson)
      expect(result.name).toBe('Staging Env')
      expect(result.variables).toEqual({
        API_URL: 'https://staging.api.com',
        AUTH_SECRET: 'shh',
      })
      expect(result.secrets).toContain('AUTH_SECRET')
      expect(result.variables.DISABLED_KEY).toBeUndefined()
    })
  })

  describe('exportPostmanEnv', () => {
    it('exports variables into valid Postman format', () => {
      const vars = {
        API_URL: 'https://api.com',
        API_KEY: 'secret123',
      }
      const json = exportPostmanEnv('My Environment', vars, ['API_KEY'])
      const parsed = JSON.parse(json)
      expect(parsed.name).toBe('My Environment')
      expect(parsed.values).toHaveLength(2)
      const secretVal = parsed.values.find((v: { key: string }) => v.key === 'API_KEY')
      expect(secretVal.type).toBe('secret')
      expect(secretVal.value).toBe('secret123')
    })

    it('masks secrets in Postman export if requested', () => {
      const vars = {
        API_KEY: 'secret123',
      }
      const json = exportPostmanEnv('My Environment', vars, ['API_KEY'], { maskSecrets: true })
      const parsed = JSON.parse(json)
      const secretVal = parsed.values.find((v: { key: string }) => v.key === 'API_KEY')
      expect(secretVal.value).toBe('••••••••')
    })
  })

  describe('parseJsonVariables', () => {
    it('parses flat JSON objects with primitives and converts to string values', () => {
      const json = JSON.stringify({
        API_URL: 'https://api.dev.com',
        PORT: 8080,
        DEBUG: true,
        EMPTY: null,
      })
      const result = parseJsonVariables(json)
      expect(result.variables).toEqual({
        API_URL: 'https://api.dev.com',
        PORT: '8080',
        DEBUG: 'true',
        EMPTY: '',
      })
    })

    it('flattens nested objects into underscore paths by default', () => {
      const json = JSON.stringify({
        user: {
          id: 101,
          profile: {
            role: 'lead_dev',
            token: 'user_jwt_token',
          },
        },
        active: true,
      })
      const result = parseJsonVariables(json)
      expect(result.variables).toEqual({
        user_id: '101',
        user_profile_role: 'lead_dev',
        user_profile_token: 'user_jwt_token',
        active: 'true',
      })
      expect(result.secrets).toContain('user_profile_token')
    })

    it('stringifies nested objects if flattenNested is set to false', () => {
      const json = JSON.stringify({
        config: { timeout: 5000 },
      })
      const result = parseJsonVariables(json, { flattenNested: false })
      expect(result.variables.config).toBe('{"timeout":5000}')
    })

    it('parses arrays of key/value or name/value pairs', () => {
      const json = JSON.stringify([
        { key: 'API_KEY', value: 'secret99', type: 'secret' },
        { name: 'BASE_PATH', value: '/v1' },
      ])
      const result = parseJsonVariables(json)
      expect(result.variables).toEqual({
        API_KEY: 'secret99',
        BASE_PATH: '/v1',
      })
      expect(result.secrets).toContain('API_KEY')
    })

    it('delegates Postman environment JSON automatically', () => {
      const json = JSON.stringify({
        name: 'Staging',
        values: [{ key: 'HOST', value: 'api.io', enabled: true }],
      })
      const result = parseJsonVariables(json)
      expect(result.variables).toEqual({ HOST: 'api.io' })
    })
  })

  describe('detectVariableContent', () => {
    it('detects standard raw JSON objects', () => {
      const detected = detectVariableContent('{\n  "API_KEY": "123",\n  "HOST": "localhost"\n}')
      expect(detected.format).toBe('json')
      expect(detected.variables).toEqual({ API_KEY: '123', HOST: 'localhost' })
      expect(detected.secrets).toContain('API_KEY')
      expect(detected.error).toBeUndefined()
    })

    it('detects Postman environment JSON with values array', () => {
      const detected = detectVariableContent(
        '{\n  "name": "Production",\n  "values": [{ "key": "URL", "value": "https://prod.com" }]\n}',
      )
      expect(detected.format).toBe('postman')
      expect(detected.name).toBe('Production')
      expect(detected.variables.URL).toBe('https://prod.com')
    })

    it('detects standard .env content', () => {
      const detected = detectVariableContent('PORT=3000\nHOST=127.0.0.1')
      expect(detected.format).toBe('dotenv')
      expect(detected.variables).toEqual({ PORT: '3000', HOST: '127.0.0.1' })
    })

    it('returns invalid format when JSON syntax is broken', () => {
      const detected = detectVariableContent('{ "unclosed": 123 ')
      expect(detected.format).toBe('invalid')
      expect(detected.error).toBeDefined()
    })

    it('returns unknown format for empty or unrecognizable content', () => {
      expect(detectVariableContent('').format).toBe('unknown')
      expect(detectVariableContent('   ').format).toBe('unknown')
    })
  })
})
