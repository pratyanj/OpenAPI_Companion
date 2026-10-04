import { describe, it, expect } from 'vitest'
import { analyzeSpecImpact } from './impact-analyzer'
import type { SpecChangeItem } from './types'
import type { Workflow } from '../workflows/types'
import type { RequestTemplate } from '../request/types'

describe('OpenAPI Spec Impact Analyzer', () => {
  const dummyChanges: SpecChangeItem[] = [
    {
      id: 'c1',
      type: 'endpoint_removed',
      severity: 'breaking',
      endpointId: 'delete /users/{id}',
      method: 'delete',
      path: '/users/{id}',
      title: 'Endpoint removed',
      description: 'Removed delete user',
    },
    {
      id: 'c2',
      type: 'param_added',
      severity: 'breaking',
      endpointId: 'get /orders',
      method: 'get',
      path: '/orders',
      title: 'Required query parameter added: accountId',
      description: 'Must pass accountId',
      after: { name: 'accountId' },
    },
    {
      id: 'c3',
      type: 'request_body_required_changed',
      severity: 'breaking',
      endpointId: 'post /orders',
      method: 'post',
      path: '/orders',
      title: 'Required request body added',
      description: 'Requires json payload',
    },
  ]

  const dummyWorkflow: Workflow = {
    id: 'wf-1',
    name: 'User & Order Flow',
    mode: 'stop-on-failure',
    createdAt: 1000,
    updatedAt: 1000,
    steps: [
      {
        id: 's1',
        endpointId: 'delete /users/{id}',
        name: 'Clean up user',
      },
      {
        id: 's2',
        endpointId: 'get /orders',
        name: 'Fetch user orders',
        queryParams: { filter: 'active' }, // missing accountId!
      },
      {
        id: 's3',
        endpointId: 'post /orders',
        name: 'Create order',
        body: '', // empty body, but required!
      },
      {
        id: 's4',
        endpointId: 'get /status', // unaffected
        name: 'Health check',
      },
    ],
  }

  const dummyPreset: RequestTemplate = {
    templateId: 't-1',
    name: 'Delete Test User',
    endpointId: 'delete /users/{id}',
    method: 'DELETE',
    environmentId: 'env-1',
    updatedAt: 1000,
  }

  it('returns empty array when there are no changes', () => {
    const result = analyzeSpecImpact({
      changes: [],
      workflows: [dummyWorkflow],
      presets: [dummyPreset],
    })
    expect(result).toHaveLength(0)
  })

  it('identifies removed endpoint impacts on workflow steps and saved presets', () => {
    const result = analyzeSpecImpact({
      changes: dummyChanges,
      workflows: [dummyWorkflow],
      presets: [dummyPreset],
      pinnedEndpoints: ['delete /users/{id}'],
    })

    // Should find impact on s1 (delete /users/{id})
    const wfStep1 = result.find((r) => r.type === 'workflow' && r.endpointId === 'delete /users/{id}')
    expect(wfStep1).toBeDefined()
    expect(wfStep1?.severity).toBe('breaking')
    expect(wfStep1?.name).toBe('User & Order Flow')
    expect(wfStep1?.stepName).toBe('Clean up user')

    // Should find impact on preset t-1
    const presetImpact = result.find((r) => r.type === 'preset' && r.endpointId === 'delete /users/{id}')
    expect(presetImpact).toBeDefined()
    expect(presetImpact?.severity).toBe('breaking')
    expect(presetImpact?.name).toBe('Delete Test User')

    // Should find impact on pinned endpoint
    const pinnedImpact = result.find((r) => r.type === 'favorite' && r.endpointId === 'delete /users/{id}')
    expect(pinnedImpact).toBeDefined()
    expect(pinnedImpact?.severity).toBe('warning')
  })

  it('identifies missing required parameters in workflow steps', () => {
    const result = analyzeSpecImpact({
      changes: dummyChanges,
      workflows: [dummyWorkflow],
    })

    const step2Impact = result.find((r) => r.type === 'workflow' && r.endpointId === 'get /orders')
    expect(step2Impact).toBeDefined()
    expect(step2Impact?.severity).toBe('breaking')
    expect(step2Impact?.reason).toContain('accountId')
  })

  it('identifies empty body on newly required body endpoint in workflow steps', () => {
    const result = analyzeSpecImpact({
      changes: dummyChanges,
      workflows: [dummyWorkflow],
    })

    const step3Impact = result.find((r) => r.type === 'workflow' && r.endpointId === 'post /orders')
    expect(step3Impact).toBeDefined()
    expect(step3Impact?.severity).toBe('breaking')
    expect(step3Impact?.reason).toContain('empty payload')
  })

  it('does not flag workflow step if required parameter is supplied', () => {
    const compliantWorkflow: Workflow = {
      ...dummyWorkflow,
      steps: [
        {
          id: 's2-compliant',
          endpointId: 'get /orders',
          name: 'Fetch user orders',
          queryParams: { accountId: 'acc_123' }, // Supplied!
        },
      ],
    }

    const result = analyzeSpecImpact({
      changes: dummyChanges,
      workflows: [compliantWorkflow],
    })

    expect(result.some((r) => r.endpointId === 'get /orders')).toBe(false)
  })
})
