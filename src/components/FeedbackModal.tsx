import { useState, useEffect, useCallback } from 'react'
import { Dialog } from './Dialog'
import { Button } from './Button'
import { Input } from './Input'
import { Spinner } from './Spinner'
import { StarIcon, ToastSuccessIcon } from './icons'
import {
  sendFeedback,
  getSavedUserEmail,
  getRuntimeMetadata,
  completeOnboarding,
} from '@/services/feedback-service'
import { cn } from '@/utils'

export interface FeedbackModalProps {
  isOpen: boolean
  onClose: () => void
  initialCategory?: 'feature' | 'bug' | 'general'
  onToast?: (message: string, kind?: 'success' | 'warning' | 'error') => void
}

const RATING_LABELS: Record<number, string> = {
  1: 'Needs improvement',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Amazing experience! 🚀',
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function FeedbackModal({
  isOpen,
  onClose,
  initialCategory = 'feature',
  onToast,
}: FeedbackModalProps) {
  const [rating, setRating] = useState<number>(5)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [category, setCategory] = useState<'feature' | 'bug' | 'general'>(initialCategory)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [includeMetadata, setIncludeMetadata] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load saved email on mount
  useEffect(() => {
    if (isOpen) {
      setIsSubmitted(false)
      setError(null)
      getSavedUserEmail().then((saved) => {
        if (saved) setEmail(saved)
      })
    }
  }, [isOpen])

  const handleSubmit = useCallback(async () => {
    const trimmedMsg = message.trim()
    const trimmedEmail = email.trim()

    if (!trimmedMsg && rating === 0) {
      setError('Please provide a message or a rating.')
      return
    }

    if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      if (trimmedEmail) {
        // Save for future auto-fills
        await completeOnboarding(trimmedEmail)
      }

      const res = await sendFeedback({
        type: 'user_feedback',
        email: trimmedEmail || undefined,
        rating: rating > 0 ? rating : undefined,
        category,
        message: trimmedMsg,
        metadata: includeMetadata ? getRuntimeMetadata() : undefined,
      })

      setIsSubmitted(true)
      if (res.ok && res.value.savedLocally) {
        onToast?.('Feedback saved offline! Will send when connected.', 'warning')
      } else {
        onToast?.('Thank you for helping us improve OpenAPI Companion!', 'success')
      }
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch {
      setIsSubmitted(true)
      onToast?.('Feedback saved locally. Thank you!', 'success')
      setTimeout(() => {
        onClose()
      }, 1500)
    } finally {
      setIsSubmitting(false)
    }
  }, [message, email, rating, category, includeMetadata, onClose, onToast])

  if (!isOpen) return null

  const activeRating = hoverRating || rating
  const meta = getRuntimeMetadata()

  return (
    <Dialog title="Share Feedback & Suggestions" onClose={onClose} size="lg">
      {isSubmitted ? (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
            <ToastSuccessIcon className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold text-text">Thank you for your feedback!</h3>
          <p className="text-xs text-text-muted max-w-xs">
            We read every single message and use your insights to shape upcoming releases.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 py-1">
          {/* Category selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text">What kind of feedback is this?</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setCategory('feature')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  category === 'feature'
                    ? 'border-primary bg-primary/10 text-primary font-semibold'
                    : 'border-border bg-surface/50 text-text-muted hover:border-border-hover hover:text-text',
                )}
              >
                <span>💡</span> Feature Idea
              </button>
              <button
                type="button"
                onClick={() => setCategory('bug')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  category === 'bug'
                    ? 'border-red-500 bg-red-500/10 text-red-500 font-semibold'
                    : 'border-border bg-surface/50 text-text-muted hover:border-border-hover hover:text-text',
                )}
              >
                <span>🐛</span> Bug Report
              </button>
              <button
                type="button"
                onClick={() => setCategory('general')}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  category === 'general'
                    ? 'border-blue-500 bg-blue-500/10 text-blue-500 font-semibold'
                    : 'border-border bg-surface/50 text-text-muted hover:border-border-hover hover:text-text',
                )}
              >
                <span>💬</span> General
              </button>
            </div>
          </div>

          {/* Star Rating */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-text">Experience Rating</label>
              {activeRating > 0 && (
                <span className="text-[11px] font-medium text-amber-500">
                  {RATING_LABELS[activeRating]}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="rounded p-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  aria-label={`${star} star${star > 1 ? 's' : ''}`}
                >
                  <StarIcon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      star <= activeRating
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-border-hover text-text-muted/40',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Message textarea */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-message" className="text-xs font-medium text-text">
              Your message
            </label>
            <textarea
              id="feedback-message"
              rows={4}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value)
                if (error) setError(null)
              }}
              placeholder={
                category === 'feature'
                  ? 'What feature would make OpenAPI Companion even better for your workflow?'
                  : category === 'bug'
                    ? 'What happened? What did you expect instead?'
                    : 'How can we improve OpenAPI Companion?'
              }
              className="w-full rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-text placeholder:text-text-muted/60 transition-colors focus:border-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary resize-none"
            />
          </div>

          {/* Email input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="feedback-email" className="text-xs font-medium text-text">
              Email <span className="text-text-muted font-normal">(optional, for replies)</span>
            </label>
            <Input
              id="feedback-email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setError(null)
              }}
              error={error}
            />
          </div>

          {/* Diagnostic info checkbox */}
          <div className="flex items-center justify-between text-[11px] text-text-muted pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary"
              />
              <span>Include anonymous browser & OS details</span>
            </label>
            <span className="text-[10px] text-text-muted/70">
              v{meta.version} · {meta.browser} · {meta.os}
            </span>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/50">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-semibold"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-3.5 w-3.5 border-white border-t-transparent" />
                  <span>Submitting...</span>
                </>
              ) : (
                <span>Send Feedback</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
