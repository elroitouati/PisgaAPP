import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { ThemeSwitch } from '@/components/ThemeSwitch'
import { Card, SectionLabel } from '@/components/ui'
import {
  BackIcon,
  BellIcon,
  LockIcon,
  ProfileIcon,
  SocialIcon,
  SummitIcon,
  TargetIcon,
} from '@/components/icons'

/** Design 5k, trimmed to the settings PRD 10 lists for the MVP. */
export default function Profile() {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('nav.profile')}</h1>
        <span className="text-fg-subtle flex items-center gap-1.5 text-xs font-extrabold tracking-[0.16em]">
          <SummitIcon size={13} strokeWidth={2} />
          {t('app.wordmark')}
        </span>
      </header>

      <button
        type="button"
        onClick={() => navigate('/profile/edit')}
        className="mt-4.5 text-start"
      >
        <Card className="flex items-center gap-3.5 p-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-12 rounded-full object-cover" />
          ) : (
            <div className="bg-surface-raised text-fg-muted flex size-12 items-center justify-center rounded-full text-lg font-bold">
              {(profile?.display_name ?? user?.email ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">
              {profile?.display_name ?? user?.email}
            </div>
            <div className="text-fg-muted truncate text-xs" dir="ltr">
              {user?.email}
            </div>
          </div>
          <span className="text-fg-subtle">
            <BackIcon size={17} className="rotate-180" />
          </span>
        </Card>
      </button>

      <div className="mt-6 mb-2.5">
        <SectionLabel>{t('common.theme')}</SectionLabel>
      </div>
      <ThemeSwitch />

      <div className="mt-6 flex flex-col gap-2">
        <MenuRow
          icon={<ProfileIcon size={19} />}
          label={t('profile.menu.edit')}
          onClick={() => navigate('/profile/edit')}
        />
        <MenuRow
          icon={<BellIcon size={19} />}
          label={t('profile.menu.notifications')}
          onClick={() => navigate('/profile/notifications')}
        />
        <MenuRow
          icon={<LockIcon size={19} />}
          label={t('profile.menu.privacy')}
          onClick={() => navigate('/profile/privacy')}
        />
        <MenuRow
          icon={<TargetIcon size={19} />}
          label={t('profile.menu.myGoals')}
          onClick={() => navigate('/profile/goals')}
        />
        <MenuRow
          icon={<SocialIcon size={19} />}
          label={t('profile.menu.invite')}
          onClick={() => navigate('/profile/invite')}
        />
      </div>

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

function MenuRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line bg-surface flex items-center gap-3.5 rounded-[14px] border px-4 py-3.5 text-start"
    >
      <span className="text-fg-muted flex-none">{icon}</span>
      <span className="flex-1 text-[14.5px] font-semibold">{label}</span>
      <span className="text-fg-subtle">
        <BackIcon size={17} className="rotate-180" />
      </span>
    </button>
  )
}
