import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Tabs, type TabDef } from './Tabs'

const tabs: TabDef[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
]

describe('Tabs', () => {
  it('renders an ARIA tablist with the active tab selected', () => {
    render(<Tabs tabs={tabs} activeId="b" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Gamma' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })

  it('moves selection with arrow keys', () => {
    const onChange = vi.fn()
    render(<Tabs tabs={tabs} activeId="a" onChange={onChange} />)
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('b')
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Alpha' }), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith('c') // wraps around
  })
})
