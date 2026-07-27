import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/providers/useAuth'
import { useI18n } from '@/i18n/useI18n'
import { FullPageSpinner } from '@/components/Spinner'

/**
 * Landing point for the OAuth / magic-link redirect. The Supabase client is
 * configured with `detectSessionInUrl`, so it exchanges the code on load and
 * all this screen has to do is wait for the session and move on.
 */
export default function AuthCallback() {
  const { session, initializing } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Supabase reports provider failures as query/hash params on the redirect.
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, '') || window.location.search,
    )
    if (params.get('error') || params.get('error_description')) setFailed(true)
  }, [])

  useEffect(() => {
    if (initializing || failed) return
    navigate(session ? '/' : '/login', { replace: true })
  }, [session, initializing, failed, navigate])

  if (failed) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-danger text-sm">{t('auth.error.generic')}</p>
        <button
          type="button"
          onClick={() => navigate('/login', { replace: true })}
          className="bg-brand text-on-brand rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          {t('common.retry')}
        </button>
      </main>
    )
  }

  return <FullPageSpinner label={t('auth.completing')} />
}
