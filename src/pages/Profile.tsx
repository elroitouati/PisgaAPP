import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { LanguageToggle, ThemeToggle } from '@/components/SettingsToggles'
import { Card, SectionLabel } from '@/components/ui'
import { SummitIcon } from '@/components/icons'
import { useState } from 'react'
import { setPresenceSharing } from '@/hooks/usePresence'

/** Design 3d, trimmed to the settings PRD 10 lists for the MVP. */
export default function Profile() {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const [sharesPresence, setSharesPresence] = useState(
    () => localStorage.getItem('pisga.presence') !== 'off',
  )

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('nav.profile')}</h1>
        <span className="text-fg-subtle flex items-center gap-1.5 text-xs font-extrabold tracking-[0.16em]">
          <SummitIcon size={13} strokeWidth={2} />
          {t('app.wordmark')}
        </span>
      </header>

      <Card className="mt-4.5 flex items-center gap-3.5 p-4">
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <div className="bg-surface-raised text-fg-muted flex size-12 items-center justify-center rounded-full text-lg font-bold">
            {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold">
            {profile?.display_name ?? user?.email}
          </div>
          <div className="text-fg-muted truncate text-xs" dir="ltr">
            {user?.email}
          </div>
        </div>
      </Card>

      <div className="mt-6 mb-2.5">
        <SectionLabel>{t('common.language')}</SectionLabel>
      </div>
      <LanguageToggle />

      <div className="mt-6 mb-2.5">
        <SectionLabel>{t('common.theme')}</SectionLabel>
      </div>
      <ThemeToggle />

      {/* Presence tells friends when you have the app open, so it is opt-out
          rather than always-on. */}
      <div className="mt-6 mb-2.5">
        <SectionLabel>{t('chat.presence')}</SectionLabel>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={sharesPresence}
        onClick={() => {
          const next = !sharesPresence
          setSharesPresence(next)
          setPresenceSharing(next)
        }}
        className="border-line bg-surface flex items-center justify-between rounded-[16px] border px-[17px] py-4 text-start"
      >
        <span className="text-fg-muted text-xs">{t('chat.presenceSub')}</span>
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

      <button
        type="button"
        onClick={() => void signOut()}
        className="border-line text-fg-muted mt-auto rounded-[14px] border py-3.5 text-sm font-medium"
      >
        {t('common.signOut')}
      </button>
    </>
  )
}
