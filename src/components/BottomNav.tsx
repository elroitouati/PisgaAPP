import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon,
  TrophyIcon,
  PlusIcon,
  FriendsIcon,
  ProfileIcon,
} from '@/components/icons'
import { useI18n } from '@/i18n/useI18n'
import { AddGoalSheet } from './AddGoalSheet'
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
  const [sheetOpen, setSheetOpen] = useState(false)

  const [home, achievements, friends, profile] = TABS

  return (
    <>
      <nav
        aria-label={t('nav.home')}
        className="border-line bg-bg/92 fixed inset-x-0 bottom-0 z-20 mx-auto flex h-[74px] max-w-md items-center justify-around border-t px-1.5 pb-2 backdrop-blur-[14px]"
        // Android 15+ (targetSdk 36) makes edge-to-edge mandatory — the app
        // can no longer opt out, so the WebView now draws under the system
        // gesture/button bar and env(safe-area-inset-bottom) is what's
        // supposed to report its height. The floor of 0.875rem is a
        // safety net for the case where that inset comes back as 0 or too
        // small on a given device/nav mode: without it the bar would sit
        // flush against the system buttons instead of just close to them.
        style={{ paddingBottom: 'max(0.875rem, calc(0.5rem + env(safe-area-inset-bottom)))' }}
      >
        <Tab {...home} />
        <Tab {...achievements} />

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={t('nav.add')}
          className="border-fg text-fg flex size-11 items-center justify-center rounded-full border-[1.4px]"
        >
          <PlusIcon size={22} />
        </button>

        <Tab {...friends} />
        <Tab {...profile} />
      </nav>

      {/* Outside <nav> on purpose — the bar's backdrop-filter would otherwise
          become the containing block and trap this fixed overlay inside it. */}
      <AddGoalSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
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
