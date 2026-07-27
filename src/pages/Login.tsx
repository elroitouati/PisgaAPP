import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/useAuth'
import { useI18n } from '@/i18n/useI18n'
import { Spinner } from '@/components/Spinner'
import { LanguageToggle, ThemeToggle } from '@/components/SettingsToggles'
import { GoogleIcon, PisgaMark } from '@/components/Brand'

type Status = 'idle' | 'google' | 'email' | 'sent'

export default function Login() {
  const { session, signInWithGoogle, signInWithEmail } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)

  if (session) {
    const from = (location.state as { from?: Location } | null)?.from
    return <Navigate to={from?.pathname ?? '/'} replace />
  }

  const busy = status === 'google' || status === 'email'

  async function handleGoogle() {
    setError(null)
    setStatus('google')
    try {
      await signInWithGoogle()
      // On success the browser navigates to Google, so this component unmounts.
    } catch {
      setError(t('auth.error.generic'))
      setStatus('idle')
    }
  }

  async function handleEmail(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError(t('auth.error.invalidEmail'))
      return
    }

    setStatus('email')
    try {
      await signInWithEmail(email)
      setStatus('sent')
    } catch {
      setError(t('auth.error.generic'))
      setStatus('idle')
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10">
      <header className="flex flex-col items-center gap-3 text-center">
        <PisgaMark className="text-brand size-14" />
        <h1 className="text-2xl font-bold">{t('auth.title')}</h1>
        <p className="text-fg-muted max-w-xs text-sm">{t('auth.subtitle')}</p>
      </header>

      <div className="border-line bg-surface w-full max-w-sm rounded-2xl border p-6 shadow-sm">
        {status === 'sent' ? (
          <p role="status" className="text-fg text-center text-sm">
            {t('auth.linkSent')}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy}
              className="border-line bg-surface hover:bg-surface-raised flex w-full items-center justify-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors disabled:opacity-60"
            >
              {status === 'google' ? <Spinner /> : <GoogleIcon className="size-5" />}
              {t('auth.google')}
            </button>

            <div className="flex items-center gap-3">
              <span className="bg-line h-px flex-1" />
              <span className="text-fg-subtle text-xs">{t('auth.or')}</span>
              <span className="bg-line h-px flex-1" />
            </div>

            <form onSubmit={handleEmail} className="flex flex-col gap-3">
              <label htmlFor="email" className="text-fg-muted text-xs font-medium">
                {t('auth.emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                disabled={busy}
                className="border-line bg-bg focus:border-brand rounded-xl border px-4 py-3 text-sm transition-colors outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy}
                className="bg-brand text-on-brand hover:bg-brand-strong flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {status === 'email' ? <Spinner /> : null}
                {status === 'email' ? t('auth.sending') : t('auth.sendLink')}
              </button>
            </form>
          </div>
        )}

        {error ? (
          <p role="alert" className="text-danger mt-4 text-center text-xs">
            {error}
          </p>
        ) : null}
      </div>

      <p className="text-fg-subtle max-w-xs text-center text-xs">{t('auth.terms')}</p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </main>
  )
}
