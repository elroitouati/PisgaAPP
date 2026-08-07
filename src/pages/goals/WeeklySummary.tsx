import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { CATEGORIES, CATEGORY_META, categoryStyle } from '@/lib/categories'
import { toDateKey } from '@/lib/dates'
import {
  fetchGrowthLeaderboard,
  fetchWeekSummary,
  type LeaderboardRow,
  type WeekSummary,
} from '@/lib/structuredGoals'
import { BackIcon } from '@/components/icons'
import { LoadingScreen } from '@/components/ui'

/** Sunday-start, matching week_start() in the database. */
function currentWeekStart(): string {
  const now = new Date()
  now.setDate(now.getDate() - now.getDay())
  return toDateKey(now)
}

/**
 * S6 — the weekly summary (design 12c/12d).
 *
 * The growth table is the primary one on purpose (section 3.5): it ranks by
 * improvement plus level-ups, so a beginner can top it. There is deliberately
 * no "who did the most push-ups" table anywhere in the product — that would
 * contradict the one principle the scoring engine exists to protect.
 */
export default function WeeklySummary() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const weekStart = currentWeekStart()

  const { data: summary } = useAsync<WeekSummary | null>(
    () => (user ? fetchWeekSummary(user.id, weekStart) : Promise.resolve(null)),
    [user?.id, weekStart],
  )
  const { data: board } = useAsync<LeaderboardRow[]>(
    () => fetchGrowthLeaderboard(weekStart),
    [weekStart],
  )

  if (!summary) {
    return (
      <LoadingScreen />
    )
  }

  const delta = summary.totalPoints - summary.previousTotal
  const maxCategory = Math.max(1, ...Object.values(summary.byCategory))
  const rows = board ?? []

  return (
    <main
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[22px] pb-10"
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon size={21} />
        </button>
        <div className="text-fg-muted text-[13px]">{t('sg.weeklyTitle')}</div>
      </header>

      <div className="mt-1.5 flex-shrink-0 text-center">
        <div className="text-[52px] leading-none font-bold">{summary.totalPoints}</div>
        <div className="text-fg-muted mt-0.5 text-[13.5px]">{t('sg.points')}</div>
        {summary.previousTotal > 0 ? (
          <div
            style={categoryStyle('physical')}
            className="mt-2.5 text-[13px] font-semibold text-[var(--cat)]"
          >
            {delta >= 0 ? '+' : ''}
            {delta} {t('sg.vsLastWeek')}
          </div>
        ) : null}
      </div>

      <div className="border-line bg-surface flex flex-shrink-0 flex-col gap-3.5 rounded-[16px] border px-4 py-4">
        {CATEGORIES.map((category) => {
          const points = summary.byCategory[category]
          return (
            <div key={category} style={categoryStyle(category)} className="flex items-center gap-3">
              <span className="size-[9px] flex-none rounded-full bg-[var(--cat)]" />
              <span className="w-13 text-[13.5px]">{t(CATEGORY_META[category].labelKey)}</span>
              <span className="bg-line h-[5px] flex-1 overflow-hidden rounded-full">
                <span
                  className="block h-full bg-[var(--cat)]"
                  style={{ width: `${Math.round((points / maxCategory) * 100)}%` }}
                />
              </span>
              <span dir="ltr" className="text-fg-muted w-8 text-end text-[12px] [unicode-bidi:isolate]">
                {points}
              </span>
            </div>
          )
        })}
      </div>

      {summary.topGoal ? (
        <div className="flex-shrink-0">
          <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
            {t('sg.leadingGoal')}
          </div>
          <div
            style={categoryStyle(summary.topGoal.category)}
            className="flex items-center gap-3 rounded-[14px] border border-[color-mix(in_oklch,var(--cat)_26%,var(--color-line))] bg-[color-mix(in_oklch,var(--cat)_8%,var(--color-surface))] px-4 py-3.5"
          >
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {summary.topGoal.title}
            </span>
            <span dir="ltr" className="text-fg-muted flex-none text-[13px] [unicode-bidi:isolate]">
              {summary.topGoal.points} {t('sg.points')}
              {summary.topGoal.deltaPct !== null
                ? ` · Δ ${Math.round(summary.topGoal.deltaPct * 100)}%`
                : ''}
            </span>
          </div>
        </div>
      ) : null}

      <div className="border-line bg-surface flex-shrink-0 rounded-[16px] border px-4 py-4">
        <div className="text-fg-subtle mb-3 text-[11px] font-semibold tracking-[0.08em]">
          {t('sg.growthTable')}
        </div>
        <div className="flex flex-col gap-2.5">
          {rows.map((row, index) => {
            const isMe = row.user_id === user?.id
            return (
              <div
                key={row.user_id}
                className={`flex items-center gap-3 ${
                  isMe ? 'bg-surface-raised -mx-1.5 rounded-[10px] px-1.5 py-2' : ''
                }`}
              >
                <span className="bg-fg-subtle text-bg flex size-8 flex-none items-center justify-center rounded-full text-[13px] font-bold">
                  {(row.display_name ?? '?').trim().charAt(0)}
                </span>
                <span className={`flex-1 text-[13.5px] ${isMe ? 'font-bold' : 'text-fg-muted'}`}>
                  {index + 1}. {row.display_name}
                  {isMe ? <span className="text-fg-muted font-medium"> · {t('sg.you')}</span> : null}
                </span>
                <span
                  dir="ltr"
                  className={`text-[13.5px] [unicode-bidi:isolate] ${isMe ? 'font-bold' : 'text-fg-muted'}`}
                >
                  {row.growth_points}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-fg-subtle mt-3 text-center text-[11px]">{t('sg.rankedByGrowth')}</p>
      </div>
    </main>
  )
}
