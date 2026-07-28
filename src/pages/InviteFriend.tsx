import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAsync } from '@/hooks/useAsync'
import { fetchMyInviteCode, regenerateInviteCode, type InviteCode } from '@/lib/api'
import { categoryStyle } from '@/lib/categories'
import { BackIcon, ShareMoreIcon, SocialIcon, WhatsAppIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

/** Designs 8k (dark) / 8l (light). */
export default function InviteFriend() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data, patch } = useAsync<InviteCode | null>(() => fetchMyInviteCode(), [])
  const link = data ? `${window.location.origin}/join/${data.token}` : ''

  async function copyLink() {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function nativeShare() {
    if (navigator.share) await navigator.share({ url: link, text: t('invite.headline') })
    else void copyLink()
  }

  async function regenerate() {
    if (!window.confirm(t('invite.regenerateConfirm'))) return
    setRegenerating(true)
    setError(null)
    try {
      const next = await regenerateInviteCode()
      patch(() => next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('invite.regenerateError'))
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <main
      style={{ ...categoryStyle('social'), paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-[26px] pb-8"
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
        <h1 className="text-[19px] font-bold">{t('invite.title')}</h1>
      </header>

      <div className="mt-[30px] flex flex-shrink-0 flex-col items-center gap-4">
        <div className="flex size-17 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] text-[var(--cat)]">
          <SocialIcon size={32} strokeWidth={1.6} />
        </div>
        <div className="text-center">
          <div className="text-[20px] font-bold">{t('invite.headline')}</div>
          <p className="text-fg-muted mx-auto mt-2 max-w-[270px] text-[13.5px] leading-relaxed">
            {t('invite.body')}
          </p>
        </div>
      </div>

      {link ? (
        <>
          <div className="border-line bg-surface mt-[30px] flex flex-shrink-0 items-center gap-3 rounded-[16px] border px-[17px] py-4">
            <span dir="ltr" className="text-fg-muted min-w-0 flex-1 truncate font-mono text-[14.5px]">
              {link.replace(/^https?:\/\//, '')}
            </span>
            <button
              type="button"
              onClick={() => void copyLink()}
              className="border-line flex-none rounded-full border px-3 py-1.5 text-[13px] font-semibold"
            >
              {copied ? t('invite.copied') : t('invite.copy')}
            </button>
          </div>

          <div className="mt-3.5 flex flex-shrink-0 gap-2.5">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${t('invite.headline')} ${link}`)}`}
              target="_blank"
              rel="noreferrer"
              className="flex h-13 flex-1 items-center justify-center gap-2 rounded-[15px] bg-[#25D366] text-[15px] font-bold text-black"
            >
              <WhatsAppIcon size={19} />
              {t('invite.whatsapp')}
            </a>
            <button
              type="button"
              onClick={() => void nativeShare()}
              className="border-line flex h-13 flex-1 items-center justify-center gap-2 rounded-[15px] border text-[15px] font-semibold"
            >
              <ShareMoreIcon size={18} />
              {t('invite.more')}
            </button>
          </div>
        </>
      ) : (
        <div className="mt-10 flex flex-shrink-0 justify-center">
          <Spinner className="size-6" />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-danger mt-3 flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void regenerate()}
        disabled={regenerating || !link}
        className="text-fg-muted mt-auto flex-shrink-0 pt-6 text-center text-[13px] font-semibold disabled:opacity-50"
      >
        {regenerating ? <Spinner className="mx-auto size-4" /> : t('invite.regenerate')}
      </button>
    </main>
  )
}
