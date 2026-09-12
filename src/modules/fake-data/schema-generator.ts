import { detectGenerator } from './detect'
import { generate, type GeneratorKey, type Rng } from './generators'

export type GenerationMode = 'realistic' | 'minimal' | 'boundary' | 'fuzzing'

export interface SchemaGeneratorOptions {
  mode?: GenerationMode
  arrayCount?: number
  rng?: Rng
}

export interface OpenAPISchema {
  type?: string
  format?: string
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  items?: OpenAPISchema
  enum?: unknown[]
  example?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  description?: string
  [key: string]: unknown
}

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)] as T
}

/**
 * Generate a value from an OpenAPI schema definition according to the selected mode.
 */
export function generateFromSchema(
  schema: OpenAPISchema | undefined,
  propertyName = '',
  options: SchemaGeneratorOptions = {},
  depth = 0,
): unknown {
  const mode = options.mode ?? 'realistic'
  const rng = options.rng ?? Math.random
  const arrayCount = Math.max(1, Math.min(20, options.arrayCount ?? 2))

  if (depth > 6) return null
  if (!schema || typeof schema !== 'object') {
    return generateFallbackValue(propertyName, mode, rng)
  }

  // Handle enum
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (mode === 'fuzzing' && rng() < 0.3) {
      return generate('xssVector', rng)
    }
    return pick(rng, schema.enum)
  }

  // Fuzzing Mode overrides
  if (mode === 'fuzzing') {
    return generateFuzzingValue(schema, propertyName, rng)
  }

  // Boundary / Edge-case Mode overrides
  if (mode === 'boundary') {
    return generateBoundaryValue(schema, propertyName, rng)
  }

  // Determine type
  const type =
    schema.type || (schema.properties ? 'object' : schema.items ? 'array' : typeof schema.example)

  if (type === 'object' || schema.properties) {
    const props = schema.properties || {}
    const requiredKeys = new Set(schema.required || [])
    const result: Record<string, unknown> = {}

    for (const [key, propSchema] of Object.entries(props)) {
      if (mode === 'minimal' && requiredKeys.size > 0 && !requiredKeys.has(key)) {
        continue
      }
      result[key] = generateFromSchema(propSchema, key, options, depth + 1)
    }
    return result
  }

  if (type === 'array' || schema.items) {
    const itemSchema = schema.items || {}
    const count = mode === 'minimal' ? 1 : arrayCount
    return Array.from({ length: count }, () =>
      generateFromSchema(itemSchema, `${propertyName}Item`, options, depth + 1),
    )
  }

  return generatePrimitiveValue(schema, propertyName, rng)
}

function generatePrimitiveValue(schema: OpenAPISchema, key: string, rng: Rng): unknown {
  const format = schema.format?.toLowerCase()

  // Specific OpenAPI format hints
  if (format === 'date') return generate('date', rng)
  if (format === 'date-time') return generate('datetime', rng)
  if (format === 'email') return generate('email', rng)
  if (format === 'uuid' || format === 'guid') return generate('uuid', rng)
  if (format === 'uri' || format === 'url') return generate('url', rng)
  if (format === 'ipv4') return generate('ipv4', rng)
  if (format === 'ipv6') return generate('ipv6', rng)
  if (format === 'password') return generate('password', rng)
  if (format === 'byte' || format === 'binary') return 'dGVzdA=='

  // Key-name heuristic detection
  const detected = detectGenerator(key, schema.example ?? schema.default)
  if (detected) {
    return generate(detected, rng)
  }

  // Type fallbacks
  if (schema.type === 'integer') return generate('integer', rng)
  if (schema.type === 'number') return generate('decimal', rng)
  if (schema.type === 'boolean') return generate('boolean', rng)

  return generate('loremSentence', rng)
}

function generateFuzzingValue(schema: OpenAPISchema, key: string, rng: Rng): unknown {
  const type = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string')

  if (type === 'object' || schema.properties) {
    const props = schema.properties || {}
    const result: Record<string, unknown> = {}
    for (const [k, s] of Object.entries(props)) {
      result[k] = generateFromSchema(s, k, { mode: 'fuzzing', rng })
    }
    return result
  }

  if (type === 'array' || schema.items) {
    return [generateFromSchema(schema.items || {}, `${key}Item`, { mode: 'fuzzing', rng })]
  }

  if (type === 'integer' || type === 'number') {
    return generate('boundaryNumber', rng)
  }

  if (type === 'boolean') {
    return generate('boolean', rng)
  }

  const fuzzGenerators: GeneratorKey[] = ['sqliVector', 'xssVector', 'unicodeEmojiVector']
  return generate(pick(rng, fuzzGenerators), rng)
}

function generateBoundaryValue(schema: OpenAPISchema, key: string, rng: Rng): unknown {
  const type = schema.type || (schema.properties ? 'object' : schema.items ? 'array' : 'string')

  if (type === 'object' || schema.properties) {
    const props = schema.properties || {}
    const result: Record<string, unknown> = {}
    for (const [k, s] of Object.entries(props)) {
      result[k] = generateFromSchema(s, k, { mode: 'boundary', rng })
    }
    return result
  }

  if (type === 'array' || schema.items) {
    return [generateFromSchema(schema.items || {}, `${key}Item`, { mode: 'boundary', rng })]
  }

  if (type === 'integer' || type === 'number') {
    if (typeof schema.maximum === 'number') return schema.maximum
    if (typeof schema.minimum === 'number') return schema.minimum
    return generate('boundaryNumber', rng)
  }

  if (type === 'boolean') return false

  if (typeof schema.maxLength === 'number' && schema.maxLength > 0) {
    return 'X'.repeat(Math.min(schema.maxLength, 1000))
  }

  return generate('boundaryString', rng)
}

function generateFallbackValue(key: string, mode: GenerationMode, rng: Rng): unknown {
  if (mode === 'fuzzing') return generate('xssVector', rng)
  if (mode === 'boundary') return generate('boundaryString', rng)
  const detected = detectGenerator(key)
  return detected ? generate(detected, rng) : generate('loremSentence', rng)
}

/**
 * Synthesize a mock payload from a sample JSON template object.
 * Applies the requested mode and generates realistic, minimal, boundary, or fuzzing data.
 */
export function synthesizeFromJsonSample(
  sample: unknown,
  options: SchemaGeneratorOptions = {},
): unknown {
  const mode = options.mode ?? 'realistic'
  const rng = options.rng ?? Math.random

  if (sample === null || sample === undefined) return null

  if (Array.isArray(sample)) {
    const templateItem = sample[0] ?? { id: 1 }
    const count = mode === 'minimal' ? 1 : (options.arrayCount ?? 2)
    return Array.from({ length: count }, () => synthesizeFromJsonSample(templateItem, options))
  }

  if (typeof sample === 'object') {
    const result: Record<string, unknown> = {}
    const entries = Object.entries(sample as Record<string, unknown>)
    for (const [key, value] of entries) {
      if (typeof value === 'object' && value !== null) {
        result[key] = synthesizeFromJsonSample(value, options)
      } else {
        if (mode === 'fuzzing') {
          result[key] = generateFuzzingValue({ type: typeof value }, key, rng)
        } else if (mode === 'boundary') {
          result[key] = generateBoundaryValue({ type: typeof value }, key, rng)
        } else {
          const detected = detectGenerator(key, value)
          if (detected) {
            result[key] = generate(detected, rng)
          } else if (
            mode === 'realistic' &&
            typeof value === 'string' &&
            (value.toLowerCase() === 'string' || value.toLowerCase() === 'str' || value === '')
          ) {
            const clean = key.replace(/[^a-zA-Z0-9]/g, ' ').trim()
            const word = clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : 'Sample'
            result[key] = `${word} ${randInt(rng, 10, 99)}`
          } else {
            result[key] = value
          }
        }
      }
    }
    return result
  }

  return sample
}
