import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Input } from './Input'

describe('Input component', () => {
  it('renders a plain input without wrapper when no label or error is given', () => {
    const { container } = render(<Input placeholder="Type here" />)
    const input = screen.getByPlaceholderText('Type here')
    expect(input).toBeInTheDocument()
    expect(input.className).toContain('border-border')
    expect(container.querySelector('label')).toBeNull()
  })

  it('renders a label when provided', () => {
    render(<Input id="test-field" label="Username" placeholder="Enter username" />)
    expect(screen.getByText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument()
  })

  it('renders an error message and error border when error is passed', () => {
    render(<Input placeholder="Name" error="Name is required" />)
    const input = screen.getByPlaceholderText('Name')
    expect(input.className).toContain('border-danger')
    expect(screen.getByText('Name is required')).toBeInTheDocument()
  })

  it('renders a warning message and warning border when warning is passed', () => {
    render(<Input placeholder="Name" warning="Name already exists" />)
    const input = screen.getByPlaceholderText('Name')
    expect(input.className).toContain('border-yellow-500/80')
    expect(screen.getByText('Name already exists')).toBeInTheDocument()
  })
})
