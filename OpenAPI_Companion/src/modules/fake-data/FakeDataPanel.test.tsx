import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ok, type Result } from '@/types'
import { EventBus } from '@/core/events'
import { FakeDataPanel, type FakeDataPanelService } from './FakeDataPanel'
import type { FakeDataPreview, GenerateResult } from './types'

const preview: FakeDataPreview = {
  endpointId: 'post /users',
  method: 'post',
  fields: [
    { key: 'email', value: '', generator: 'email' },
    { key: 'fullName', value: 'Jane Doe', generator: 'fullName' },
    { key: 'note', value: 'x', generator: null },
  ],
}

function mockService(over: Partial<FakeDataPanelService> = {}): FakeDataPanelService {
  return {
    previewOpenRequest: vi.fn(() => preview),
    generateAll: vi.fn(async (): Promise<Result<GenerateResult>> =>
      ok({ endpointId: 'post /users', fieldCount: 2 }),
    ),
    regenerateField: vi.fn(async (): Promise<Result<GenerateResult>> =>
      ok({ endpointId: 'post /users', fieldCount: 1 }),
    ),
    ...over,
  }
}

describe('FakeDataPanel', () => {
  it('shows an empty state and can refresh when no request is open', () => {
    const previewOpenRequest = vi.fn(() => null)
    render(<FakeDataPanel service={mockService({ previewOpenRequest })} bus={new EventBus()} />)
    expect(screen.getByText('No request open')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(previewOpenRequest).toHaveBeenCalled()
  })

  it('lists fields with detected-generator and unsupported badges', () => {
    render(<FakeDataPanel service={mockService()} bus={new EventBus()} />)
    expect(screen.getByText('email')).toBeInTheDocument()
    expect(screen.getByText('Email')).toBeInTheDocument() // humanized generator
    expect(screen.getByText('Full name')).toBeInTheDocument()
    expect(screen.getByText('unsupported')).toBeInTheDocument()
  })

  it('generate-all fills fields and toasts the count', async () => {
    const service = mockService()
    const bus = new EventBus()
    const toast = vi.fn()
    bus.subscribe('NOTIFY', toast)
    render(<FakeDataPanel service={service} bus={bus} />)

    fireEvent.click(screen.getByRole('button', { name: 'Generate test data' }))
    await waitFor(() => expect(service.generateAll).toHaveBeenCalledWith())
    expect(toast).toHaveBeenCalledWith({ kind: 'success', message: 'Generated 2 fields.' })
  })

  it('regenerate-all passes overwrite:true', async () => {
    const service = mockService()
    render(<FakeDataPanel service={service} bus={new EventBus()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate all' }))
    await waitFor(() => expect(service.generateAll).toHaveBeenCalledWith({ overwrite: true }))
  })

  it('regenerates a single field; unsupported fields are disabled', async () => {
    const service = mockService()
    render(<FakeDataPanel service={service} bus={new EventBus()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate email' }))
    await waitFor(() => expect(service.regenerateField).toHaveBeenCalledWith('email'))

    expect(screen.getByRole('button', { name: 'Regenerate note' })).toBeDisabled()
  })
})
