import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/useAuth'
import { useI18n } from '@/i18n/useI18n'
import type { TranslationKey } from '@/i18n/translations'
import { useTheme } from '@/providers/useTheme'
import { Spinner } from '@/components/Spinner'
import { BackIcon, MailIcon } from '@/components/icons'
import { ThemeSwitch } from '@/components/ThemeSwitch'

type Mode = 'choose' | 'signIn' | 'signUp'
type Busy = null | 'google' | 'form' | 'otp'

const PASSWORD_MIN = 8

// The Google button is a dead end until a real OAuth app exists for this
// project: signInWithOAuth navigates the whole page to Supabase's
// /authorize endpoint before any JS of ours runs, so a "provider not
// enabled" 400 renders as raw JSON with no chance for a try/catch to turn
// it into a friendly message. Hidden rather than shown-and-broken.
const GOOGLE_AUTH_ENABLED = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true'

/** Design 5f (light) / 3a (dark). */
export default function Login() {
  const { session, signInWithGoogle, signInWithPassword, signUpWithPassword, verifySignupCode } =
    useAuth()
  const { t } = useI18n()
  const { theme } = useTheme()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>('choose')
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  // Set once signUp comes back needing confirmation. Its presence, not `mode`,
  // is what switches the screen to the code field — the two are independent
  // because the user could in principle back out and return to this state.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [code, setCode] = useState('')

  if (session) {
    const from = (location.state as { from?: { pathname: string } } | null)?.from
    return <Navigate to={from?.pathname ?? '/'} replace />
  }

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }))

  async function handleGoogle() {
    setError(null)
    setBusy('google')
    try {
      await signInWithGoogle()
      // Success navigates away to Google, so this component unmounts.
    } catch {
      setError(t('auth.error.generic'))
      setBusy(null)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setError(t('auth.error.invalidEmail'))
      return
    }
    if (mode === 'signUp' && form.password.length < PASSWORD_MIN) {
      setError(t('auth.error.shortPassword'))
      return
    }

    setBusy('form')
    try {
      if (mode === 'signUp') {
        const needsConfirmation = await signUpWithPassword(form.email, form.password, form.name)
        if (needsConfirmation) setPendingEmail(form.email)
      } else {
        await signInWithPassword(form.email, form.password)
      }
    } catch (caught) {
      setError(messageFor(caught, mode, t))
    } finally {
      setBusy(null)
    }
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault()
    if (!pendingEmail) return
    setError(null)
    setBusy('otp')
    try {
      await verifySignupCode(pendingEmail, code.trim())
      // Success updates the session via onAuthStateChange; the `if (session)`
      // guard above then navigates away on the next render.
    } catch {
      setError(t('auth.error.badCode'))
      setBusy(null)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-6 pt-16 pb-9">
      <ThemeSwitch className="self-end" />

      {/* The full mountain lockup is reserved for this screen (PRD 7). */}
      <div className="my-3.5 flex flex-1 flex-col items-center justify-center gap-[22px]">
        <img
          src={theme === 'dark' ? '/brand/pisga-dark.webp' : '/brand/pisga-light.webp'}
          alt={t('app.name')}
          width={296}
          height={121}
          className="h-auto w-[296px] max-w-[90%]"
        />
        <p className="text-fg-muted text-sm font-medium tracking-[0.36em]">פ ס ג ה</p>
      </div>

      <div className="mb-[26px] text-center">
        <h1 className="text-[22px] leading-tight font-bold">{t('auth.headline')}</h1>
        <p className="text-fg-muted mt-1.5 text-sm leading-relaxed whitespace-pre-line">
          {t('auth.sub')}
        </p>
      </div>

      {pendingEmail ? (
        <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
          <p className="text-fg-muted text-center text-[13px] leading-relaxed">
            {t('auth.confirmEmail').replace('{email}', pendingEmail)}
          </p>

          <Field
            id="otp"
            type="text"
            inputMode="numeric"
            dir="ltr"
            label={t('auth.otpLabel')}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            disabled={busy !== null}
            className="text-center text-[20px] tracking-[0.3em]"
          />

          <button
            type="submit"
            disabled={busy !== null || code.trim().length === 0}
            className="bg-brand text-on-brand mt-1 flex h-[52px] items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold disabled:opacity-60"
          >
            {busy === 'otp' ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
            {t('auth.otpSubmit')}
          </button>

          <button
            type="button"
            onClick={() => {
              setPendingEmail(null)
              setCode('')
              setError(null)
            }}
            className="text-fg-muted mt-1 text-[13px]"
          >
            {t('common.back')}
          </button>
        </form>
      ) : mode === 'choose' ? (
        <div className="flex flex-col gap-[11px]">
          {GOOGLE_AUTH_ENABLED ? (
            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy !== null}
              className="bg-brand text-on-brand flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-semibold disabled:opacity-60"
            >
              {busy === 'google' ? (
                <Spinner className="border-on-brand/30 border-t-on-brand" />
              ) : (
                <span className="bg-on-brand text-brand flex size-[22px] items-center justify-center rounded-full text-sm font-bold">
                  G
                </span>
              )}
              {t('auth.google')}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setMode('signIn')}
            className="border-line text-fg flex h-[52px] items-center justify-center gap-2.5 rounded-[14px] border text-[15px] font-semibold"
          >
            <MailIcon size={19} />
            {t('auth.email')}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => {
              setMode('choose')
              setError(null)
            }}
            className="text-fg-muted -mt-2 mb-1 flex items-center gap-1.5 self-start text-[13px]"
          >
            <BackIcon size={18} />
            {t('common.back')}
          </button>

          {mode === 'signUp' ? (
            <Field
              id="name"
              label={t('auth.nameLabel')}
              placeholder={t('auth.namePlaceholder')}
              value={form.name}
              onChange={set('name')}
              autoComplete="name"
              disabled={busy !== null}
            />
          ) : null}

          <Field
            id="email"
            type="email"
            dir="ltr"
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            value={form.email}
            onChange={set('email')}
            autoComplete="email"
            disabled={busy !== null}
          />

          <Field
            id="password"
            type="password"
            dir="ltr"
            label={t('auth.passwordLabel')}
            value={form.password}
            onChange={set('password')}
            autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
            disabled={busy !== null}
          />

          <button
            type="submit"
            disabled={busy !== null}
            className="bg-brand text-on-brand mt-1 flex h-[52px] items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold disabled:opacity-60"
          >
            {busy === 'form' ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
            {mode === 'signUp' ? t('auth.signUp') : t('auth.signIn')}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signUp' ? 'signIn' : 'signUp')
              setError(null)
            }}
            className="text-fg-muted mt-1 text-[13px]"
          >
            {mode === 'signUp' ? t('auth.toSignIn') : t('auth.toSignUp')}
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="text-danger mt-4 text-center text-xs">
          {error}
        </p>
      ) : null}
      <p className="text-fg-subtle mt-5 text-center text-[11px] leading-relaxed">
        {t('auth.terms')}
      </p>
    </main>
  )
}

function Field({
  id,
  label,
  className = '',
  ...input
}: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5">
      <span className="text-fg-muted text-xs font-medium">{label}</span>
      <input
        id={id}
        {...input}
        className={`border-line bg-surface focus:border-fg h-[52px] rounded-[14px] border px-4 text-[15px] transition-colors outline-none disabled:opacity-60 ${className}`}
      />
    </label>
  )
}

/** Supabase returns human-readable messages; map the two we can act on. */
function messageFor(caught: unknown, mode: Mode, t: (key: TranslationKey) => string) {
  const raw = caught instanceof Error ? caught.message.toLowerCase() : ''
  if (raw.includes('already registered') || raw.includes('already been registered')) {
    return t('auth.error.emailTaken')
  }
  if (mode === 'signIn' && raw.includes('invalid login credentials')) {
    return t('auth.error.badCredentials')
  }
  return t('auth.error.generic')
}
