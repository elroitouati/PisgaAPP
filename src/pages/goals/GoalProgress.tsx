import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAsync } from '@/hooks/useAsync'
import { categoryStyle, CATEGORY_META } from '@/lib/categories'
import {
  fetchStructuredGoal,
  fetchWeeklyMetrics,
  type StructuredUserGoal,
  type WeeklyMetricsRow,
} from '@/lib/structuredGoals'
import { BackIcon } from '@/components/icons'
import { formatValue } from '@/lib/formatValue'
import { Spinner } from '@/components/Spinner'
import { EmptyState } from '@/components/ui'

/**
 * S4 — progress and growth (design 12a/12b).
 *
 * The screen that makes the scoring engine legible. Section 3 is a formula
 * with four terms, and someone who cannot see those four terms cannot tell
 * whether the app rewarded them for turning up or for improving — so the
 * breakdown is itemised rather than summarised.
 */
export default function GoalProgress() {
  const { userGoalId } = useParams<{ userGoalId: string }>()
  const { t } = useI18n()
  const navigate = useNavigate()

  const { data: goal } = useAsync<StructuredUserGoal | null>(
    () => (userGoalId ? fetchStructuredGoal(userGoalId) : Promise.resolve(null)),
    [userGoalId],
  )
  const { data: weeks } = useAsync<WeeklyMetricsRow[]>(
    () => (userGoalId ? fetchWeeklyMetrics(userGoalId) : Promise.resolve([])),
    [userGoalId],
  )

  if (!goal || !goal.library) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-7" />
      </main>
    )
  }

  const library = goal.library
  const history = weeks ?? []
  const latest = history.at(-1) ?? null
  const peak = Math.max(1, ...history.map((w) => w.total_value))

  return (
    <main
      style={{ ...categoryStyle(goal.category), paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
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
        <div className="text-[18px] font-bold">{goal.title}</div>
      </header>

      <span className="flex-shrink-0 self-start rounded-full border border-[color-mix(in_oklch,var(--cat)_45%,var(--color-line))] px-3 py-1 text-[12.5px] font-semibold text-[var(--cat)]">
        {t(CATEGORY_META[goal.category].labelKey)}
        {library.subcategory ? ` · ${library.subcategory}` : ''}
      </span>

      {history.length === 0 ? (
        <EmptyState>{t('sg.noWeeksYet')}</EmptyState>
      ) : (
        <>
          {/* Weekly volume. The most recent bar carries the delta badge, since
              that number is the one the engine actually paid for. */}
          <div className="border-line bg-surface flex-shrink-0 rounded-[16px] border px-4 pt-4.5 pb-3.5">
            <div className="flex h-[100px] items-end justify-between px-1">
              {history.map((week, index) => {
                const isLatest = index === history.length - 1
                const height = Math.max(6, Math.round((week.total_value / peak) * 100))
                return (
                  <div
                    key={week.week_start}
                    className={`relative w-[13%] rounded-t-md ${isLatest ? 'bg-[var(--cat)]' : 'bg-line'}`}
                    style={{ height }}
                  >
                    {isLatest && week.delta_pct !== null && week.delta_pct > 0 ? (
                      <span className="absolute -top-[22px] left-1/2 -translate-x-1/2 rounded-lg bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] px-1.5 py-px text-[10.5px] font-bold whitespace-nowrap text-[var(--cat)]">
                        +{Math.round(week.delta_pct * 100)}%
                      </span>
                    ) : null}
                  </div>
                )
              })}
            </div>
            <div className="text-fg-subtle mt-2.5 flex justify-between text-[10.5px]">
              {history.map((week, index) => (
                <span
                  key={week.week_start}
                  className={index === history.length - 1 ? 'font-semibold text-[var(--cat)]' : ''}
                >
                  {formatValue(week.total_value)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-shrink-0 gap-2.5">
            <Stat value={formatValue(goal.personal_record_value ?? 0)} label={t('sg.personalRecord')} />
            <Stat value={formatValue(latest?.total_value ?? 0)} label={t('sg.thisWeek')} />
            <Stat value={`×${(latest?.level_multiplier ?? 1).toFixed(1)}`} label={t('sg.levelMultiplier')} />
          </div>

          {/* Section 3.2's four terms, itemised. */}
          {latest ? (
            <div className="border-line bg-surface flex-shrink-0 rounded-[16px] border px-4 py-3.5">
              <Row
                label={`${t('sg.execution')} (${library.base_points} × ${(latest.level_multiplier).toFixed(1)})`}
                value={latest.execution_points}
              />
              <Row
                label={`${t('sg.improvement')}${
                  latest.delta_pct !== null ? ` (Δ ${Math.round(latest.delta_pct * 100)}%)` : ''
                }`}
                value={latest.improvement_points}
              />
              <Row label={t('sg.maintenance')} value={latest.maintenance_points} />
              <Row label={t('sg.levelBonus')} value={latest.level_bonus_points} />
              <div className="border-fg mt-1 border-t" />
              <div className="flex justify-between py-2.5 text-[15.5px] font-bold text-[var(--cat)]">
                <span>{t('sg.weekTotal')}</span>
                <span dir="ltr" className="[unicode-bidi:isolate]">
                  {latest.total_points}
                </span>
              </div>
            </div>
          ) : null}

          <p className="text-fg-subtle flex-shrink-0 text-center text-[11.5px] leading-relaxed">
            {t('sg.measuredAgainstPeak')}
          </p>
        </>
      )}
    </main>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-line bg-surface flex-1 rounded-[14px] border px-1.5 py-3 text-center">
      <div dir="ltr" className="text-[16px] font-bold [unicode-bidi:isolate]">
        {value}
      </div>
      <div className="text-fg-muted mt-0.5 text-[10px]">{label}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <>
      <div className="flex justify-between py-2 text-[13.5px]">
        <span className="text-fg-muted">{label}</span>
        <span dir="ltr" className="[unicode-bidi:isolate]">
          {value}
        </span>
      </div>
      <div className="border-line border-t last:border-0" />
    </>
  )
}
