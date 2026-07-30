import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import type { TranslationKey } from '@/i18n/translations'
import { categoryStyle } from '@/lib/categories'
import { pointsFor } from '@/lib/scoring'
import { CheckIcon, MinusIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import type { TrackedGoal } from '@/types/db'

type Props = {
  goal: TrackedGoal
  onComplete: (goalId: string, note?: string | null) => Promise<void>
  onUndo: (goalId: string) => Promise<void>
}

/**
 * A single goal in a category list. Which control it shows is decided by the
 * goal's verification method (PRD 5) — that mapping is the whole point of the
 * feature, so it lives in one place rather than being re-derived per screen.
 */
export function GoalRow({ goal, onComplete, onUndo }: Props) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setExpanded(false)
      setNote('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(false)
    }
  }

  function handleToggle() {
    // A structured goal is not a checkbox: it records a measured value against
    // a level, which is what the VS screens exist for. Undo included — undoing
    // one has to recompute the week, not just delete a row.
    if (goal.verification_code) return navigate(`/goal/${goal.id}`)

    if (goal.completedToday) return void run(() => onUndo(goal.id))

    switch (goal.verification) {
      case 'guided_session':
        // The session screen records the completion when it finishes.
        return navigate(`/session/${goal.id}`)
      case 'checkbox_reflection':
        // A note is mandatory, so open the field instead of completing.
        return setExpanded((prev) => !prev)
      case 'daily_checkin':
        return void run(() => onComplete(goal.id))
      case 'sensor_sync':
        // No sensor integration yet — say so rather than accept a self-report,
        // which would defeat the point of this verification method.
        return setError(t('verify.sensor.unavailable'))
    }
  }

  const points = pointsFor(goal)

  return (
    <div
      style={categoryStyle(goal.category)}
      className="border-line bg-surface rounded-[14px] border px-3.5 py-[13px]"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          aria-pressed={goal.completedToday}
          aria-label={goal.completedToday ? t('verify.completed') : t('verify.done')}
          className={`flex size-6 flex-none items-center justify-center rounded-full ${
            goal.completedToday
              ? 'bg-[var(--cat)] text-on-cat'
              : 'border-[1.6px] border-[var(--cat)] text-[var(--cat)]'
          }`}
        >
          {busy ? (
            <Spinner className="size-3.5 border-current/30 border-t-current" />
          ) : goal.completedToday ? (
            <CheckIcon size={15} />
          ) : (
            <MinusIcon size={14} />
          )}
        </button>

        <button type="button" onClick={handleToggle} className="flex-1 text-start" disabled={busy}>
          <div className="text-[14.5px] font-semibold">{goal.title}</div>
          <div className="text-fg-muted mt-0.5 text-xs">
            {goal.verification_code
              ? `${t('sg.level')} ${goal.current_level_value ?? 0}`
              : goal.completedToday
                ? `${t('verify.completed')}${points > 0 ? ` · +${points} ${t('home.stat.points')}` : ''}`
                : subtitleFor(goal, t)}
          </div>
        </button>

        {goal.streak > 0 ? (
          <span className="text-fg-subtle flex-none text-[11px]">
            {goal.streak} {t('verify.streakDays')}
          </span>
        ) : null}
      </div>

      {expanded && !goal.completedToday ? (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`note-${goal.id}`} className="text-fg-muted text-xs font-medium">
            {t('verify.reflection.label')}
          </label>
          <textarea
            id={`note-${goal.id}`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('verify.reflection.placeholder')}
            rows={2}
            className="border-line bg-bg focus:border-fg resize-none rounded-xl border px-3 py-2 text-sm outline-none"
          />
          <button
            type="button"
            disabled={busy || note.trim() === ''}
            onClick={() => void run(() => onComplete(goal.id, note))}
            className="self-end rounded-full bg-[var(--cat)] px-4 py-1.5 text-xs font-semibold text-on-cat disabled:opacity-50"
          >
            {t('verify.done')}
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger mt-2 text-[11px]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function subtitleFor(goal: TrackedGoal, t: (key: TranslationKey) => string): string {
  switch (goal.verification) {
    case 'guided_session':
      return t('verify.guided.start')
    case 'daily_checkin':
      return t('verify.checkin.question')
    case 'sensor_sync':
      return t('verify.sensor.pending')
    case 'checkbox_reflection':
      return t('verify.reflection.label')
  }
}
