import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SpecChangeModal } from './SpecChangeModal'
import type { SpecDiffResult, NormalizedSpec } from '@/modules/spec-detector/types'

describe('SpecChangeModal', () => {
  const dummyDiff: SpecDiffResult = {
    hasChanges: true,
    hasBreakingChanges: true,
    totalChanges: 3,
    breakingCount: 1,
    warningCount: 1,
    infoCount: 1,
    oldHash: 'hash-v1',
    newHash: 'hash-v2',
    changes: [
      {
        id: 'c1',
        type: 'endpoint_removed',
        severity: 'breaking',
        endpointId: 'delete /users/{id}',
        method: 'delete',
        path: '/users/{id}',
        title: 'Endpoint removed: DELETE /users/{id}',
        description: 'Operation removed completely',
      },
      {
        id: 'c2',
        type: 'param_removed',
        severity: 'warning',
        endpointId: 'get /users',
        method: 'get',
        path: '/users',
        title: 'Parameter removed: filter',
        description: 'Parameter removed',
      },
      {
        id: 'c3',
        type: 'param_added',
        severity: 'info',
        endpointId: 'get /users',
        method: 'get',
        path: '/users',
        title: 'Optional parameter added: sort',
        description: 'Optional sort parameter added',
      },
    ],
    impactedResources: [
      {
        id: 'imp-1',
        type: 'workflow',
        name: 'User Cleanup Flow',
        endpointId: 'delete /users/{id}',
        stepName: 'Delete User Step',
        stepIndex: 0,
        reason: 'Step calls deleted endpoint',
        severity: 'breaking',
      },
    ],
  }

  const dummySpec: NormalizedSpec = {
    title: 'Customer API',
    version: '2.0.0',
    hash: 'hash-v2',
    operations: {},
    timestamp: 1000,
  }

  it('renders summary tab with breaking change alert and change metrics', () => {
    render(
      <SpecChangeModal diff={dummyDiff} newSpec={dummySpec} onAccept={vi.fn()} onClose={vi.fn()} />,
    )

    expect(screen.getByText(/OpenAPI Spec Change Detector/i)).toBeInTheDocument()
    expect(screen.getByText(/Potentially Breaking Changes Detected/i)).toBeInTheDocument()
    expect(screen.getByText('Customer API')).toBeInTheDocument()
    expect(screen.getByText('2.0.0')).toBeInTheDocument()
    expect(screen.getByText('Total Changes')).toBeInTheDocument()
  })

  it('switches to Changes tab and filters changes', async () => {
    render(
      <SpecChangeModal diff={dummyDiff} newSpec={dummySpec} onAccept={vi.fn()} onClose={vi.fn()} />,
    )

    const changesTab = screen.getByRole('button', { name: /Changes/i })
    fireEvent.click(changesTab)

    expect(screen.getByText('Endpoint removed: DELETE /users/{id}')).toBeInTheDocument()
    expect(screen.getByText('Parameter removed: filter')).toBeInTheDocument()

    // Filter by Breaking
    const breakingBtn = screen.getByRole('button', { name: /Breaking \(1\)/i })
    fireEvent.click(breakingBtn)

    expect(screen.getByText('Endpoint removed: DELETE /users/{id}')).toBeInTheDocument()
    expect(screen.queryByText('Parameter removed: filter')).not.toBeInTheDocument()
  })

  it('switches to Impacted Resources tab and renders impacted workflows', () => {
    render(
      <SpecChangeModal diff={dummyDiff} newSpec={dummySpec} onAccept={vi.fn()} onClose={vi.fn()} />,
    )

    const impactTab = screen.getByRole('button', { name: /Impacted Resources/i })
    fireEvent.click(impactTab)

    expect(screen.getByText('User Cleanup Flow')).toBeInTheDocument()
    expect(screen.getByText('(Delete User Step)')).toBeInTheDocument()
    expect(screen.getByText(/Step calls deleted endpoint/i)).toBeInTheDocument()
  })

  it('invokes onAccept with newSpec when Accept New Spec button is clicked', async () => {
    const handleAccept = vi.fn()
    const handleClose = vi.fn()

    render(
      <SpecChangeModal
        diff={dummyDiff}
        newSpec={dummySpec}
        onAccept={handleAccept}
        onClose={handleClose}
      />,
    )

    const acceptBtn = screen.getByRole('button', { name: /Accept New Spec/i })
    fireEvent.click(acceptBtn)

    expect(handleAccept).toHaveBeenCalledWith(dummySpec)
  })

  it('invokes onClose when Dismiss button is clicked', () => {
    const handleClose = vi.fn()

    render(
      <SpecChangeModal
        diff={dummyDiff}
        newSpec={dummySpec}
        onAccept={vi.fn()}
        onClose={handleClose}
      />,
    )

    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i })
    fireEvent.click(dismissBtn)

    expect(handleClose).toHaveBeenCalled()
  })
})
