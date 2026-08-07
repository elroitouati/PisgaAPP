import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAsync } from '@/hooks/useAsync'
import { categoryStyle } from '@/lib/categories'
import {
  adoptStructuredGoal,
  calibrateOpeningLevel,
  describeOpeningLevel,
  fetchLibraryGoal,
  type CalibrationAnswers,
  type CalibrationQuestionCode,
  type LibraryGoalRow,
} from '@/lib/structuredGoals'
import { formatValue } from '@/lib/formatValue'
import { MinusIcon, PlusIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { LoadingScreen, PrimaryButton } from '@/components/ui'

const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']
const TIMES = ['sg.morning', 'sg.noon', 'sg.afternoon', 'sg.evening'] as const
const OBSTACLES = ['sg.q4.time', 'sg.q4.motivation', 'sg.q4.difficulty', 'sg.q4.forget'] as const

/**
 * S2 — the calibration screen (design 11c/11d).
 *
 * Renders whichever of Q1–Q7 the goal asks for, and nothing else. Section 6 is
 * firm on the ceiling: at most three questions, none of them open-ended. The
 * screen exists to produce one number — the opening level — and to show the
 * user what that number will mean before they commit to it.
 */
export default function Calibrate() {
  const { libraryId } = useParams<{ libraryId: string }>()
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [answers, setAnswers] = useState<CalibrationAnswers>({})
  const [days, setDays] = useState<number[]>([0, 2, 4])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: library } = useAsync<LibraryGoalRow | null>(
    () => (libraryId ? fetchLibraryGoal(libraryId) : Promise.resolve(null)),
    [libraryId],
  )

  const questions = (library?.calibration_questions ?? []) as CalibrationQuestionCode[]

  // Q1 defaults to the library's own opening level, so the screen is never
  // blank and a user who just taps through still gets a sane goal.
  const stated = answers.Q1 ?? answers.Q7 ?? library?.level_1_value ?? 0
  const openingLevel = useMemo(
    () => (library ? calibrateOpeningLevel(library, { ...answers, Q1: stated }) : 0),
    [library, answers, stated],
  )

  async function submit() {
    if (!library) return
    setSaving(true)
    setError(null)
    try {
      const goal = await adoptStructuredGoal(
        library.id,
        openingLevel,
        questions.includes('Q2') ? days.length : null,
        { ...answers, Q1: stated, Q2: days.length },
      )
      navigate(`/goal/${goal.id}`, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
      setSaving(false)
    }
  }

  if (!library) {
    return (
      <LoadingScreen />
    )
  }

  const step = library.level_step
  const bump = (delta: number) =>
    setAnswers((prev) => ({
      ...prev,
      Q1: Math.max(0, Number(((prev.Q1 ?? library.level_1_value) + delta).toFixed(1))),
    }))

  return (
    <main
      style={{ ...categoryStyle(library.category), paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-[26px] pb-10"
    >
      <div className="flex-shrink-0">
        <div className="text-[22px] font-bold">{t('sg.calibrateTitle')}</div>
        <div className="mt-1 text-[15px] font-semibold text-[var(--cat)]">
          {lang === 'he' ? library.title_he : library.title_en}
        </div>
        <div className="text-fg-muted mt-1 text-[13px]">
          {questions.length} · {t('sg.calibrateSub')}
        </div>
      </div>

      {/* Q1 / Q7 — the number everything else is derived from. */}
      {questions.includes('Q1') || questions.includes('Q7') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">
            {questions.includes('Q7') ? t('sg.q7') : t('sg.q1')}
            {` (${library.metric_unit})`}
          </div>
          <div className="flex items-center justify-center gap-5.5">
            <button
              type="button"
              onClick={() => bump(-step)}
              aria-label="-"
              className="border-line text-fg flex size-11 items-center justify-center rounded-full border"
            >
              <MinusIcon size={19} />
            </button>
            <span dir="ltr" className="min-w-[70px] text-center text-[44px] font-bold [unicode-bidi:isolate]">
              {formatValue(stated)}
            </span>
            <button
              type="button"
              onClick={() => bump(step)}
              aria-label="+"
              className="text-on-cat flex size-11 items-center justify-center rounded-full bg-[var(--cat)]"
            >
              <PlusIcon size={19} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Q2 — days per week, which is also what the streak is measured against. */}
      {questions.includes('Q2') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">{t('sg.q2')}</div>
          <div className="flex justify-between">
            {WEEKDAYS.map((day, index) => {
              const on = days.includes(index)
              return (
                <button
                  key={index}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setDays((prev) =>
                      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index],
                    )
                  }
                  className={`flex size-[38px] items-center justify-center rounded-full text-[13.5px] font-semibold ${
                    on ? 'text-on-cat bg-[var(--cat)]' : 'border-line text-fg-muted border'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {questions.includes('Q3') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">{t('sg.q3')}</div>
          <div className="flex gap-2">
            {TIMES.map((key) => {
              const on = answers.Q3 === key
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAnswers((prev) => ({ ...prev, Q3: key }))}
                  className={`flex-1 rounded-[13px] px-1 py-2.5 text-center text-[13px] ${
                    on
                      ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] font-semibold text-[var(--cat)]'
                      : 'border-line bg-surface text-fg-muted border'
                  }`}
                >
                  {t(key)}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {questions.includes('Q4') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">{t('sg.q4')}</div>
          <div className="flex flex-wrap gap-2">
            {OBSTACLES.map((key) => {
              const on = (answers.Q4 ?? []).includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setAnswers((prev) => {
                      const current = prev.Q4 ?? []
                      return {
                        ...prev,
                        Q4: current.includes(key)
                          ? current.filter((o) => o !== key)
                          : [...current, key],
                      }
                    })
                  }
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
                    on
                      ? 'border border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_12%,var(--color-surface))] text-[var(--cat)]'
                      : 'border-line text-fg-muted border'
                  }`}
                >
                  {t(key)}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {questions.includes('Q5') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">{t('sg.q5')}</div>
          <input
            type="number"
            inputMode="numeric"
            value={answers.Q5 ?? ''}
            onChange={(event) => setAnswers((prev) => ({ ...prev, Q5: Number(event.target.value) }))}
            placeholder={library.metric_unit}
            className="border-line bg-surface focus:border-fg w-full rounded-[14px] border px-4 py-3 text-[15px] outline-none"
          />
        </div>
      ) : null}

      {questions.includes('Q6') ? (
        <div className="flex-shrink-0">
          <div className="mb-3.5 text-[15.5px] font-semibold">{t('sg.q6')}</div>
          <input
            value={answers.Q6 ?? ''}
            onChange={(event) => setAnswers((prev) => ({ ...prev, Q6: event.target.value }))}
            className="border-line bg-surface focus:border-fg w-full rounded-[14px] border px-4 py-3 text-[15px] outline-none"
          />
        </div>
      ) : null}

      {/* The whole point of the screen: show what the answers produced, and
          say why, before the user commits. */}
      <div className="border-line bg-surface-raised mt-0.5 flex-shrink-0 rounded-[16px] border-t px-4 py-4">
        <div className="text-fg-subtle mb-2 text-[11px] font-semibold tracking-[0.08em]">
          {t('sg.openingLevel')}
        </div>
        <div className="text-[16px] font-bold">
          {describeOpeningLevel(library, openingLevel)}
          {library.metric_key.endsWith('_per_day')
            ? ` · ${t('sg.dailyTarget')} ${formatValue(openingLevel)}`
            : ''}
        </div>
        <div className="text-fg-subtle mt-2 text-[12px] leading-relaxed">
          {t(library.metric_direction === 'up' ? 'sg.openingLevelWhy' : 'sg.openingLevelWhyDown')}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <PrimaryButton className="mt-auto flex-shrink-0" disabled={saving} onClick={() => void submit()}>
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('sg.addGoal')}
      </PrimaryButton>
    </main>
  )
}
