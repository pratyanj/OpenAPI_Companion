import type { Workflow } from '../workflows/types'
import type { RequestTemplate } from '../request/types'
import type { SpecChangeItem, ImpactedResource } from './types'

export interface AnalyzeImpactOptions {
  changes: SpecChangeItem[]
  workflows?: Workflow[]
  presets?: RequestTemplate[]
  pinnedEndpoints?: string[]
}

/**
 * Correlates OpenAPI contract changes with user Companion resources:
 * - Multi-step workflows and their individual steps (checking endpoints, params, bodies)
 * - Saved request presets / templates
 * - Pinned / favorite endpoints
 */
export function analyzeSpecImpact(options: AnalyzeImpactOptions): ImpactedResource[] {
  const { changes, workflows = [], presets = [], pinnedEndpoints = [] } = options

  if (changes.length === 0) return []

  // Group changes by endpointId
  const changesByEndpoint = new Map<string, SpecChangeItem[]>()
  for (const change of changes) {
    const list = changesByEndpoint.get(change.endpointId) ?? []
    list.push(change)
    changesByEndpoint.set(change.endpointId, list)
  }

  const impacted: ImpactedResource[] = []

  // 1. Analyze Workflows
  for (const workflow of workflows) {
    if (!workflow.steps || !Array.isArray(workflow.steps)) continue

    workflow.steps.forEach((step, idx) => {
      const stepChanges = changesByEndpoint.get(step.endpointId)
      if (!stepChanges || stepChanges.length === 0) return

      const stepName = step.name || `Step ${idx + 1}`

      // Check for removed endpoint or path param rename
      const removal = stepChanges.find((c) => c.type === 'endpoint_removed')
      if (removal) {
        impacted.push({
          id: `impact_wf_${workflow.id}_${step.id}_removed`,
          type: 'workflow',
          name: workflow.name,
          endpointId: step.endpointId,
          stepName,
          stepIndex: idx,
          reason: `Endpoint was removed from OpenAPI spec. Workflow execution will fail at step ${idx + 1}.`,
          severity: 'breaking',
        })
        return
      }

      const pathParamChange = stepChanges.find((c) => c.type === 'path_param_changed')
      if (pathParamChange) {
        impacted.push({
          id: `impact_wf_${workflow.id}_${step.id}_pathparam`,
          type: 'workflow',
          name: workflow.name,
          endpointId: step.endpointId,
          stepName,
          stepIndex: idx,
          reason: `Path parameter format changed (${pathParamChange.description}). Step path parameters must be updated.`,
          severity: 'breaking',
        })
      }

      // Check for newly required query/header/path params
      const requiredParamChanges = stepChanges.filter(
        (c) =>
          (c.type === 'param_added' || c.type === 'param_required_changed') &&
          c.severity === 'breaking',
      )

      for (const paramChange of requiredParamChanges) {
        const paramName =
          ((paramChange.after as Record<string, unknown> | undefined)?.name as
            string | undefined) ??
          paramChange.title.split(': ').pop() ??
          ''
        const inQuery = Boolean(step.queryParams && step.queryParams[paramName])
        const inPath = Boolean(step.pathParams && step.pathParams[paramName])
        const inHeader = Boolean(step.headerParams && step.headerParams[paramName])

        if (!inQuery && !inPath && !inHeader) {
          impacted.push({
            id: `impact_wf_${workflow.id}_${step.id}_reqparam_${paramName}`,
            type: 'workflow',
            name: workflow.name,
            endpointId: step.endpointId,
            stepName,
            stepIndex: idx,
            reason: `Required parameter "${paramName}" is missing from step parameters.`,
            severity: 'breaking',
          })
        }
      }

      // Check for request body requirement changes
      const bodyRequiredChange = stepChanges.find(
        (c) => c.type === 'request_body_required_changed' && c.severity === 'breaking',
      )
      if (bodyRequiredChange) {
        const hasBody = Boolean(step.body && step.body.trim() !== '' && step.body.trim() !== '{}')
        if (!hasBody) {
          impacted.push({
            id: `impact_wf_${workflow.id}_${step.id}_reqbody`,
            type: 'workflow',
            name: workflow.name,
            endpointId: step.endpointId,
            stepName,
            stepIndex: idx,
            reason: 'Step has an empty payload, but the endpoint now requires a request body.',
            severity: 'breaking',
          })
        }
      }

      // Check for response changes if step has assertions or extractions
      const responseBreaking = stepChanges.filter(
        (c) =>
          (c.type === 'response_status_removed' ||
            c.type === 'response_property_removed' ||
            c.type === 'response_type_changed') &&
          c.severity === 'breaking',
      )

      if (responseBreaking.length > 0) {
        const hasAssertions = Array.isArray(step.assertions) && step.assertions.length > 0
        const hasExtractions = Array.isArray(step.extractions) && step.extractions.length > 0

        if (hasAssertions || hasExtractions) {
          impacted.push({
            id: `impact_wf_${workflow.id}_${step.id}_response_eval`,
            type: 'workflow',
            name: workflow.name,
            endpointId: step.endpointId,
            stepName,
            stepIndex: idx,
            reason: `Response schema changed (${responseBreaking.map((c) => c.title).join(', ')}). Assertions or extractions may fail.`,
            severity: 'breaking',
          })
        }
      }
    })
  }

  // 2. Analyze Saved Presets / Templates
  for (const preset of presets) {
    const presetChanges = changesByEndpoint.get(preset.endpointId)
    if (!presetChanges || presetChanges.length === 0) continue

    const removal = presetChanges.find((c) => c.type === 'endpoint_removed')
    if (removal) {
      impacted.push({
        id: `impact_preset_${preset.templateId}_removed`,
        type: 'preset',
        name: preset.name,
        endpointId: preset.endpointId,
        reason: `Endpoint was removed from OpenAPI spec. Saved preset is obsolete.`,
        severity: 'breaking',
      })
      continue
    }

    const breakingChanges = presetChanges.filter((c) => c.severity === 'breaking')
    if (breakingChanges.length > 0) {
      impacted.push({
        id: `impact_preset_${preset.templateId}_breaking`,
        type: 'preset',
        name: preset.name,
        endpointId: preset.endpointId,
        reason: `Endpoint has ${breakingChanges.length} breaking change(s): ${breakingChanges.map((c) => c.title).join(', ')}.`,
        severity: 'breaking',
      })
    } else {
      impacted.push({
        id: `impact_preset_${preset.templateId}_warning`,
        type: 'preset',
        name: preset.name,
        endpointId: preset.endpointId,
        reason: `Endpoint contract modified with non-breaking changes.`,
        severity: 'warning',
      })
    }
  }

  // 3. Analyze Pinned Endpoints
  for (const pinnedId of pinnedEndpoints) {
    const pinnedChanges = changesByEndpoint.get(pinnedId)
    if (!pinnedChanges || pinnedChanges.length === 0) continue

    const removal = pinnedChanges.find((c) => c.type === 'endpoint_removed')
    if (removal) {
      impacted.push({
        id: `impact_pinned_${pinnedId.replace(/\s+/g, '_')}_removed`,
        type: 'favorite',
        name: pinnedId,
        endpointId: pinnedId,
        reason: `Pinned endpoint was removed from OpenAPI spec.`,
        severity: 'warning',
      })
    }
  }

  return impacted
}
