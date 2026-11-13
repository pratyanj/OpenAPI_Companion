import { useState, useCallback, useEffect } from 'react'
import {
  BrandIcon,
  CheckIcon,
  ExternalLinkIcon,
  LockIcon,
  SparklesIcon,
  ZapIcon,
  PinIcon,
} from '@/components/icons'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import { Spinner } from '@/components/Spinner'
import { APP_NAME, APP_VERSION } from '@/constants'
import {
  completeOnboarding,
  getSavedUserEmail,
  isOnboardingCompleted,
  sendFeedback,
} from '@/services/feedback-service'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PETSTORE_DEMO_URL = 'https://petstore.swagger.io/'

export interface WelcomeViewProps {
  onActivated?: (email: string) => void
}

export function WelcomeView({ onActivated }: WelcomeViewProps) {
  const [step, setStep] = useState<'loading' | 'activate' | 'thank_you'>('loading')
  const [email, setEmail] = useState('')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [subscribed, setSubscribed] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const completed = await isOnboardingCompleted()
      if (completed) {
        const saved = await getSavedUserEmail()
        setRegisteredEmail(saved || 'Activated User')
        setStep('thank_you')
      } else {
        const saved = await getSavedUserEmail()
        if (saved) setEmail(saved)
        setStep('activate')
      }
    })()
  }, [])

  const handleActivate = useCallback(async () => {
    const trimmed = email.trim()
    if (!trimmed) {
      setError('Please enter your work email to activate OpenAPI Companion.')
      return
    }

    if (!EMAIL_REGEX.test(trimmed)) {
      setError('Please enter a valid email address (e.g. dev@company.com).')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      await completeOnboarding(trimmed)
      await sendFeedback({
        type: 'install_lead',
        email: trimmed,
        message: subscribed
          ? 'Install lead: subscribed to updates'
          : 'Install lead: opted out of updates',
      })
    } catch {
      await completeOnboarding(trimmed)
    } finally {
      setIsSubmitting(false)
      setRegisteredEmail(trimmed)
      setStep('thank_you')
      onActivated?.(trimmed)
    }
  }, [email, subscribed, onActivated])

  if (step === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4 text-text">
        <Spinner className="h-6 w-6 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg text-text antialiased selection:bg-primary selection:text-white relative overflow-x-hidden p-4 sm:p-8">
      {/* Subtle ambient gradient mesh in background */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[850px] h-[380px] bg-gradient-to-b from-primary/15 via-primary/5 to-transparent blur-3xl opacity-70" />

      <div className="relative max-w-5xl mx-auto flex flex-col gap-8">
        {/* Header / Brand Bar */}
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-5">
          <div className="flex items-center gap-3.5">
            <BrandIcon className="h-12 w-12 rounded-2xl shadow-lg shadow-primary/25 ring-1 ring-white/10" />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight text-text">{APP_NAME}</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-primary border border-primary/20">
                  v{APP_VERSION}
                </span>
              </div>
              <p className="text-xs text-muted">
                The smart sidebar companion for Swagger & OpenAPI
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success border border-success/20">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              Extension Ready
            </span>
          </div>
        </header>

        {/* Content View: Activate vs Thank You */}
        {step === 'activate' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Headline & Form */}
            <div className="lg:col-span-7 flex flex-col gap-6">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-surface/80 px-3 py-1 text-xs text-muted mb-3.5">
                  <SparklesIcon className="h-3.5 w-3.5 text-primary" />
                  <span>Finish setup in 10 seconds</span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-text leading-tight">
                  Supercharge your{' '}
                  <span className="bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">
                    Swagger UI
                  </span>{' '}
                  directly in your browser sidebar.
                </h1>
                <p className="mt-3 text-sm text-muted leading-relaxed max-w-xl">
                  Test endpoints directly in your browser sidebar, chain auth tokens automatically,
                  generate clean curl commands, and manage environment variables—all stored 100%
                  locally.
                </p>
              </div>

              {/* Form Card */}
              <div className="rounded-2xl border border-border bg-surface/50 backdrop-blur-xl p-5 sm:p-6 shadow-xl">
                <div className="flex items-center justify-between pb-4 border-b border-border">
                  <div>
                    <h2 className="text-sm font-semibold text-text">Activate OpenAPI Companion</h2>
                    <p className="text-xs text-muted mt-0.5">
                      Enter your work email to activate the companion and get new release notes.
                    </p>
                  </div>
                  <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-medium text-primary">
                    Required
                  </span>
                </div>

                <form
                  noValidate
                  className="mt-6 space-y-5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleActivate()
                  }}
                >
                  <div>
                    <label
                      htmlFor="welcome-email-input"
                      className="block text-sm font-semibold text-text mb-2"
                    >
                      Work Email Address <span className="text-primary font-bold">*</span>
                    </label>
                    <Input
                      id="welcome-email-input"
                      type="email"
                      placeholder="developer@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        if (error) setError(null)
                      }}
                      error={error}
                      className="w-full px-4 py-3.5 text-base rounded-xl border-border/80 bg-surface/90 shadow-inner focus-visible:ring-2 focus-visible:ring-primary/40 transition-all"
                      autoFocus
                    />
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-muted cursor-pointer select-none leading-relaxed pt-1">
                    <input
                      type="checkbox"
                      checked={subscribed}
                      onChange={(e) => setSubscribed(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>
                      Send me major release notes, Swagger productivity tips, and updates.
                    </span>
                  </label>

                  <Button
                    type="submit"
                    variant="primary"
                    onClick={handleActivate}
                    disabled={isSubmitting}
                    className="w-full py-3.5 text-base font-semibold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                  >
                    {isSubmitting ? (
                      <>
                        <Spinner className="h-4 w-4 border-white border-t-transparent mr-2" />
                        <span>Activating Companion...</span>
                      </>
                    ) : (
                      <span>Activate Companion & Get Started</span>
                    )}
                  </Button>
                </form>

                <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span className="flex items-center gap-1.5">
                    <LockIcon className="h-3.5 w-3.5 text-muted" />
                    100% Local-first: tokens never leave your browser
                  </span>
                  <span>Zero telemetry</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Code & Sidebar Preview */}
            <div className="lg:col-span-5 flex flex-col gap-6">
              {/* Preview Terminal */}
              <div className="rounded-2xl border border-border bg-surface/30 p-5 shadow-lg">
                <div className="flex items-center justify-between pb-3 border-b border-border text-xs font-mono text-muted">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-danger/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-warning/80" />
                    <div className="h-2.5 w-2.5 rounded-full bg-success/80" />
                    <span className="ml-2 text-[11px] font-medium text-text">
                      Sidebar Companion
                    </span>
                  </div>
                  <span className="rounded bg-success/10 border border-success/20 px-2 py-0.5 text-[10px] font-bold text-success font-mono">
                    200 OK
                  </span>
                </div>

                <div className="mt-3.5 space-y-3 font-mono text-xs">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-bg border border-border">
                    <span className="rounded bg-success/20 border border-success/30 px-2 py-0.5 text-[10px] font-bold text-success">
                      POST
                    </span>
                    <span className="text-text text-[11px]">/api/v1/auth/login</span>
                  </div>

                  <div className="p-3 rounded-lg bg-bg/80 border border-border text-[11px] leading-relaxed text-text space-y-1">
                    <div className="text-muted">// Auto-captured token saved to environment</div>
                    <div>
                      <span className="text-primary font-semibold">"token"</span>:{' '}
                      <span className="text-success">"eyJhbGciOi..."</span>,
                    </div>
                    <div>
                      <span className="text-primary font-semibold">"expires_in"</span>:{' '}
                      <span className="text-warning">3600</span>,
                    </div>
                    <div>
                      <span className="text-primary font-semibold">"status"</span>:{' '}
                      <span className="text-muted">"authenticated"</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-lg bg-bg border border-border flex items-center gap-2">
                      <ZapIcon className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <div className="text-text font-medium text-xs">1-Click cURL</div>
                        <div className="text-muted text-[10px]">Pre-filled with tokens</div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-bg border border-border flex items-center gap-2">
                      <SparklesIcon className="h-4 w-4 text-primary shrink-0" />
                      <div>
                        <div className="text-text font-medium text-xs">Auto Chaining</div>
                        <div className="text-muted text-[10px]">Pass IDs to next call</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Petstore Link */}
              <div className="rounded-xl border border-border bg-surface/20 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-text">Want to see it in action?</p>
                  <p className="text-[11px] text-muted">Test immediately on Swagger Petstore</p>
                </div>
                <a
                  href={PETSTORE_DEMO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <span>Try Demo</span>
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        ) : (
          /* Thank You / Success View */
          <div className="max-w-2xl mx-auto w-full flex flex-col gap-6 py-4">
            <div className="rounded-2xl border border-success/30 bg-success/5 p-6 shadow-xl space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-success/20 text-success flex items-center justify-center shrink-0 shadow-lg shadow-success/20">
                  <CheckIcon className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-text">
                    Thank you! OpenAPI Companion is activated.
                  </h2>
                  <p className="text-xs text-muted mt-1">
                    Registered as{' '}
                    <span className="font-mono font-semibold text-text">{registeredEmail}</span>
                  </p>
                </div>
              </div>

              {/* 3 Step Quick Start Guide */}
              <div className="rounded-xl border border-border bg-bg p-4 sm:p-5 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  How to use OpenAPI Companion
                </h3>

                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold shrink-0 mt-0.5">
                      <PinIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">
                        1. Pin the extension to your toolbar
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        Click the puzzle icon (🧩) in your Chrome toolbar and pin OpenAPI Companion
                        for 1-click access anytime.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">
                        2. Open any Swagger UI or OpenAPI page
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        The extension automatically detects OpenAPI documentation on your localhost,
                        staging, or production sites.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold shrink-0 mt-0.5">
                      <ZapIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-text">
                        3. Test directly in your sidebar
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        Press{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-surface text-text font-mono text-[10px] border border-border">
                          Ctrl+Shift+O
                        </kbd>{' '}
                        (or{' '}
                        <kbd className="px-1.5 py-0.5 rounded bg-surface text-text font-mono text-[10px] border border-border">
                          Cmd+Shift+O
                        </kbd>{' '}
                        on Mac) or click the floating sidebar button to open your companion.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <a
                  href={PETSTORE_DEMO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-primary/25 hover:bg-primary/90 transition-colors"
                >
                  <span>Try Live Demo (Swagger Petstore)</span>
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                </a>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.close) {
                      window.close()
                    }
                  }}
                  className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium"
                >
                  Close Tab
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
