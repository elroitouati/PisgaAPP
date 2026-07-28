import { useMemo } from 'react'
import { useI18n } from '@/i18n/useI18n'
import { useBadges } from '@/hooks/useBadges'
import { CATEGORY_META } from '@/lib/categories'
import {
  ActivityIcon,
  CheckIcon,
  FlameIcon,
  FriendsIcon,
  LockIcon,
  SummitIcon,
  TargetIcon,
  type IconProps,
} from '@/components/icons'
import { EmptyState, ErrorState, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import type { BadgeIcon, EarnedBadge } from '@/types/db'

const BADGE_ICONS: Record<BadgeIcon, (props: IconProps) => React.ReactElement> = {
  summit: SummitIcon,
  check: CheckIcon,
  flame: FlameIcon,
  target: TargetIcon,
  activity: ActivityIcon,
  friends: FriendsIcon,
}

/** Design 5d — earned badges in category-tinted discs, locked ones dimmed. */
export default function Achievements() {
  const { t, lang } = useI18n()
  const { badges, earned, loading, error, reload } = useBadges()

  const locked = useMemo(() => badges.filter((badge) => !badge.earnedAt), [badges])
  const ratio = badges.length === 0 ? 0 : earned.length / badges.length

  return (
    <>
      <header>
        <div className="text-fg-subtle mb-1 flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.18em]">
          <SummitIcon size={12} strokeWidth={2} />
          {t('app.wordmark')}
        </div>
        <h1 className="text-[22px] font-bold">{t('badges.title')}</h1>
        <p className="text-fg-muted mt-1 text-[13px]">
          {earned.length} {t('common.of')} {badges.length} {t('badges.collected')}
        </p>
      </header>

      <div className="border-line bg-surface mt-5 h-1.5 overflow-hidden rounded-full border">
        <div
          className="bg-fg h-full transition-[width]"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : error ? (
        <div className="mt-5">
          <ErrorState onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="mt-5 mb-3.5">
            <SectionLabel>{t('badges.recent')}</SectionLabel>
          </div>
          {earned.length === 0 ? (
            <EmptyState>{t('badges.none')}</EmptyState>
          ) : (
            <BadgeGrid badges={earned} lang={lang} />
          )}

          {locked.length > 0 ? (
            <>
              <div className="mt-6 mb-3.5">
                <SectionLabel>{t('badges.locked')}</SectionLabel>
              </div>
              <BadgeGrid badges={locked} lang={lang} locked />
            </>
          ) : null}
        </>
      )}
    </>
  )
}

function BadgeGrid({
  badges,
  lang,
  locked = false,
}: {
  badges: EarnedBadge[]
  lang: 'he' | 'en'
  locked?: boolean
}) {
  return (
    <div className={`grid grid-cols-3 gap-x-2 gap-y-3.5 ${locked ? 'opacity-50' : ''}`}>
      {badges.map((badge) => (
        <BadgeDisc key={badge.id} badge={badge} lang={lang} locked={locked} />
      ))}
    </div>
  )
}

function BadgeDisc({
  badge,
  lang,
  locked,
}: {
  badge: EarnedBadge
  lang: 'he' | 'en'
  locked: boolean
}) {
  const Icon = locked ? LockIcon : BADGE_ICONS[badge.icon]
  const accent = badge.accent ? CATEGORY_META[badge.accent].color : 'var(--pisga-tprim)'
  const title = lang === 'he' ? badge.title_he : badge.title_en
  const description = lang === 'he' ? badge.description_he : badge.description_en

  return (
    <div
      className="flex flex-col items-center gap-2 text-center"
      style={{ '--cat': accent } as React.CSSProperties}
      title={description ?? undefined}
    >
      <div
        className={`flex size-15 items-center justify-center rounded-full border-[1.4px] ${
          locked ? 'border-line bg-surface text-fg-subtle' : 'text-[var(--cat)]'
        }`}
        style={
          locked
            ? undefined
            : {
                background: 'color-mix(in oklch, var(--cat) 16%, var(--pisga-tint-base))',
                borderColor: 'color-mix(in oklch, var(--cat) 45%, var(--pisga-tint-base))',
              }
        }
      >
        <Icon size={locked ? 24 : 26} />
      </div>
      <div className="text-[11.5px] leading-tight font-semibold">{title}</div>
    </div>
  )
}
