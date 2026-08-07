import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { finishAccountDeletion, requestAccountDeletion } from '@/lib/api'
import { unsubscribeFromPush } from '@/lib/push'
import { BackIcon, WarningIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

/** Designs 8e (dark) / 8f (light) — irreversible, typed confirmation. */
export default function DeleteAccount() {
  const { t } = useI18n()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = confirmText.trim() === t('delete.confirmWord')

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await requestAccountDeletion()
      await finishAccountDeletion()
      try {
        // The DB row is already gone via cascade, but the browser's own push
        // registration isn't — worth clearing so this device doesn't keep a
        // subscription for an account that no longer exists.
        await unsubscribeFromPush()
        await signOut()
      } catch {
        // The account no longer exists server-side at this point, so either
        // of these failing is expected, not worth surfacing.
      }
      navigate('/login', { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('delete.error'))
      setBusy(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-[26px] pt-14 pb-safe"
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
        <h1 className="text-[19px] font-bold">{t('delete.title')}</h1>
      </header>

      <div className="flex flex-shrink-0 flex-col items-center gap-3.5">
        <div className="bg-danger/15 text-danger flex size-[60px] items-center justify-center rounded-full">
          <WarningIcon size={28} />
        </div>
        <div className="text-[18px] font-bold">{t('delete.irreversible')}</div>
      </div>

      <div className="border-line bg-surface text-fg-muted flex-shrink-0 rounded-[16px] border px-[17px] py-4 text-[13.5px] leading-relaxed">
        {t('delete.body')}
      </div>

      <div className="flex-shrink-0">
        <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
          {t('delete.confirmLabel')}
        </div>
        <input
          value={confirmText}
          onChange={(event) => setConfirmText(event.target.value)}
          placeholder={t('delete.confirmWord')}
          className="border-danger bg-surface w-full rounded-[14px] border-[1.4px] px-4 py-[15px] text-[15px] font-semibold outline-none"
        />
      </div>

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void handleDelete()}
        disabled={!ready || busy}
        className="bg-danger text-on-brand mt-auto flex h-[54px] flex-shrink-0 items-center justify-center gap-2 rounded-[15px] text-base font-bold disabled:opacity-50"
      >
        {busy ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('delete.button')}
      </button>
    </main>
  )
}
