import { describe, it, expect } from 'vitest'
import { diffOpenApiSpecs } from './diff-engine'
import { normalizeOpenApiSpec } from './normalizer'

describe('OpenAPI Spec Diff Engine', () => {
  const baseSpecRaw = {
    openapi: '3.0.0',
    info: { title: 'Store API', version: '1.0.0' },
    paths: {
      '/products': {
        get: {
          summary: 'List products',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'category', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': {
              description: 'Success',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        post: {
          summary: 'Create product',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title'],
                  properties: {
                    title: { type: 'string' },
                    price: { type: 'number' },
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
      '/products/{id}': {
        get: {
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Product' },
            '404': { description: 'Not found' },
          },
        },
      },
    },
  }

  it('returns no changes when comparing identical specs', () => {
    const spec1 = normalizeOpenApiSpec(baseSpecRaw)
    const spec2 = normalizeOpenApiSpec(baseSpecRaw)

    const diff = diffOpenApiSpecs(spec1, spec2)
    expect(diff.hasChanges).toBe(false)
    expect(diff.totalChanges).toBe(0)
    expect(diff.hasBreakingChanges).toBe(false)
    expect(diff.changes).toHaveLength(0)
  })

  it('detects added and removed endpoints', () => {
    const oldSpec = normalizeOpenApiSpec(baseSpecRaw)

    const newSpecRaw = {
      ...baseSpecRaw,
      paths: {
        '/products': baseSpecRaw.paths['/products'],
        '/orders': {
          get: {
            summary: 'List orders',
            responses: { '200': { description: 'Orders' } },
          },
        },
      },
    }
    const newSpec = normalizeOpenApiSpec(newSpecRaw)

    const diff = diffOpenApiSpecs(oldSpec, newSpec)
    expect(diff.hasChanges).toBe(true)

    // Removed: /products/{id} (breaking)
    const removed = diff.changes.find((c) => c.type === 'endpoint_removed')
    expect(removed).toBeDefined()
    expect(removed?.severity).toBe('breaking')
    expect(removed?.endpointId).toBe('get /products/{id}')

    // Added: /orders (info)
    const added = diff.changes.find((c) => c.type === 'endpoint_added')
    expect(added).toBeDefined()
    expect(added?.severity).toBe('info')
    expect(added?.endpointId).toBe('get /orders')
  })

  it('detects path parameter renames as breaking change instead of removal', () => {
    const oldSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/users/{userId}/posts': {
          get: {
            parameters: [{ name: 'userId', in: 'path', required: true }],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const newSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/users/{id}/posts': {
          get: {
            parameters: [{ name: 'id', in: 'path', required: true }],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const diff = diffOpenApiSpecs(oldSpec, newSpec)
    const renameChange = diff.changes.find((c) => c.type === 'path_param_changed')
    expect(renameChange).toBeDefined()
    expect(renameChange?.severity).toBe('breaking')
    expect(diff.changes.some((c) => c.type === 'endpoint_removed')).toBe(false)
    expect(diff.changes.some((c) => c.type === 'endpoint_added')).toBe(false)
  })

  it('detects parameter modifications: required added, removed, type change, enum changes', () => {
    const oldSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/search': {
          get: {
            parameters: [
              { name: 'q', in: 'query', schema: { type: 'string' } },
              {
                name: 'sort',
                in: 'query',
                schema: { type: 'string', enum: ['asc', 'desc', 'date'] },
              },
              { name: 'filter', in: 'query', schema: { type: 'string' } },
              { name: 'page', in: 'query', schema: { type: 'integer' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const newSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/search': {
          get: {
            parameters: [
              // q is now required (breaking)
              { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
              // sort removed 'date' enum (breaking)
              { name: 'sort', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
              // filter was removed (warning)
              // page changed type to string (breaking)
              { name: 'page', in: 'query', schema: { type: 'string' } },
              // newly added required param authKey (breaking)
              { name: 'authKey', in: 'query', required: true, schema: { type: 'string' } },
              // newly added optional param debug (info)
              { name: 'debug', in: 'query', required: false, schema: { type: 'boolean' } },
            ],
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const diff = diffOpenApiSpecs(oldSpec, newSpec)
    expect(diff.hasBreakingChanges).toBe(true)

    expect(
      diff.changes.some((c) => c.type === 'param_required_changed' && c.severity === 'breaking'),
    ).toBe(true)
    expect(diff.changes.some((c) => c.type === 'enum_changed' && c.severity === 'breaking')).toBe(
      true,
    )
    expect(diff.changes.some((c) => c.type === 'param_removed' && c.severity === 'warning')).toBe(
      true,
    )
    expect(
      diff.changes.some((c) => c.type === 'param_type_changed' && c.severity === 'breaking'),
    ).toBe(true)
    expect(diff.changes.some((c) => c.type === 'param_added' && c.severity === 'breaking')).toBe(
      true,
    )
    expect(diff.changes.some((c) => c.type === 'param_added' && c.severity === 'info')).toBe(true)
  })

  it('detects request body modifications: required toggle, property additions and removals', () => {
    const oldSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/items': {
          post: {
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['sku'],
                    properties: {
                      sku: { type: 'string' },
                      legacyCode: { type: 'string' },
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const newSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/items': {
          post: {
            requestBody: {
              // Body is now required (breaking)
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    // name is now required (breaking)
                    required: ['sku', 'name'],
                    properties: {
                      sku: { type: 'string' },
                      name: { type: 'string' },
                      // legacyCode was removed (warning)
                      discount: { type: 'number' }, // optional addition (info)
                    },
                  },
                },
              },
            },
            responses: { '200': { description: 'OK' } },
          },
        },
      },
    })

    const diff = diffOpenApiSpecs(oldSpec, newSpec)
    expect(
      diff.changes.some(
        (c) => c.type === 'request_body_required_changed' && c.severity === 'breaking',
      ),
    ).toBe(true)
    expect(
      diff.changes.some(
        (c) => c.type === 'request_body_property_added' && c.severity === 'breaking',
      ),
    ).toBe(true)
    expect(
      diff.changes.some((c) => c.type === 'request_body_property_added' && c.severity === 'info'),
    ).toBe(true)
    expect(
      diff.changes.some(
        (c) => c.type === 'request_body_property_removed' && c.severity === 'warning',
      ),
    ).toBe(true)
  })

  it('detects response changes: code removed, property removed or type altered', () => {
    const oldSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/data': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        count: { type: 'integer' },
                        items: { type: 'array' },
                      },
                    },
                  },
                },
              },
              '404': { description: 'Not Found' },
            },
          },
        },
      },
    })

    const newSpec = normalizeOpenApiSpec({
      openapi: '3.0.0',
      paths: {
        '/data': {
          get: {
            responses: {
              '200': {
                description: 'OK',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        count: { type: 'string' }, // type changed (breaking)
                        // items removed (breaking)
                        extra: { type: 'boolean' }, // info
                      },
                    },
                  },
                },
              },
              // 404 removed (breaking)
            },
          },
        },
      },
    })

    const diff = diffOpenApiSpecs(oldSpec, newSpec)
    expect(
      diff.changes.some((c) => c.type === 'response_status_removed' && c.severity === 'breaking'),
    ).toBe(true)
    expect(
      diff.changes.some((c) => c.type === 'response_property_removed' && c.severity === 'breaking'),
    ).toBe(true)
    expect(
      diff.changes.some((c) => c.type === 'response_type_changed' && c.severity === 'breaking'),
    ).toBe(true)
  })
})
