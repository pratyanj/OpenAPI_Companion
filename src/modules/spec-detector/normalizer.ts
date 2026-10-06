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

function normalizeSchemaProperties(schema: Record<string, unknown> | null | undefined): {
  properties: Record<string, NormalizedSchemaProperty>
  requiredFields: string[]
} {
  const properties: Record<string, NormalizedSchemaProperty> = {}
  const requiredFields: string[] = Array.isArray(schema?.required)
    ? (schema.required as unknown[]).filter((r): r is string => typeof r === 'string')
    : []

  if (schema?.properties && typeof schema.properties === 'object') {
    for (const [propName, propDef] of Object.entries(
      schema.properties as Record<string, unknown>,
    )) {
      if (!propDef || typeof propDef !== 'object') continue
      const p = propDef as Record<string, unknown>
      properties[propName] = {
        name: propName,
        type: (p.type as string | undefined) ?? (p.enum ? 'string' : undefined),
        format: p.format as string | undefined,
        required: requiredFields.includes(propName),
        enum: Array.isArray(p.enum) ? p.enum.map(String) : undefined,
      }
    }
  }

  return { properties, requiredFields }
}

export function normalizeOpenApiSpec(rawSpec: unknown): NormalizedSpec {
  let spec: Record<string, unknown> = {}

  if (typeof rawSpec === 'string') {
    try {
      const parsed = JSON.parse(rawSpec)
      if (parsed && typeof parsed === 'object') {
        spec = parsed as Record<string, unknown>
      }
    } catch {
      spec = {}
    }
  } else if (rawSpec && typeof rawSpec === 'object') {
    spec = rawSpec as Record<string, unknown>
  }

  const info = (spec.info && typeof spec.info === 'object' ? spec.info : {}) as Record<
    string,
    unknown
  >
  const title: string | undefined = typeof info.title === 'string' ? info.title : undefined
  const version: string | undefined = typeof info.version === 'string' ? info.version : undefined
  const operations: Record<string, NormalizedOperation> = {}

  const paths = (spec.paths && typeof spec.paths === 'object' ? spec.paths : {}) as Record<
    string,
    unknown
  >

  for (const [rawPath, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue
    const item = pathItem as Record<string, unknown>
    const pathParams: Record<string, unknown>[] = Array.isArray(item.parameters)
      ? (item.parameters as Record<string, unknown>[])
      : []

    for (const method of HTTP_METHODS) {
      const op = item[method] as Record<string, unknown> | undefined
      if (!op || typeof op !== 'object') continue

      const endpointId = `${method.toLowerCase()} ${rawPath}`
      const opParams: Record<string, unknown>[] = Array.isArray(op.parameters)
        ? (op.parameters as Record<string, unknown>[])
        : []
      const mergedParams = [...pathParams, ...opParams]

      const params: Record<string, NormalizedParam> = {}
      let swagger2BodyParam: Record<string, unknown> | null = null

      for (const p of mergedParams) {
        if (!p || typeof p !== 'object' || !p.name) continue
        const paramIn = String(p.in || 'query').toLowerCase()

        if (paramIn === 'body') {
          swagger2BodyParam = p
          continue
        }

        const paramName = String(p.name)
        const key = `${paramIn}:${paramName}`
        const schema = (p.schema && typeof p.schema === 'object' ? p.schema : {}) as Record<
          string,
          unknown
        >
        const pEnum = Array.isArray(schema.enum)
          ? schema.enum
          : Array.isArray(p.enum)
            ? p.enum
            : undefined

        params[key] = {
          name: paramName,
          in: paramIn as 'query' | 'path' | 'header' | 'cookie',
          required: Boolean(p.required || paramIn === 'path'),
          type: (schema.type as string | undefined) ?? (p.type as string | undefined),
          format: (schema.format as string | undefined) ?? (p.format as string | undefined),
          enum: pEnum ? pEnum.map(String) : undefined,
        }
      }

      // Request Body normalization (OAS 3 or Swagger 2)
      let requestBody: NormalizedRequestBody | undefined

      if (op.requestBody && typeof op.requestBody === 'object') {
        // OAS 3.x
        const reqBody = op.requestBody as Record<string, unknown>
        const content = (
          reqBody.content && typeof reqBody.content === 'object' ? reqBody.content : {}
        ) as Record<string, Record<string, unknown>>
        const contentType =
          Object.keys(content).find((k) => k.includes('json')) ||
          Object.keys(content)[0] ||
          'application/json'
        const bodySchema =
          content[contentType]?.schema && typeof content[contentType]?.schema === 'object'
            ? (content[contentType].schema as Record<string, unknown>)
            : {}
        const { properties, requiredFields } = normalizeSchemaProperties(bodySchema)

        requestBody = {
          required: Boolean(reqBody.required),
          contentType,
          properties,
          requiredFields,
        }
      } else if (swagger2BodyParam) {
        // Swagger 2.0
        const bodySchema =
          swagger2BodyParam.schema && typeof swagger2BodyParam.schema === 'object'
            ? (swagger2BodyParam.schema as Record<string, unknown>)
            : {}
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
        const opResponses = op.responses as Record<string, unknown>
        for (const [code, respObj] of Object.entries(opResponses)) {
          if (!respObj || typeof respObj !== 'object') continue
          const r = respObj as Record<string, unknown>
          const rContent = (r.content && typeof r.content === 'object' ? r.content : {}) as Record<
            string,
            Record<string, unknown>
          >
          const schema = (rContent['application/json']?.schema || r.schema) as
            Record<string, unknown> | undefined
          const { properties } = schema ? normalizeSchemaProperties(schema) : { properties: {} }

          responses[code] = {
            statusCode: code,
            description: typeof r.description === 'string' ? r.description : undefined,
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
  const canonicalSummary = sortedEndpointIds
    .map((id) => {
      const o = operations[id]!
      return `${o.endpointId}|params:${Object.keys(o.params).sort().join(',')}|bodyReq:${Boolean(o.requestBody?.required)}|bodyProps:${Object.keys(
        o.requestBody?.properties ?? {},
      )
        .sort()
        .join(',')}|resps:${Object.keys(o.responses).sort().join(',')}`
    })
    .join('||')

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
