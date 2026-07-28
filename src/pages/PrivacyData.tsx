import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { fetchBlockedUsers, exportMyData, type BlockedUser } from '@/lib/api'
import { unblockUser } from '@/lib/chat'
import { setPresenceSharing } from '@/hooks/usePresence'
import { BackIcon, DownloadIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

/** Designs 8c (dark) / 8d (light). */
export default function PrivacyData() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [sharesPresence, setSharesPresence] = useState(
    () => localStorage.getItem('pisga.presence') !== 'off',
  )
  const [exporting, setExporting] = useState(false)

  const { data, loading, patch } = useAsync<BlockedUser[]>(
    () => (user ? fetchBlockedUsers(user.id) : Promise.resolve([])),
    [user?.id],
  )
  const blocked = data ?? []

  async function handleUnblock(id: string) {
    patch((current) => current.filter((person) => person.id !== id))
    await unblockUser(id)
  }

  async function handleExport() {
    if (!user) return
    setExporting(true)
    try {
      const payload = await exportMyData(user.id)
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'pisga-data.json'
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-[22px] pt-14 pb-8"
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
        <h1 className="text-[19px] font-bold">{t('privacy.title')}</h1>
      </header>

      <button
        type="button"
        role="switch"
        aria-checked={sharesPresence}
        onClick={() => {
          const next = !sharesPresence
          setSharesPresence(next)
          setPresenceSharing(next)
        }}
        className="border-line bg-surface flex flex-shrink-0 items-center justify-between rounded-[16px] border px-[17px] py-4 text-start"
      >
        <span>
          <span className="block text-[15px] font-semibold">{t('chat.presence')}</span>
          <span className="text-fg-muted mt-0.5 block text-xs">{t('chat.presenceSub')}</span>
        </span>
        <span
          className={`relative h-[27px] w-[46px] flex-none rounded-full transition-colors ${
            sharesPresence ? 'bg-fg' : 'bg-line'
          }`}
        >
          <span
            className={`absolute top-[3px] size-[21px] rounded-full transition-all ${
              sharesPresence ? 'bg-bg end-[3px]' : 'bg-fg-muted start-[3px]'
            }`}
          />
        </span>
      </button>

      <div className="flex-shrink-0">
        <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
          {t('privacy.blockedUsers')}
        </div>
        {loading ? (
          <div className="flex justify-center py-4">
            <Spinner className="size-5" />
          </div>
        ) : blocked.length === 0 ? (
          <p className="text-fg-subtle text-[13px]">{t('privacy.blockedEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {blocked.map((person) => (
              <div
                key={person.id}
                className="border-line bg-surface flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
              >
                <div className="bg-surface-raised text-fg-muted flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold">
                  {(person.display_name ?? '?').trim().charAt(0)}
                </div>
                <div className="flex-1 text-[14.5px] font-semibold">{person.display_name}</div>
                <button
                  type="button"
                  onClick={() => void handleUnblock(person.id)}
                  className="text-fg-muted text-[13px] font-semibold"
                >
                  {t('privacy.unblock')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={exporting}
        className="border-line flex flex-shrink-0 items-center justify-center gap-2.5 rounded-[14px] border py-3.5 text-[14.5px] font-semibold disabled:opacity-60"
      >
        {exporting ? <Spinner className="size-4" /> : <DownloadIcon size={18} />}
        {t('privacy.downloadData')}
      </button>

      <div className="border-line mt-auto flex-shrink-0 border-t pt-4.5">
        <button
          type="button"
          onClick={() => navigate('/profile/delete')}
          className="text-danger border-danger/45 w-full rounded-[14px] border py-3.5 text-[14.5px] font-bold"
        >
          {t('privacy.deleteAccount')}
        </button>
        <p className="text-fg-subtle mt-2 text-center text-[11.5px]">
          {t('privacy.deleteIrreversible')}
        </p>
      </div>
    </main>
  )
}
