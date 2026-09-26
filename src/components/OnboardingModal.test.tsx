import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OnboardingModal } from './OnboardingModal'
import * as feedbackService from '@/services/feedback-service'

vi.mock('@/services/feedback-service', () => ({
  completeOnboarding: vi.fn().mockResolvedValue(undefined),
  sendFeedback: vi.fn().mockResolvedValue({ ok: true, value: { savedLocally: false } }),
}))

describe('OnboardingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when isOpen is false', () => {
    render(<OnboardingModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders welcome dialog and feature highlights when isOpen is true', () => {
    render(<OnboardingModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Welcome to OpenAPI Companion' })).toBeInTheDocument()
    expect(screen.getByText('Thank you for installing!')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('developer@example.com')).toBeInTheDocument()
  })

  it('calls onClose when "Skip for now" is clicked', async () => {
    const onClose = vi.fn()
    render(<OnboardingModal isOpen={true} onClose={onClose} />)

    const skipBtn = screen.getByRole('button', { name: 'Skip for now' })
    fireEvent.click(skipBtn)

    await waitFor(() => {
      expect(feedbackService.completeOnboarding).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('validates email format before submitting', async () => {
    render(<OnboardingModal isOpen={true} onClose={vi.fn()} />)

    const input = screen.getByPlaceholderText('developer@example.com')
    fireEvent.change(input, { target: { value: 'not-an-email' } })

    const submitBtn = screen.getByRole('button', { name: 'Get Started' })
    fireEvent.click(submitBtn)

    expect(await screen.findByText('Please enter a valid email address.')).toBeInTheDocument()
    expect(feedbackService.sendFeedback).not.toHaveBeenCalled()
  })

  it('submits valid email lead and triggers toast', async () => {
    const onClose = vi.fn()
    const onToast = vi.fn()
    render(<OnboardingModal isOpen={true} onClose={onClose} onToast={onToast} />)

    const input = screen.getByPlaceholderText('developer@example.com')
    fireEvent.change(input, { target: { value: 'user@example.com' } })

    const submitBtn = screen.getByRole('button', { name: 'Get Started' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(feedbackService.completeOnboarding).toHaveBeenCalledWith('user@example.com')
      expect(feedbackService.sendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'install_lead',
          email: 'user@example.com',
        }),
      )
      expect(onToast).toHaveBeenCalledWith('Welcome aboard!', 'success')
      expect(onClose).toHaveBeenCalled()
    })
  })

  it('allows clicking "Get Started" without entering an email', async () => {
    const onClose = vi.fn()
    render(<OnboardingModal isOpen={true} onClose={onClose} />)

    const submitBtn = screen.getByRole('button', { name: 'Get Started' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(feedbackService.completeOnboarding).toHaveBeenCalledWith()
      expect(onClose).toHaveBeenCalled()
    })
  })
})
