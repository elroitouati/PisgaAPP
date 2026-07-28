import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useProfile } from '@/providers/useProfile'
import { useTrackedGoals, type CategorySummary } from '@/hooks/useGoals'
import { useBadges } from '@/hooks/useBadges'
import { CATEGORY_META } from '@/lib/categories'
import { overallStreak } from '@/lib/scoring'
import { useTotalPoints } from '@/hooks/usePoints'
import { CalendarIcon, SummitIcon } from '@/components/icons'
import {
  CategoryTile,
  EmptyState,
  ErrorState,
  ProgressBar,
  SectionLabel,
  StatStrip,
} from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import { quoteOfTheDay } from '@/lib/quotes'

/** Design 5a. */
export default function Home() {
  const { t, lang } = useI18n()
  const { profile } = useProfile()
  const { goals, byCategory, pending, loading, error, reload } = useTrackedGoals()
  const { earned } = useBadges()
  const { points } = useTotalPoints()

  const firstName = profile?.display_name?.split(' ')[0] ?? ''
  const today = new Date()

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="text-fg flex items-center gap-1.5">
          <SummitIcon size={16} />
          <span className="text-[15px] font-extrabold tracking-[0.16em]">{t('app.wordmark')}</span>
        </div>
        <Link
          to="/calendar"
          className="border-line text-fg-muted flex size-[34px] items-center justify-center rounded-full border"
          aria-label={t('nav.calendar')}
        >
          <CalendarIcon size={17} />
        </Link>
      </header>

      <div className="mt-4">
        <h1 className="text-[22px] font-bold tracking-[-0.01em]">
          {t(greetingKey(today.getHours()))}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-fg-muted mt-1 text-[13px]">
          {weekday(today, lang)}
          {' · '}
          {pending > 0 ? `${pending} ${t('home.pending')}` : t('home.allDone')}
        </p>
      </div>

      <div className="mt-4">
        <StatStrip
          stats={[
            { value: String(overallStreak(goals)), label: t('home.stat.streak') },
            {
              value: points.toLocaleString(lang === 'he' ? 'he-IL' : 'en-US'),
              label: t('home.stat.points'),
            },
            { value: String(earned.length), label: t('home.stat.badges') },
          ]}
        />
      </div>

      <div className="mt-4.5 mb-2.5">
        <SectionLabel>{t('home.categories')}</SectionLabel>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : error ? (
        <ErrorState onRetry={reload} />
      ) : goals.length === 0 ? (
        <EmptyState>{t('home.empty')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {byCategory.map((summary) => (
            <CategoryCard key={summary.category} summary={summary} />
          ))}
        </div>
      )}

      <DailyQuote lang={lang} />
    </>
  )
}

function CategoryCard({ summary }: { summary: CategorySummary }) {
  const { t } = useI18n()
  const { category, done, total, ratio } = summary
  const meta = CATEGORY_META[category]

  return (
    <Link
      to={`/category/${category}`}
      className="border-line bg-surface flex items-center gap-[13px] rounded-[16px] border px-[15px] py-3.5"
      style={{ '--cat': meta.color } as React.CSSProperties}
    >
      <CategoryTile category={category} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">{t(meta.labelKey)}</span>
          <span className="text-[12px] font-semibold text-[var(--cat)]">
            {total > 0 && done === total ? t('common.done') : `${Math.round(ratio * 100)}%`}
          </span>
        </div>
        <div className="text-fg-muted mt-[3px] mb-2 text-xs">
          {done} {t('common.of')} {total} {t('home.goalsToday')}
        </div>
        <ProgressBar value={ratio} category={category} />
      </div>
    </Link>
  )
}

function greetingKey(hour: number) {
  if (hour < 12) return 'home.greeting.morning' as const
  if (hour < 18) return 'home.greeting.afternoon' as const
  return 'home.greeting.evening' as const
}

function weekday(date: Date, lang: string) {
  return new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-US', { weekday: 'long' }).format(date)
}

function DailyQuote({ lang }: { lang: 'he' | 'en' }) {
  const quote = quoteOfTheDay()
  return (
    // The accent rule sits on the reading-start edge — right in Hebrew, left
    // once the app is switched to English.
    <blockquote className="border-line bg-surface text-fg-muted mt-auto rounded-xl border border-s-2 border-s-[var(--color-fg-subtle)] px-[15px] py-[13px] text-[13.5px] leading-relaxed">
      {lang === 'he' ? quote.he : quote.en}
      <footer className="text-fg-subtle mt-1.5 text-[12px]">
        {lang === 'he' ? quote.authorHe : quote.authorEn}
      </footer>
    </blockquote>
  )
}
