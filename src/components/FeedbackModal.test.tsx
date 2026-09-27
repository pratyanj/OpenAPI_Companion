import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FeedbackModal } from './FeedbackModal'
import * as feedbackService from '@/services/feedback-service'

vi.mock('@/services/feedback-service', () => ({
  sendFeedback: vi.fn().mockResolvedValue({ ok: true, value: { savedLocally: false } }),
  getSavedUserEmail: vi.fn().mockResolvedValue('existing@example.com'),
  getRuntimeMetadata: vi.fn().mockReturnValue({
    version: '1.2.0',
    browser: 'Chrome',
    os: 'Windows',
    timestamp: 123456,
    userAgent: 'test-agent',
  }),
  completeOnboarding: vi.fn().mockResolvedValue(undefined),
}))

describe('FeedbackModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render when isOpen is false', () => {
    render(<FeedbackModal isOpen={false} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders feedback dialog and pre-fills saved email on open', async () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Share Feedback & Suggestions' })).toBeInTheDocument()
    expect(screen.getByText('Feature Idea')).toBeInTheDocument()
    expect(screen.getByText('Bug Report')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()

    await waitFor(() => {
      const emailInput = screen.getByPlaceholderText('you@company.com') as HTMLInputElement
      expect(emailInput.value).toBe('existing@example.com')
    })
  })

  it('allows switching categories and star rating', async () => {
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} />)

    const bugBtn = screen.getByText('Bug Report')
    fireEvent.click(bugBtn)

    const textarea = screen.getByPlaceholderText('What happened? What did you expect instead?')
    expect(textarea).toBeInTheDocument()

    // Click 3 stars
    const star3 = screen.getByRole('button', { name: '3 stars' })
    fireEvent.click(star3)

    expect(screen.getByText('Good')).toBeInTheDocument()
  })

  it('submits feedback payload and triggers success callback', async () => {
    const onClose = vi.fn()
    const onToast = vi.fn()
    render(<FeedbackModal isOpen={true} onClose={onClose} onToast={onToast} />)

    const textarea = screen.getByRole('textbox', { name: 'Your message' })
    fireEvent.change(textarea, { target: { value: 'Great extension! Please add dark mode presets.' } })

    const submitBtn = screen.getByRole('button', { name: 'Send Feedback' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(feedbackService.sendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'user_feedback',
          category: 'feature',
          message: 'Great extension! Please add dark mode presets.',
          rating: 5,
        }),
      )
      expect(onToast).toHaveBeenCalledWith(
        'Thank you for helping us improve OpenAPI Companion!',
        'success',
      )
    })
  })

  it('handles offline fallback gracefully', async () => {
    vi.mocked(feedbackService.sendFeedback).mockResolvedValueOnce({
      ok: true,
      value: { savedLocally: true },
    })

    const onToast = vi.fn()
    render(<FeedbackModal isOpen={true} onClose={vi.fn()} onToast={onToast} />)

    const textarea = screen.getByRole('textbox', { name: 'Your message' })
    fireEvent.change(textarea, { target: { value: 'Offline note' } })

    const submitBtn = screen.getByRole('button', { name: 'Send Feedback' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onToast).toHaveBeenCalledWith(
        'Feedback saved offline! Will send when connected.',
        'warning',
      )
    })
  })
})
