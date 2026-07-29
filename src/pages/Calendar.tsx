import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { fetchLongTermGoals, fetchMonth, type CalendarDay, type TimelineGoal } from '@/lib/api'
import { CATEGORIES, CATEGORY_META, categoryStyle } from '@/lib/categories'
import { toDateKey, todayKey } from '@/lib/dates'
import { BackIcon, CheckIcon, SummitIcon } from '@/components/icons'
import { Card, EmptyState, ErrorState, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'

type View = 'month' | 'timeline'

/**
 * Designs 6b (light) and 6a (dark) for the monthly grid, and 10a-10d for the
 * "long-term goals" timeline tab added later — a progress bar per goal with a
 * target date, not another list of what was done.
 */
export default function Calendar() {
  const { t, lang } = useI18n()
  const { user } = useAuth()

  const [view, setView] = useState<View>('month')
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState<string>(todayKey())

  const { data, loading, error, reload } = useAsync<Map<string, CalendarDay>>(
    () =>
      user && view === 'month'
        ? fetchMonth(user.id, cursor.year, cursor.month)
        : Promise.resolve(new Map<string, CalendarDay>()),
    [user?.id, cursor.year, cursor.month, view],
  )

  const timeline = useAsync<TimelineGoal[]>(
    () => (user && view === 'timeline' ? fetchLongTermGoals(user.id) : Promise.resolve([])),
    [user?.id, view],
  )

  const days = useMemo(() => data ?? new Map<string, CalendarDay>(), [data])

  // Leading blanks so the 1st lands under its weekday. Sunday-start, matching
  // the Hebrew day headers the handoff uses (א…ש).
  const firstWeekday = new Date(cursor.year, cursor.month, 1).getDay()
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // Note: the handoff draws both month chevrons pointing inward. These point
  // outward instead — in RTL "previous" reads toward the right edge and "next"
  // toward the left, and an inward pair is genuinely ambiguous to tap.
  const step = (delta: number) =>
    setCursor(({ year, month }) => {
      const next = new Date(year, month + delta, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })

  const selectedDay = days.get(selected)
  const locale = lang === 'he' ? 'he-IL' : 'en-US'

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="text-fg flex items-center gap-1.5">
          <SummitIcon size={16} />
          <span className="text-[15px] font-extrabold tracking-[0.16em]">{t('app.wordmark')}</span>
        </div>
        <Link
          to="/"
          className="border-line text-fg-muted flex size-[34px] items-center justify-center rounded-full border"
          aria-label={t('common.back')}
        >
          {/* The handoff draws this one pointing away from the content. */}
          <BackIcon size={17} className="rotate-180" />
        </Link>
      </header>

      <div className="mt-4">
        <h1 className="text-[22px] font-bold">{t('calendar.title')}</h1>
        <p className="text-fg-muted mt-1 text-[13px]">{t('calendar.sub')}</p>
      </div>

      <div className="border-line bg-surface mt-4 flex flex-shrink-0 rounded-[14px] border p-1">
        {(['month', 'timeline'] as View[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setView(option)}
            aria-pressed={view === option}
            className={`flex-1 rounded-[11px] py-2.5 text-center text-[13.5px] font-semibold ${
              view === option ? 'bg-surface-raised' : 'text-fg-muted'
            }`}
          >
            {t(option === 'month' ? 'calendar.viewMonth' : 'calendar.viewTimeline')}
          </button>
        ))}
      </div>

      {view === 'timeline' ? (
        <TimelineView goals={timeline.data ?? []} loading={timeline.loading} />
      ) : (
        <>
          <Card className="mt-4 flex items-center justify-between px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={t('calendar.prevMonth')}
              className="text-fg-muted"
            >
              <BackIcon size={18} />
            </button>
            <span className="text-[15px] font-semibold">
              {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
                new Date(cursor.year, cursor.month, 1),
              )}
            </span>
            <button
              type="button"
              onClick={() => step(1)}
              aria-label={t('calendar.nextMonth')}
              className="text-fg-muted rotate-180"
            >
              <BackIcon size={18} />
            </button>
          </Card>

          {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <ErrorState onRetry={reload} />
        </div>
      ) : (
        <>
          <div className="mt-4">
            <div className="text-fg-subtle mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px]">
              {(t('calendar.weekdays') as string).split(',').map((initial, index) => (
                <span key={index}>{initial}</span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((day, index) => {
                if (day === null) return <div key={`blank-${index}`} className="aspect-square" />

                const key = toDateKey(new Date(cursor.year, cursor.month, day))
                const entry = days.get(key)
                const isSelected = key === selected

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-pressed={isSelected}
                    className={`flex aspect-square flex-col items-center justify-center gap-[3px] rounded-[10px] ${
                      isSelected ? 'bg-surface border-fg border-[1.4px]' : ''
                    }`}
                  >
                    <span
                      className={`text-xs ${
                        isSelected ? 'font-bold' : entry ? '' : 'text-fg-subtle'
                      }`}
                    >
                      {day}
                    </span>
                    {entry ? (
                      <span className="flex gap-0.5">
                        {entry.categories.map((category) => (
                          <span
                            key={category}
                            style={categoryStyle(category)}
                            className="size-1 rounded-full bg-[var(--cat)]"
                          />
                        ))}
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="text-fg-muted mt-4 flex flex-wrap gap-x-4 gap-y-2.5 text-[11.5px]">
            {CATEGORIES.map((category) => (
              <span key={category} className="flex items-center gap-1.5">
                <span
                  style={categoryStyle(category)}
                  className="size-2 rounded-full bg-[var(--cat)]"
                />
                {t(CATEGORY_META[category].labelKey)}
              </span>
            ))}
          </div>

          <div className="mt-4">
            <div className="mb-2.5">
              <SectionLabel>
                {new Intl.DateTimeFormat(locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                }).format(new Date(`${selected}T00:00:00`))}
              </SectionLabel>
            </div>

            {!selectedDay || selectedDay.entries.length === 0 ? (
              <EmptyState>{t('calendar.emptyDay')}</EmptyState>
            ) : (
              <div className="flex flex-col gap-2.5">
                {selectedDay.entries.map((entry) => (
                  <DayEntry key={entry.goalId} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
        </>
      )}
    </>
  )
}

function TimelineView({ goals, loading }: { goals: TimelineGoal[]; loading: boolean }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const locale = lang === 'he' ? 'he-IL' : 'en-US'

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-7" />
      </div>
    )
  }

  if (goals.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-10 text-center">
        <div className="border-line bg-surface text-fg-subtle flex size-15 items-center justify-center rounded-full border">
          <BackIcon size={27} className="rotate-90" />
        </div>
        <div>
          <div className="text-[16.5px] font-bold">{t('calendar.timelineEmptyTitle')}</div>
          <p className="text-fg-muted mx-auto mt-2 max-w-[250px] text-[13px] leading-relaxed">
            {t('calendar.timelineEmptyBody')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/library?new=1&longTerm=1')}
          className="bg-brand text-on-brand mt-1.5 h-12 rounded-[14px] px-[22px] text-[14.5px] font-bold"
        >
          {t('calendar.createLongTerm')}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4.5">
      <div className="mb-2.5">
        <SectionLabel>{t('calendar.timelineSectionLabel')}</SectionLabel>
      </div>
      <div className="flex flex-col gap-3">
        {goals.map((goal) => {
          const pct = Math.round(goal.progress * 100)
          return (
            <div
              key={goal.id}
              style={categoryStyle(goal.category)}
              className="rounded-[16px] border border-[color-mix(in_oklch,var(--cat)_26%,var(--color-line))] bg-[color-mix(in_oklch,var(--cat)_8%,var(--color-surface))] p-[16px_17px]"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex-none text-[var(--cat)]">
                  <CategoryIcon category={goal.category} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{goal.title}</div>
                  <div className="text-fg-muted mt-px text-xs">
                    {t(CATEGORY_META[goal.category].labelKey)} ·{' '}
                    {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(
                      new Date(goal.targetDate),
                    )}
                  </div>
                </div>
                <span className="flex-none text-[13px] font-bold text-[var(--cat)]">{pct}%</span>
              </div>

              <div className="relative mt-4 h-[22px]">
                <div className="bg-line absolute inset-x-0 top-[9px] h-1 rounded-full" />
                <div
                  className="absolute top-[9px] h-1 rounded-full bg-[var(--cat)] start-0"
                  style={{ width: `${pct}%` }}
                />
                {Array.from({ length: goal.checkpointsTotal }, (_, i) => {
                  const position = (i / (goal.checkpointsTotal - 1)) * 100
                  const reached = i < goal.checkpointsReached
                  const isToday = i === goal.checkpointsReached - 1 && pct < 100
                  return (
                    <span
                      key={i}
                      className={`absolute top-0.5 size-[9px] rounded-full ${
                        reached ? 'bg-[var(--cat)]' : 'border-line border-[1.6px] bg-bg'
                      } ${isToday ? 'border-surface border-2' : ''}`}
                      style={{ [lang === 'he' ? 'right' : 'left']: `${position}%` }}
                    />
                  )
                })}
              </div>

              <div className="text-fg-subtle mt-0.5 flex justify-between text-[11px]">
                <span>
                  {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(
                    new Date(goal.addedAt),
                  )}{' '}
                  · {t('calendar.timelineStart')}
                </span>
                <span>{t('calendar.timelineToday')}</span>
                <span>
                  {new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric' }).format(
                    new Date(goal.targetDate),
                  )}{' '}
                  · {t('calendar.timelineTarget')}
                </span>
              </div>

              <div className="text-fg-muted mt-2.5 text-xs">
                {goal.daysLeft} {t('calendar.timelineDaysLeft')} · {goal.checkpointsReached}{' '}
                {t('common.of')} {goal.checkpointsTotal} {t('calendar.timelineCheckpoints')}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CategoryIcon({ category }: { category: TimelineGoal['category'] }) {
  const Icon = CATEGORY_META[category].icon
  return <Icon size={20} />
}

function DayEntry({ entry }: { entry: CalendarDay['entries'][number] }) {
  const { t } = useI18n()
  return (
    <div
      style={categoryStyle(entry.category)}
      className="border-line bg-surface flex items-center gap-3 rounded-[14px] border px-3.5 py-[13px]"
    >
      <span className="text-on-cat flex size-6 flex-none items-center justify-center rounded-full bg-[var(--cat)]">
        <CheckIcon size={15} />
      </span>
      <div className="flex-1">
        <div className="text-[14.5px] font-semibold">{entry.title}</div>
        <div className="text-fg-muted mt-0.5 text-xs">
          {t(CATEGORY_META[entry.category].labelKey)}
          {' · '}
          {entry.isCustom ? t('calendar.personalGoal') : `+${entry.points} ${t('home.stat.points')}`}
        </div>
      </div>
    </div>
  )
}
