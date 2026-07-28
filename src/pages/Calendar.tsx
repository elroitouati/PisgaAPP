import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { fetchMonth, type CalendarDay } from '@/lib/api'
import { CATEGORIES, CATEGORY_META, categoryStyle } from '@/lib/categories'
import { toDateKey, todayKey } from '@/lib/dates'
import { BackIcon, CheckIcon, SummitIcon } from '@/components/icons'
import { Card, EmptyState, ErrorState, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'

/**
 * Designs 6b (light) and 6a (dark) — the same screen in both palettes, so it is
 * built once and the theme tokens do the rest.
 *
 * PRD 6.5 asks the calendar to also show deadline and long-term goals on a
 * timeline. The handoff only draws the daily-completion grid, so that is what
 * this is; the timeline needs a design before it can be built.
 */
export default function Calendar() {
  const { t, lang } = useI18n()
  const { user } = useAuth()

  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [selected, setSelected] = useState<string>(todayKey())

  const { data, loading, error, reload } = useAsync<Map<string, CalendarDay>>(
    () =>
      user
        ? fetchMonth(user.id, cursor.year, cursor.month)
        : Promise.resolve(new Map<string, CalendarDay>()),
    [user?.id, cursor.year, cursor.month],
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
  )
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
