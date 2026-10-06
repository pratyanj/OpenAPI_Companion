import type {
  NormalizedSpec,
  NormalizedOperation,
  SpecDiffResult,
  SpecChangeItem,
  ChangeSeverity,
  ChangeType,
} from './types'

let changeCounter = 0
function makeChangeItem(
  type: ChangeType,
  severity: ChangeSeverity,
  endpointId: string,
  method: string,
  path: string,
  title: string,
  description: string,
  before?: unknown,
  after?: unknown,
): SpecChangeItem {
  changeCounter++
  return {
    id: `diff_${changeCounter}_${Date.now()}`,
    type,
    severity,
    endpointId,
    method,
    path,
    title,
    description,
    before,
    after,
  }
}

/** Check if two paths only differ by parameter placeholder names (e.g. /users/{id} vs /users/{userId}) */
function isPathParamRename(path1: string, path2: string): boolean {
  const parts1 = path1.split('/')
  const parts2 = path2.split('/')
  if (parts1.length !== parts2.length) return false

  let hasParamDiff = false
  for (let i = 0; i < parts1.length; i++) {
    const s1 = parts1[i]!
    const s2 = parts2[i]!
    if (s1 === s2) continue
    if (s1.startsWith('{') && s1.endsWith('}') && s2.startsWith('{') && s2.endsWith('}')) {
      hasParamDiff = true
    } else {
      return false
    }
  }
  return hasParamDiff
}

export function diffOpenApiSpecs(oldSpec: NormalizedSpec, newSpec: NormalizedSpec): SpecDiffResult {
  const changes: SpecChangeItem[] = []

  const oldOps = oldSpec.operations
  const newOps = newSpec.operations

  const pairedNewEndpoints = new Set<string>()

  // 1. Check for removed endpoints or path parameter renames
  for (const [oldId, oldOp] of Object.entries(oldOps)) {
    if (!newOps[oldId]) {
      // Check if renamed path parameter in newOps
      const potentialRename = Object.values(newOps).find(
        (n) => n.method === oldOp.method && isPathParamRename(oldOp.path, n.path),
      )

      if (potentialRename) {
        pairedNewEndpoints.add(potentialRename.endpointId)
        changes.push(
          makeChangeItem(
            'path_param_changed',
            'breaking',
            oldId,
            oldOp.method,
            oldOp.path,
            `Path parameter altered: ${oldOp.path} -> ${potentialRename.path}`,
            `The path parameter was renamed or modified from "${oldOp.path}" to "${potentialRename.path}". Existing saved URLs and workflows will fail without updating.`,
            oldOp.path,
            potentialRename.path,
          ),
        )
      } else {
        changes.push(
          makeChangeItem(
            'endpoint_removed',
            'breaking',
            oldId,
            oldOp.method,
            oldOp.path,
            `Endpoint removed: ${oldId.toUpperCase()}`,
            `The operation ${oldId.toUpperCase()} was removed from the OpenAPI specification.`,
          ),
        )
      }
    }
  }

  // 2. Check for added endpoints
  for (const [newId, newOp] of Object.entries(newOps)) {
    if (!oldOps[newId] && !pairedNewEndpoints.has(newId)) {
      changes.push(
        makeChangeItem(
          'endpoint_added',
          'info',
          newId,
          newOp.method,
          newOp.path,
          `New endpoint added: ${newId.toUpperCase()}`,
          `The operation ${newId.toUpperCase()} was added to the OpenAPI contract.`,
          undefined,
          newOp,
        ),
      )
    }
  }

  // 3. Compare common operations
  for (const [id, oldOp] of Object.entries(oldOps)) {
    const newOp = newOps[id]
    if (!newOp) continue

    diffOperationContracts(oldOp, newOp, changes)
  }

  // Calculate counts
  let breakingCount = 0
  let warningCount = 0
  let infoCount = 0

  for (const c of changes) {
    if (c.severity === 'breaking') breakingCount++
    else if (c.severity === 'warning') warningCount++
    else infoCount++
  }

  return {
    hasChanges: changes.length > 0,
    hasBreakingChanges: breakingCount > 0,
    totalChanges: changes.length,
    breakingCount,
    warningCount,
    infoCount,
    changes,
    impactedResources: [], // filled by impact-analyzer
    oldHash: oldSpec.hash,
    newHash: newSpec.hash,
  }
}

function diffOperationContracts(
  oldOp: NormalizedOperation,
  newOp: NormalizedOperation,
  changes: SpecChangeItem[],
): void {
  const { endpointId, method, path } = oldOp

  // A. Compare Parameters
  for (const [key, newP] of Object.entries(newOp.params)) {
    const oldP = oldOp.params[key]
    if (!oldP) {
      if (newP.required) {
        changes.push(
          makeChangeItem(
            'param_added',
            'breaking',
            endpointId,
            method,
            path,
            `Required ${newP.in} parameter added: ${newP.name}`,
            `Clients calling this operation without providing "${newP.name}" will receive validation errors.`,
            undefined,
            newP,
          ),
        )
      } else {
        changes.push(
          makeChangeItem(
            'param_added',
            'info',
            endpointId,
            method,
            path,
            `Optional ${newP.in} parameter added: ${newP.name}`,
            `New optional parameter "${newP.name}" is now available.`,
            undefined,
            newP,
          ),
        )
      }
    } else {
      // Check required change
      if (!oldP.required && newP.required) {
        changes.push(
          makeChangeItem(
            'param_required_changed',
            'breaking',
            endpointId,
            method,
            path,
            `Parameter became required: ${newP.name}`,
            `Parameter "${newP.name}" changed from optional to required. Calls omitting it will fail.`,
            { required: false },
            { required: true },
          ),
        )
      } else if (oldP.required && !newP.required) {
        changes.push(
          makeChangeItem(
            'param_required_changed',
            'info',
            endpointId,
            method,
            path,
            `Parameter became optional: ${newP.name}`,
            `Parameter "${newP.name}" is no longer required.`,
            { required: true },
            { required: false },
          ),
        )
      }

      // Check type change
      if (oldP.type && newP.type && oldP.type !== newP.type) {
        changes.push(
          makeChangeItem(
            'param_type_changed',
            'breaking',
            endpointId,
            method,
            path,
            `Parameter type changed: ${newP.name} (${oldP.type} -> ${newP.type})`,
            `The expected type for "${newP.name}" was modified from "${oldP.type}" to "${newP.type}".`,
            oldP.type,
            newP.type,
          ),
        )
      }

      // Check enum changes
      if (oldP.enum && newP.enum) {
        const removedEnumValues = oldP.enum.filter((v) => !newP.enum!.includes(v))
        if (removedEnumValues.length > 0) {
          changes.push(
            makeChangeItem(
              'enum_changed',
              'breaking',
              endpointId,
              method,
              path,
              `Enum value removed in parameter: ${newP.name}`,
              `The parameter "${newP.name}" no longer accepts enum values: ${removedEnumValues.join(', ')}.`,
              oldP.enum,
              newP.enum,
            ),
          )
        }
      }
    }
  }

  for (const [key, oldP] of Object.entries(oldOp.params)) {
    if (!newOp.params[key]) {
      changes.push(
        makeChangeItem(
          'param_removed',
          'warning',
          endpointId,
          method,
          path,
          `Parameter removed: ${oldP.name}`,
          `The parameter "${oldP.name}" was removed from the contract.`,
          oldP,
          undefined,
        ),
      )
    }
  }

  // B. Compare Request Body
  const oldBody = oldOp.requestBody
  const newBody = newOp.requestBody

  if (!oldBody?.required && newBody?.required) {
    changes.push(
      makeChangeItem(
        'request_body_required_changed',
        'breaking',
        endpointId,
        method,
        path,
        'Required request body added',
        'This operation now requires a request body payload.',
        { required: false },
        { required: true },
      ),
    )
  }

  if (oldBody && newBody) {
    // Check newly required fields in payload
    for (const field of newBody.requiredFields) {
      if (!oldBody.requiredFields.includes(field)) {
        changes.push(
          makeChangeItem(
            'request_body_required_changed',
            'breaking',
            endpointId,
            method,
            path,
            `Required field added in request body: ${field}`,
            `The request body property "${field}" is now required. Existing saved payloads missing "${field}" will fail.`,
            { required: false },
            { required: true },
          ),
        )
      }
    }

    // Check payload properties
    for (const [propName, newProp] of Object.entries(newBody.properties)) {
      const oldProp = oldBody.properties[propName]
      if (!oldProp) {
        changes.push(
          makeChangeItem(
            'request_body_property_added',
            newProp.required ? 'breaking' : 'info',
            endpointId,
            method,
            path,
            `Field added to request body: ${propName}`,
            `New field "${propName}" (${newProp.type || 'any'}) added to request schema.`,
            undefined,
            newProp,
          ),
        )
      } else if (oldProp.type && newProp.type && oldProp.type !== newProp.type) {
        changes.push(
          makeChangeItem(
            'request_body_type_changed',
            'breaking',
            endpointId,
            method,
            path,
            `Request body field type changed: ${propName} (${oldProp.type} -> ${newProp.type})`,
            `The field "${propName}" changed type from "${oldProp.type}" to "${newProp.type}".`,
            oldProp.type,
            newProp.type,
          ),
        )
      }
    }

    for (const [propName, oldProp] of Object.entries(oldBody.properties)) {
      if (!newBody.properties[propName]) {
        changes.push(
          makeChangeItem(
            'request_body_property_removed',
            'warning',
            endpointId,
            method,
            path,
            `Field removed from request body: ${propName}`,
            `The field "${propName}" was removed from the request schema.`,
            oldProp,
            undefined,
          ),
        )
      }
    }
  }

  // C. Compare Responses
  for (const [code, oldResp] of Object.entries(oldOp.responses)) {
    const newResp = newOp.responses[code]
    if (!newResp) {
      changes.push(
        makeChangeItem(
          'response_status_removed',
          'breaking',
          endpointId,
          method,
          path,
          `Response status ${code} removed`,
          `Status code ${code} was removed from response declarations.`,
          code,
          undefined,
        ),
      )
    } else if (oldResp.properties && newResp.properties) {
      // Check removed response properties
      for (const [propName, oldProp] of Object.entries(oldResp.properties)) {
        const newProp = newResp.properties[propName]
        if (!newProp) {
          changes.push(
            makeChangeItem(
              'response_property_removed',
              'breaking',
              endpointId,
              method,
              path,
              `Response property removed: ${propName} (${code})`,
              `The field "${propName}" was removed from response ${code}. Workflows extracting this field will fail.`,
              oldProp,
              undefined,
            ),
          )
        } else if (oldProp.type && newProp.type && oldProp.type !== newProp.type) {
          changes.push(
            makeChangeItem(
              'response_type_changed',
              'breaking',
              endpointId,
              method,
              path,
              `Response property type changed: ${propName} (${oldProp.type} -> ${newProp.type})`,
              `The response field "${propName}" changed from "${oldProp.type}" to "${newProp.type}". Assertions expecting "${oldProp.type}" may fail.`,
              oldProp.type,
              newProp.type,
            ),
          )
        }
      }
    }
  }
}
