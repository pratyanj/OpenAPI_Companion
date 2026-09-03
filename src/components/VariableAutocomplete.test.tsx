import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VariableTextarea } from './VariableAutocomplete'

describe('VariableTextarea', () => {
  it('renders textarea with standard attributes', () => {
    render(
      <VariableTextarea
        id="test-textarea"
        placeholder="Enter payload..."
        defaultValue="hello"
      />,
    )
    const textarea = screen.getByPlaceholderText('Enter payload...')
    expect(textarea).toBeInTheDocument()
    expect(textarea).toHaveValue('hello')
  })

  it('triggers autocomplete menu when typing {{', () => {
    const projectVariables = { API_KEY: 'secret123', BASE_HOST: 'api.io' }
    const projectSecrets = ['API_KEY']

    render(
      <VariableTextarea
        projectVariables={projectVariables}
        projectSecrets={projectSecrets}
        placeholder="Enter body"
      />,
    )

    const textarea = screen.getByPlaceholderText('Enter body')
    fireEvent.change(textarea, { target: { value: '{"token": "{{' } })

    expect(screen.getByRole('listbox', { name: 'Variable suggestions' })).toBeInTheDocument()
    expect(screen.getByText('Project Variables')).toBeInTheDocument()
    expect(screen.getByText('Dynamic Variables')).toBeInTheDocument()
    expect(screen.getByText('{{API_KEY}}')).toBeInTheDocument()
    expect(screen.getByText('{{BASE_HOST}}')).toBeInTheDocument()
    expect(screen.getByText('{{$uuid}}')).toBeInTheDocument()
  })

  it('filters suggestions when typing query after {{', () => {
    const projectVariables = { USER_ID: '42', TOKEN: 'xyz' }

    render(
      <VariableTextarea
        projectVariables={projectVariables}
        placeholder="Enter body"
      />,
    )

    const textarea = screen.getByPlaceholderText('Enter body')
    fireEvent.change(textarea, { target: { value: '{"user": "{{us' } })

    expect(screen.getByText('{{USER_ID}}')).toBeInTheDocument()
    expect(screen.queryByText('{{TOKEN}}')).not.toBeInTheDocument()
  })

  it('inserts selected suggestion on click', () => {
    const projectVariables = { USER_ID: '42' }
    const onChange = vi.fn()

    render(
      <VariableTextarea
        projectVariables={projectVariables}
        placeholder="Enter body"
        onChange={onChange}
      />,
    )

    const textarea = screen.getByPlaceholderText('Enter body')
    fireEvent.change(textarea, { target: { value: 'id: {{' } })

    const option = screen.getByText('{{USER_ID}}')
    fireEvent.click(option)

    // Option should close
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes autocomplete on Escape key', () => {
    const projectVariables = { TOKEN: 'xyz' }

    render(
      <VariableTextarea
        projectVariables={projectVariables}
        placeholder="Enter body"
      />,
    )

    const textarea = screen.getByPlaceholderText('Enter body')
    fireEvent.change(textarea, { target: { value: '{{' } })
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    fireEvent.keyDown(textarea, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('navigates with ArrowDown and ArrowUp', () => {
    const projectVariables = { VAR_A: '1', VAR_B: '2' }

    render(
      <VariableTextarea
        projectVariables={projectVariables}
        placeholder="Enter body"
      />,
    )

    const textarea = screen.getByPlaceholderText('Enter body')
    fireEvent.change(textarea, { target: { value: '{{' } })

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(textarea, { key: 'ArrowDown' })
    expect(options[1]).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(textarea, { key: 'ArrowUp' })
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
  })
})
