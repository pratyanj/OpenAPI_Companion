import { describe, it, expect } from 'vitest'
import { parseDotEnv, serializeDotEnv, parsePostmanEnv, exportPostmanEnv } from './env-parser'

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
})
