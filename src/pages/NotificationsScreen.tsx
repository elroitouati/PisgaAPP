import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { categoryStyle } from '@/lib/categories'
import { currentPushSubscription, pushSupported, subscribeToPush } from '@/lib/push'
import { BackIcon, BellIcon, DownloadIcon, ShareMoreIcon } from '@/components/icons'
import { PrimaryButton } from '@/components/ui'
import { Spinner } from '@/components/Spinner'

function isIOSSafari() {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

type Status = 'checking' | 'unsupported' | 'denied' | 'subscribed' | 'ready'

/**
 * Designs 8i (dark) / 8j (light) for the iOS "add to home screen" explainer,
 * plus a real subscribe flow for every other platform: request permission,
 * subscribe this browser, save the subscription (supabase/functions/ sends
 * to it once a badge/goal/message/reminder event fires).
 */
export default function NotificationsScreen() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<Status>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const needsIOSInstall = isIOSSafari() && !isStandalone()

  useEffect(() => {
    let active = true
    async function check() {
      if (!pushSupported()) return active && setStatus('unsupported')
      if (Notification.permission === 'denied') return active && setStatus('denied')
      const existing = await currentPushSubscription()
      if (active) setStatus(existing ? 'subscribed' : 'ready')
    }
    void check()
    return () => {
      active = false
    }
  }, [])

  async function enable() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      await subscribeToPush(user.id)
      setStatus('subscribed')
    } catch (caught) {
      setStatus(Notification.permission === 'denied' ? 'denied' : 'ready')
      setError(caught instanceof Error ? caught.message : t('push.enableButton'))
    } finally {
      setBusy(false)
    }
  }

  if (needsIOSInstall) {
    return (
      <main
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-[26px] pt-14 pb-safe"
        style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      >
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-fg-muted flex-shrink-0 self-start text-[13px]"
        >
          {t('common.skip')}
        </button>

        <div className="mt-5.5 flex flex-shrink-0 flex-col items-center gap-4">
          <div style={categoryStyle('physical')} className="flex size-16 items-center justify-center rounded-[18px] bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] text-[var(--cat)]">
            <BellIcon size={30} />
          </div>
          <div className="text-center">
            <div className="text-[21px] font-bold">{t('push.title')}</div>
            <p className="text-fg-muted mx-auto mt-2 max-w-[280px] text-[13.5px] leading-relaxed">
              {t('push.body')}
            </p>
          </div>
        </div>

        <div className="my-5 flex flex-1 flex-col justify-center gap-3.5">
          <Step index={1} icon={<ShareMoreIcon size={22} />} label={t('push.step1')} />
          <Step index={2} icon={<DownloadIcon size={22} />} label={t('push.step2')} />
        </div>

        <PrimaryButton onClick={() => navigate(-1)}>{t('push.done')}</PrimaryButton>
      </main>
    )
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-[26px] pt-14 pb-safe"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon />
        </button>
        <h1 className="text-[19px] font-bold">{t('profile.menu.notifications')}</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div style={categoryStyle('physical')} className="flex size-16 items-center justify-center rounded-[18px] bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] text-[var(--cat)]">
          <BellIcon size={30} />
        </div>
        <div>
          <div className="text-[19px] font-bold">{t('push.enableTitle')}</div>
          <p className="text-fg-muted mx-auto mt-2 max-w-[280px] text-[13.5px] leading-relaxed">
            {t('push.enableBody')}
          </p>
        </div>

        {status === 'subscribed' ? (
          <p style={categoryStyle('physical')} className="text-sm font-semibold text-[var(--cat)]">
            {t('push.enabled')}
          </p>
        ) : status === 'denied' ? (
          <p className="text-fg-subtle text-[13px]">{t('push.denied')}</p>
        ) : status === 'unsupported' || status === 'checking' ? null : (
          <PrimaryButton className="w-full" disabled={busy} onClick={() => void enable()}>
            {busy ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
            {t('push.enableButton')}
          </PrimaryButton>
        )}

        {error ? (
          <p role="alert" className="text-danger text-xs">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  )
}

function Step({ index, icon, label }: { index: number; icon: React.ReactNode; label: string }) {
  return (
    <div className="border-line bg-surface flex items-center gap-3.5 rounded-[16px] border px-4 py-[15px]">
      <span className="bg-surface-raised flex size-8 flex-none items-center justify-center rounded-[9px] text-[13px] font-bold">
        {index}
      </span>
      <span className="flex-none">{icon}</span>
      <span className="text-[14.5px] font-semibold">{label}</span>
    </div>
  )
}
