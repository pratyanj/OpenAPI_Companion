import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { DisconnectedPanel } from './DisconnectedPanel'
import * as feedbackService from '@/services/feedback-service'

vi.mock('@/services/feedback-service', () => ({
  isOnboardingCompleted: vi.fn(),
  getSavedUserEmail: vi.fn().mockResolvedValue(''),
  completeOnboarding: vi.fn().mockResolvedValue(undefined),
  sendFeedback: vi.fn().mockResolvedValue({ ok: true, value: { savedLocally: false } }),
}))

describe('DisconnectedPanel / WelcomeView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders activation form when onboarding is not completed', async () => {
    vi.mocked(feedbackService.isOnboardingCompleted).mockResolvedValue(false)
    render(<DisconnectedPanel />)

    expect(
      await screen.findByRole('heading', { name: /activate openapi companion/i }),
    ).toBeInTheDocument()
    expect(screen.getByPlaceholderText('developer@company.com')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /activate companion & get started/i }),
    ).toBeInTheDocument()
  })

  it('validates email format before activating', async () => {
    vi.mocked(feedbackService.isOnboardingCompleted).mockResolvedValue(false)
    render(<DisconnectedPanel />)

    const input = await screen.findByPlaceholderText('developer@company.com')
    fireEvent.change(input, { target: { value: 'invalid-email' } })

    const btn = screen.getByRole('button', { name: /activate companion & get started/i })
    fireEvent.click(btn)

    expect(
      await screen.findByText('Please enter a valid email address (e.g. dev@company.com).'),
    ).toBeInTheDocument()
    expect(feedbackService.completeOnboarding).not.toHaveBeenCalled()
  })

  it('submits lead and transitions to Thank You screen on valid email', async () => {
    vi.mocked(feedbackService.isOnboardingCompleted).mockResolvedValue(false)
    render(<DisconnectedPanel />)

    const input = await screen.findByPlaceholderText('developer@company.com')
    fireEvent.change(input, { target: { value: 'engineer@corp.com' } })

    const btn = screen.getByRole('button', { name: /activate companion & get started/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(feedbackService.completeOnboarding).toHaveBeenCalledWith('engineer@corp.com')
      expect(feedbackService.sendFeedback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'install_lead',
          email: 'engineer@corp.com',
        }),
      )
    })

    expect(
      await screen.findByRole('heading', { name: /thank you! openapi companion is activated/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('engineer@corp.com')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /try live demo \(swagger petstore\)/i }),
    ).toHaveAttribute('href', 'https://petstore.swagger.io/')
  })

  it('renders Thank You / Quick Start guide when already completed', async () => {
    vi.mocked(feedbackService.isOnboardingCompleted).mockResolvedValue(true)
    vi.mocked(feedbackService.getSavedUserEmail).mockResolvedValue('alex@example.com')
    render(<DisconnectedPanel />)

    expect(
      await screen.findByRole('heading', { name: /thank you! openapi companion is activated/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('alex@example.com')).toBeInTheDocument()
    expect(screen.getByText(/how to use openapi companion/i)).toBeInTheDocument()
  })
})
