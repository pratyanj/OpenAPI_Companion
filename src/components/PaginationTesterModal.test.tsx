import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PaginationTesterModal } from './PaginationTesterModal'
import type { PaginationRequestExecutor } from '@/modules/pagination/runner'

describe('PaginationTesterModal', () => {
  const mockExecutor: PaginationRequestExecutor = vi.fn(async ({ queryParams }) => {
    const page = parseInt(queryParams['page'] || '1', 10)
    if (page === 1) {
      return {
        status: 200,
        responseBody: JSON.stringify({
          data: [{ id: 1 }, { id: 2 }],
        }),
      }
    }
    return {
      status: 200,
      responseBody: JSON.stringify({
        data: [{ id: 3 }], // short page
      }),
    }
  })

  it('renders endpoint badge and auto-detected strategy banner', () => {
    render(
      <PaginationTesterModal
        isOpen={true}
        endpointId="GET /users"
        detected={{
          strategy: 'page',
          pageParam: 'page',
          pageSizeParam: 'limit',
          confidence: 'high',
          detectedFrom: 'Parameters: page, limit',
          suggestedPageSize: 20,
        }}
        executor={mockExecutor}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('Pagination Tester')).toBeInTheDocument()
    expect(screen.getByText('GET')).toBeInTheDocument()
    expect(screen.getByText('/users')).toBeInTheDocument()
    expect(screen.getByText(/Auto-detected pattern:/i)).toBeInTheDocument()
  })

  it('executes pagination run and displays results with metrics and checklist', async () => {
    const onToast = vi.fn()
    const onSaveToWorkflow = vi.fn()

    render(
      <PaginationTesterModal
        isOpen={true}
        endpointId="GET /items"
        initialConfig={{
          strategy: 'page',
          pageSize: 2,
          maxPages: 5,
          delayMs: 0,
        }}
        executor={mockExecutor}
        onClose={vi.fn()}
        onSaveToWorkflow={onSaveToWorkflow}
        onToast={onToast}
      />,
    )

    const runBtn = screen.getByRole('button', { name: /Run Test/i })
    fireEvent.click(runBtn)

    await waitFor(() => {
      expect(screen.getByText('Pages Tested')).toBeInTheDocument()
    })

    expect(screen.getByText('Total Records')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument() // 2 on page 1 + 1 on page 2
    expect(
      screen.getByText('No duplicate records detected across pages'),
    ).toBeInTheDocument()

    // Test Save to Workflow
    const saveBtn = screen.getByRole('button', { name: /Save to Workflow/i })
    fireEvent.click(saveBtn)

    expect(onSaveToWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.stringContaining('Pagination: GET /items'),
        steps: expect.any(Array),
      }),
    )
  })

  it('allows switching strategy between Page, Offset, and Cursor', () => {
    render(
      <PaginationTesterModal
        isOpen={true}
        endpointId="GET /logs"
        executor={mockExecutor}
        onClose={vi.fn()}
      />,
    )

    const offsetBtn = screen.getByRole('button', { name: /Limit\/Offset/i })
    fireEvent.click(offsetBtn)

    expect(screen.getByText('Offset Parameter Name')).toBeInTheDocument()
    expect(screen.getByText('Initial Offset Value')).toBeInTheDocument()

    const cursorBtn = screen.getByRole('button', { name: /Cursor-based/i })
    fireEvent.click(cursorBtn)

    expect(screen.getByText('Cursor Query Parameter')).toBeInTheDocument()
    expect(screen.getByText('Next-Cursor JSONPath in Response')).toBeInTheDocument()
  })
})
