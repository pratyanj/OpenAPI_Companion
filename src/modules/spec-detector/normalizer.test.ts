import { describe, it, expect } from 'vitest'
import { normalizeOpenApiSpec, computeHash } from './normalizer'

describe('OpenAPI Spec Normalizer', () => {
  it('computes deterministic FNV-1a hash', () => {
    const h1 = computeHash('GET /users||POST /users')
    const h2 = computeHash('GET /users||POST /users')
    const h3 = computeHash('GET /users||POST /items')

    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(typeof h1).toBe('string')
  })

  it('normalizes an OpenAPI 3.0 specification with operations, parameters, and bodies', () => {
    const sampleOas3 = {
      openapi: '3.0.1',
      info: { title: 'User Service', version: '1.2.0' },
      paths: {
        '/users/{id}': {
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          ],
          get: {
            summary: 'Get user by ID',
            parameters: [
              { name: 'includeDetails', in: 'query', schema: { type: 'boolean' } },
            ],
            responses: {
              '200': {
                description: 'User found',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
          delete: {
            summary: 'Delete user',
            responses: {
              '204': { description: 'Deleted' },
            },
          },
        },
        '/users': {
          post: {
            summary: 'Create user',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['email'],
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string', format: 'email' },
                    },
                  },
                },
              },
            },
            responses: {
              '201': { description: 'Created' },
            },
          },
        },
      },
    }

    const normalized = normalizeOpenApiSpec(sampleOas3)

    expect(normalized.title).toBe('User Service')
    expect(normalized.version).toBe('1.2.0')
    expect(normalized.hash).toBeDefined()
    expect(Object.keys(normalized.operations)).toEqual([
      'delete /users/{id}',
      'get /users/{id}',
      'post /users',
    ])

    const getOp = normalized.operations['get /users/{id}']!
    expect(getOp.params['path:id']).toEqual({
      name: 'id',
      in: 'path',
      required: true,
      type: 'integer',
      format: undefined,
      enum: undefined,
    })
    expect(getOp.params['query:includeDetails']).toEqual({
      name: 'includeDetails',
      in: 'query',
      required: false,
      type: 'boolean',
      format: undefined,
      enum: undefined,
    })

    const postOp = normalized.operations['post /users']!
    expect(postOp.requestBody?.required).toBe(true)
    expect(postOp.requestBody?.requiredFields).toContain('email')
    expect(postOp.requestBody?.properties['email']?.required).toBe(true)
    expect(postOp.requestBody?.properties['name']?.required).toBe(false)
  })

  it('normalizes Swagger 2.0 specs with body parameters', () => {
    const swagger2 = {
      swagger: '2.0',
      info: { title: 'Legacy Store API' },
      paths: {
        '/store/order': {
          post: {
            parameters: [
              {
                name: 'body',
                in: 'body',
                required: true,
                schema: {
                  type: 'object',
                  required: ['orderId'],
                  properties: {
                    orderId: { type: 'string' },
                    amount: { type: 'number' },
                  },
                },
              },
            ],
            responses: {
              '200': { description: 'Order Placed' },
            },
          },
        },
      },
    }

    const normalized = normalizeOpenApiSpec(swagger2)
    const op = normalized.operations['post /store/order']!
    expect(op.requestBody?.required).toBe(true)
    expect(op.requestBody?.requiredFields).toContain('orderId')
    expect(op.requestBody?.properties['orderId']?.type).toBe('string')
  })

  it('handles empty or malformed specs gracefully', () => {
    const normalized = normalizeOpenApiSpec(null)
    expect(normalized.operations).toEqual({})
    expect(typeof normalized.hash).toBe('string')
  })
})
