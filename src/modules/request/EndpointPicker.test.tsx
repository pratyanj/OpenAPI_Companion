import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EndpointPicker } from './EndpointPicker'
import type { EndpointInfo } from '@/adapters'

const mockEndpoints: EndpointInfo[] = [
  { endpointId: 'post /tasks/', method: 'post', path: '/tasks/', summary: 'Create Task' },
  { endpointId: 'get /tasks/', method: 'get', path: '/tasks/', summary: 'List Tasks' },
  { endpointId: 'delete /tasks/{id}', method: 'delete', path: '/tasks/{id}', summary: 'Delete Task' },
]

describe('EndpointPicker', () => {
  it('renders selected endpoint in trigger box', () => {
    render(
      <EndpointPicker
        endpoints={mockEndpoints}
        selectedEndpointId="post /tasks/"
        onSelect={vi.fn()}
      />,
    )
    expect(screen.getByText('/tasks/')).toBeInTheDocument()
    expect(screen.getByText(/post/i)).toBeInTheDocument()
    expect(screen.getByText(/Create Task/)).toBeInTheDocument()
  })

  it('opens dropdown and selects a different endpoint on click', () => {
    const onSelect = vi.fn()
    render(
      <EndpointPicker
        endpoints={mockEndpoints}
        selectedEndpointId="post /tasks/"
        onSelect={onSelect}
      />,
    )

    // Open dropdown
    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)

    // List Tasks should now be visible
    const getEndpointItem = screen.getByText('List Tasks').closest('[role="button"]')
    expect(getEndpointItem).toBeInTheDocument()

    // Click on List Tasks
    fireEvent.click(getEndpointItem!)

    expect(onSelect).toHaveBeenCalledWith('get /tasks/')
  })

  it('filters endpoints by search text', () => {
    render(
      <EndpointPicker
        endpoints={mockEndpoints}
        selectedEndpointId="post /tasks/"
        onSelect={vi.fn()}
      />,
    )

    const trigger = screen.getByRole('button')
    fireEvent.click(trigger)

    const searchInput = screen.getByPlaceholderText('Filter by path, method, or summary…')
    fireEvent.change(searchInput, { target: { value: 'delete' } })

    expect(screen.getByText('Delete Task')).toBeInTheDocument()
    expect(screen.queryByText('Create Task')).not.toBeInTheDocument()
    expect(screen.queryByText('List Tasks')).not.toBeInTheDocument()
  })

  it('renders error message when error prop is provided', () => {
    render(
      <EndpointPicker
        endpoints={mockEndpoints}
        selectedEndpointId=""
        onSelect={vi.fn()}
        error="Please select an endpoint"
      />,
    )

    expect(screen.getByText('Please select an endpoint')).toBeInTheDocument()
  })
})
