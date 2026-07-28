import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { LanguageToggle, ThemeToggle } from '@/components/SettingsToggles'
import { Card, SectionLabel } from '@/components/ui'
import { SummitIcon } from '@/components/icons'

/** Design 3d, trimmed to the settings PRD 10 lists for the MVP. */
export default function Profile() {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()

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
