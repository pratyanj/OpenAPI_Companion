import type {
  NormalizedSpec,
  NormalizedOperation,
  NormalizedParam,
  NormalizedRequestBody,
  NormalizedResponse,
  NormalizedSchemaProperty,
} from './types'

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head']

/** Deterministic FNV-1a 32-bit hash converted to hex string */
export function computeHash(content: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function normalizeSchemaProperties(schema: any): {
  properties: Record<string, NormalizedSchemaProperty>
  requiredFields: string[]
} {
  const properties: Record<string, NormalizedSchemaProperty> = {}
  const requiredFields: string[] = Array.isArray(schema?.required) ? schema.required : []

  if (schema?.properties && typeof schema.properties === 'object') {
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      if (!propDef || typeof propDef !== 'object') continue
      const p = propDef as any
      properties[propName] = {
        name: propName,
        type: p.type ?? (p.enum ? 'string' : undefined),
        format: p.format,
        required: requiredFields.includes(propName),
        enum: Array.isArray(p.enum) ? p.enum.map(String) : undefined,
      }
    }
  }

  return { properties, requiredFields }
}

export function normalizeOpenApiSpec(rawSpec: unknown): NormalizedSpec {
  let spec: any = rawSpec

  if (typeof rawSpec === 'string') {
    try {
      spec = JSON.parse(rawSpec)
    } catch {
      spec = {}
    }
  }

  if (!spec || typeof spec !== 'object') {
    spec = {}
  }

  const title: string | undefined = spec.info?.title
  const version: string | undefined = spec.info?.version
  const operations: Record<string, NormalizedOperation> = {}

  const paths = spec.paths && typeof spec.paths === 'object' ? spec.paths : {}

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const item = pathItem as any
    const pathParams: any[] = Array.isArray(item.parameters) ? item.parameters : []

    for (const method of HTTP_METHODS) {
      const op = item[method]
      if (!op || typeof op !== 'object') continue

      const endpointId = `${method.toLowerCase()} ${rawPath}`
      const opParams: any[] = Array.isArray(op.parameters) ? op.parameters : []
      const mergedParams = [...pathParams, ...opParams]

      const params: Record<string, NormalizedParam> = {}
      let swagger2BodyParam: any = null

      for (const p of mergedParams) {
        if (!p || typeof p !== 'object' || !p.name) continue
        const paramIn = (p.in || 'query').toLowerCase()

        if (paramIn === 'body') {
          swagger2BodyParam = p
          continue
        }

        const key = `${paramIn}:${p.name}`
        params[key] = {
          name: p.name,
          in: paramIn as 'query' | 'path' | 'header' | 'cookie',
          required: Boolean(p.required || paramIn === 'path'),
          type: p.schema?.type ?? p.type,
          format: p.schema?.format ?? p.format,
          enum: Array.isArray(p.schema?.enum ?? p.enum)
            ? (p.schema?.enum ?? p.enum).map(String)
            : undefined,
        }
      }

      // Request Body normalization (OAS 3 or Swagger 2)
      let requestBody: NormalizedRequestBody | undefined

      if (op.requestBody && typeof op.requestBody === 'object') {
        // OAS 3.x
        const content = op.requestBody.content || {}
        const contentType =
          Object.keys(content).find((k) => k.includes('json')) || Object.keys(content)[0] || 'application/json'
        const bodySchema = content[contentType]?.schema || {}
        const { properties, requiredFields } = normalizeSchemaProperties(bodySchema)

        requestBody = {
          required: Boolean(op.requestBody.required),
          contentType,
          properties,
          requiredFields,
        }
      } else if (swagger2BodyParam) {
        // Swagger 2.0
        const bodySchema = swagger2BodyParam.schema || {}
        const { properties, requiredFields } = normalizeSchemaProperties(bodySchema)

        requestBody = {
          required: Boolean(swagger2BodyParam.required),
          contentType: 'application/json',
          properties,
          requiredFields,
        }
      }

      // Responses normalization
      const responses: Record<string, NormalizedResponse> = {}
      if (op.responses && typeof op.responses === 'object') {
        for (const [code, respObj] of Object.entries(op.responses)) {
          if (!respObj || typeof respObj !== 'object') continue
          const r = respObj as any
          const schema = r.content?.['application/json']?.schema || r.schema
          const { properties } = schema ? normalizeSchemaProperties(schema) : { properties: {} }

          responses[code] = {
            statusCode: code,
            description: r.description,
            properties: Object.keys(properties).length > 0 ? properties : undefined,
          }
        }
      }

      operations[endpointId] = {
        endpointId,
        method: method.toLowerCase(),
        path: rawPath,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        tags: Array.isArray(op.tags) ? op.tags : undefined,
        params,
        requestBody,
        responses,
      }
    }
  }

  // Canonicalize content string for deterministic hashing
  const sortedEndpointIds = Object.keys(operations).sort()
  const canonicalSummary = sortedEndpointIds.map((id) => {
    const o = operations[id]!
    return `${o.endpointId}|params:${Object.keys(o.params).sort().join(',')}|bodyReq:${Boolean(o.requestBody?.required)}|bodyProps:${Object.keys(o.requestBody?.properties ?? {}).sort().join(',')}|resps:${Object.keys(o.responses).sort().join(',')}`
  }).join('||')

  const sortedOperations: Record<string, NormalizedOperation> = {}
  for (const id of sortedEndpointIds) {
    sortedOperations[id] = operations[id]!
  }

  const hash = computeHash(canonicalSummary)

  return {
    title,
    version,
    hash,
    operations: sortedOperations,
    timestamp: Date.now(),
  }
}
