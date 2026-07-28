import { NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon,
  TrophyIcon,
  PlusIcon,
  FriendsIcon,
  ProfileIcon,
} from '@/components/icons'
import { useI18n } from '@/i18n/useI18n'
import type { TranslationKey } from '@/i18n/translations'

const TABS = [
  { to: '/', icon: HomeIcon, labelKey: 'nav.home' },
  { to: '/achievements', icon: TrophyIcon, labelKey: 'nav.achievements' },
  { to: '/friends', icon: FriendsIcon, labelKey: 'nav.friends' },
  { to: '/profile', icon: ProfileIcon, labelKey: 'nav.profile' },
] satisfies { to: string; icon: typeof HomeIcon; labelKey: TranslationKey }[]



/**
 * The fixed bottom bar from PRD 6.9. The add-goal control sits in the middle
 * as a ringed button rather than a tab, matching the handoff.
 */
export function BottomNav() {
  const { t } = useI18n()
  const navigate = useNavigate()

  const [home, achievements, friends, profile] = TABS

  return (
    <nav
      aria-label={t('nav.home')}
      className="border-line bg-bg/92 fixed inset-x-0 bottom-0 z-20 mx-auto flex h-[74px] max-w-md items-center justify-around border-t px-1.5 pb-2 backdrop-blur-[14px]"
      style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
    >
      <Tab {...home} />
      <Tab {...achievements} />

      <button
        type="button"
        onClick={() => navigate('/library')}
        aria-label={t('nav.add')}
        className="border-fg text-fg flex size-11 items-center justify-center rounded-full border-[1.4px]"
      >
        <PlusIcon size={22} />
      </button>

      <Tab {...friends} />
      <Tab {...profile} />
    </nav>
  )
}

function Tab({
  to,
  icon: Icon,
  labelKey,
}: {
  to: string
  icon: typeof HomeIcon
  labelKey: TranslationKey
}) {
  const { t } = useI18n()
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex flex-col items-center gap-1 ${isActive ? 'text-fg' : 'text-fg-muted'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon size={22} />
          <span className={`text-[10px] ${isActive ? 'font-semibold' : ''}`}>{t(labelKey)}</span>
        </>
      )}
    </NavLink>
  )
}
