import { describe, it, expect } from 'vitest'
import {
  generateFromSchema,
  synthesizeFromJsonSample,
  type OpenAPISchema,
} from './schema-generator'

describe('generateFromSchema', () => {
  const userSchema: OpenAPISchema = {
    type: 'object',
    required: ['id', 'email', 'name'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      bio: { type: 'string' },
      age: { type: 'integer', minimum: 18, maximum: 120 },
      isVerified: { type: 'boolean' },
      tags: {
        type: 'array',
        items: { type: 'string' },
      },
      role: {
        type: 'string',
        enum: ['admin', 'editor', 'viewer'],
      },
    },
  }

  it('generates realistic payload for all fields in realistic mode', () => {
    const data = generateFromSchema(userSchema, 'user', {
      mode: 'realistic',
      arrayCount: 3,
    }) as Record<string, unknown>
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('email')
    expect(data).toHaveProperty('name')
    expect(data).toHaveProperty('bio')
    expect(data).toHaveProperty('age')
    expect(data).toHaveProperty('isVerified')
    expect(Array.isArray(data.tags)).toBe(true)
    expect((data.tags as string[]).length).toBe(3)
    expect(['admin', 'editor', 'viewer']).toContain(data.role)
  })

  it('generates only required fields in minimal mode', () => {
    const data = generateFromSchema(userSchema, 'user', { mode: 'minimal' }) as Record<
      string,
      unknown
    >
    expect(data).toHaveProperty('id')
    expect(data).toHaveProperty('email')
    expect(data).toHaveProperty('name')
    expect(data).not.toHaveProperty('bio')
    expect(data).not.toHaveProperty('age')
  })

  it('injects boundary numbers and strings in boundary mode', () => {
    const data = generateFromSchema(userSchema, 'user', { mode: 'boundary' }) as Record<
      string,
      unknown
    >
    expect(typeof data.age).toBe('number')
    expect(data.age).toBe(120) // maximum boundary
  })

  it('injects fuzzing vectors in fuzzing mode', () => {
    const data = generateFromSchema(userSchema, 'user', { mode: 'fuzzing' }) as Record<
      string,
      unknown
    >
    expect(typeof data.name).toBe('string')
    expect(typeof data.email).toBe('string')
  })
})

describe('synthesizeFromJsonSample', () => {
  it('synthesizes realistic values from sample object template', () => {
    const sample = {
      username: 'jdoe',
      email: 'john@example.com',
      age: 25,
      active: true,
      address: {
        city: 'Metropolis',
        postalCode: '10001',
      },
    }

    const synthesized = synthesizeFromJsonSample(sample, { mode: 'realistic' }) as typeof sample
    expect(synthesized.username).not.toBe('jdoe')
    expect(synthesized.email).toMatch(/@/)
    expect(typeof synthesized.age).toBe('number')
    expect(typeof synthesized.active).toBe('boolean')
    expect(typeof synthesized.address.city).toBe('string')
  })

  it('synthesizes realistic values for dummy OpenAPI string fields', () => {
    const sample = {
      title: 'string',
      category: 'string',
      count: 5,
    }
    const synthesized = synthesizeFromJsonSample(sample, { mode: 'realistic' }) as typeof sample
    expect(synthesized.title).not.toBe('string')
    expect(synthesized.category).toMatch(/^Category \d+$/)
    expect(typeof synthesized.count).toBe('number')
  })
})
