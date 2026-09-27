import { useState, useCallback } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Input } from './Input'
import { Spinner } from './Spinner'
import { SparklesIcon } from './icons'
import { completeOnboarding, sendFeedback } from '@/services/feedback-service'

export interface OnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function OnboardingModal({ isOpen, onClose, onToast }: OnboardingModalProps) {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    const trimmed = email.trim()
    if (trimmed && !EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      if (trimmed) {
        await completeOnboarding(trimmed)
        await sendFeedback({
          type: 'install_lead',
          email: trimmed,
          message: subscribed
            ? 'Install lead: subscribed to updates'
            : 'Install lead: opted out of updates',
        })
        onToast?.('Welcome aboard!', 'success')
      } else {
        await completeOnboarding()
      }
    } catch {
      // Even if network fails, onboarding should finish so the user is not blocked
      await completeOnboarding(trimmed || undefined)
    } finally {
      setIsSubmitting(false)
      onClose()
    }
  }, [email, subscribed, onToast, onClose])

  const handleSkip = useCallback(async () => {
    try {
      await completeOnboarding()
    } catch {
      // ignore
    }
    onClose()
  }, [onClose])

  if (!isOpen) return null

  return (
    <Dialog title="Welcome to OpenAPI Companion" onClose={handleSkip} size="lg">
      <div className="flex flex-col gap-4 py-1">
        {/* Banner */}
        <div className="flex items-center gap-3 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text">Thank you for installing!</h3>
            <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
              Supercharge your API testing with side-by-side Swagger docs, instant curl generation,
              environments, and workspace history.
            </p>
          </div>
        </div>

        {/* Feature bullets */}
        <div className="grid grid-cols-1 gap-2 text-xs text-text-muted sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface/40 p-2">
            <span className="text-primary font-bold">⚡</span>
            <span>Test endpoints directly in your browser sidebar</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface/40 p-2">
            <span className="text-primary font-bold">🔒</span>
            <span>100% Local-first: tokens never leave your browser</span>
          </div>
        </div>

        {/* Lead capture form */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface/20 p-3.5 mt-1">
          <div>
            <label htmlFor="onboarding-email" className="block text-xs font-medium text-text">
              Stay in the loop <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <p className="text-[11px] text-text-muted mt-0.5">
              Enter your email to receive major feature announcements, Swagger tips, and fast support.
            </p>
          </div>

          <Input
            id="onboarding-email"
            type="email"
            placeholder="developer@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSubmit()
              }
            }}
            error={error}
            autoFocus
          />

          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer select-none">
            <input
              type="checkbox"
              checked={subscribed}
              onChange={(e) => setSubscribed(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            <span>Receive updates on new releases & tips</span>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs text-text-muted hover:text-text hover:underline transition-colors focus:outline-none"
          >
            Skip for now
          </button>

          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-3.5 w-3.5 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Get Started</span>
            )}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
