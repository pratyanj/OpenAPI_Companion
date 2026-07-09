import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Dialog } from './Dialog'
import { CopyButton } from './CopyButton'

describe('Dialog', () => {
  it('renders content and closes via the close button, backdrop, and Escape', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Dialog title="Details" onClose={onClose}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)

    rerender(
      <Dialog title="Details" onClose={onClose}>
        <p>body</p>
      </Dialog>,
    )
    fireEvent.click(screen.getByRole('dialog')) // backdrop
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when clicking the content', () => {
    const onClose = vi.fn()
    render(
      <Dialog title="D" onClose={onClose}>
        <p>inside</p>
      </Dialog>,
    )
    fireEvent.click(screen.getByText('inside'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('moves focus into the dialog on open and restores it on close (WCAG 2.4.3)', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    const { unmount } = render(
      <Dialog title="F" onClose={vi.fn()}>
        <p>body</p>
      </Dialog>,
    )
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)

    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('CopyButton', () => {
  it('copies the text and shows feedback', () => {
    ;(document as unknown as { execCommand: () => boolean }).execCommand = vi.fn(() => true)
    render(<CopyButton text="hello" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
  })
})
