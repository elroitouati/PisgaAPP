import { useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import type { TranslationKey } from '@/i18n/translations'
import { useTrackedGoals } from '@/hooks/useGoals'
import { formatClock, useGuidedSession } from '@/hooks/useGuidedSession'
import { CATEGORY_META, categoryStyle } from '@/lib/categories'
import { CloseIcon, PauseIcon, PlayIcon, RestartIcon } from '@/components/icons'
import { Card, LoadingScreen } from '@/components/ui'
import { Spinner } from '@/components/Spinner'

const RING = 248
const RADIUS = 112
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Design 5c — the guided verification method from PRD 5. */
export default function GuidedSession() {
  const { goalId } = useParams<{ goalId: string }>()
  const { goals, loading, complete } = useTrackedGoals()
  const navigate = useNavigate()
  const { t } = useI18n()

  const goal = goals.find((candidate) => candidate.id === goalId)

  // This was a bare spinner with no way out — exactly "the start of a task"
  // a slow connection or a hung request could strand someone on.
  if (loading) return <LoadingScreen />
  if (!goal) return <Navigate to="/404" replace />

  return (
    <SessionRunner
      goal={goal}
      onFinish={async () => {
        await complete(goal.id)
        navigate(`/category/${goal.category}`, { replace: true })
      }}
      onExit={() => navigate(-1)}
      t={t}
    />
  )
}

function SessionRunner({
  goal,
  onFinish,
  onExit,
  t,
}: {
  goal: ReturnType<typeof useTrackedGoals>['goals'][number]
  onFinish: () => Promise<void>
  onExit: () => void
  t: (key: TranslationKey) => string
}) {
  const session = useGuidedSession(goal.session_config)
  const [saving, setSaving] = useState(false)
  const meta = CATEGORY_META[goal.category]

  const isDone = session.phase === 'done'
  const dash = CIRCUMFERENCE * Math.min(1, Math.max(0, session.phaseProgress))

  return (
    <main
      style={categoryStyle(goal.category)}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-[26px] pt-14 pb-safe"
    >
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (isDone || window.confirm(t('timer.exitConfirm'))) onExit()
          }}
          aria-label={t('common.close')}
          className="border-line text-fg-muted flex size-9 items-center justify-center rounded-full border"
        >
          <CloseIcon size={18} />
        </button>

        <div className="text-center">
          <div className="text-fg-muted text-xs">{t(meta.labelKey)}</div>
          <div className="mt-0.5 text-[15px] font-semibold">{goal.title}</div>
        </div>

        <button
          type="button"
          onClick={session.restart}
          aria-label={t('timer.restart')}
          className="border-line text-fg-muted flex size-9 items-center justify-center rounded-full border"
        >
          <RestartIcon size={18} />
        </button>
      </header>

      <p className="mt-9 text-center text-[13px] font-semibold tracking-[0.16em] text-[var(--cat)]">
        {isDone
          ? t('timer.complete')
          : session.phase === 'rest'
            ? t('timer.rest')
            : t('timer.work')}
      </p>

      <div className="relative mx-auto mt-[22px] size-[248px]">
        <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} aria-hidden="true">
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth="6"
          />
          <circle
            cx={RING / 2}
            cy={RING / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--cat)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            dir="ltr"
            className="text-6xl font-light tracking-[-0.02em] [font-variant-numeric:tabular-nums]"
          >
            {formatClock(session.remaining)}
          </div>
          <div className="text-fg-muted mt-0.5 text-[13px]">
            {session.phase === 'rest' ? t('timer.untilNextSet') : t('timer.remaining')}
          </div>
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <Stat value={`${session.set} / ${session.totalSets}`} label={t('timer.sets')} />
        {session.reps ? (
          <Stat value={String(session.reps)} label={t('timer.reps')} />
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2" aria-hidden="true">
        {Array.from({ length: session.totalSets }, (_, index) => (
          <span
            key={index}
            className={`size-[9px] rounded-full ${
              index + 1 < session.set || isDone
                ? 'bg-[var(--cat)]'
                : index + 1 === session.set
                  ? 'border-[1.4px] border-[var(--cat)]'
                  : 'bg-line'
            }`}
          />
        ))}
      </div>

      <div className="mt-auto flex items-center gap-3.5">
        {!isDone ? (
          <button
            type="button"
            onClick={session.running ? session.pause : session.resume}
            aria-label={session.running ? t('timer.pause') : t('timer.resume')}
            className="border-line text-fg-muted flex size-14 flex-none items-center justify-center rounded-full border"
          >
            {session.running ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
        ) : null}

        {/* Nothing to advance during a single continuous session — its only
            end is the clock, so the primary button appears once it is done. */}
        {isDone || session.phase === 'rest' || session.totalSets > 1 ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              if (isDone) {
                setSaving(true)
                void onFinish().finally(() => setSaving(false))
              } else if (session.phase === 'rest') {
                session.skipRest()
              } else {
                session.endSet()
              }
            }}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-[28px] bg-[var(--cat)] text-base font-bold text-on-cat disabled:opacity-60"
          >
            {saving ? <Spinner className="border-on-cat/30 border-t-on-cat" /> : null}
            {isDone
              ? t('timer.finish')
              : session.phase === 'rest'
                ? t('timer.skipRest')
                : t('timer.endSet')}
          </button>
        ) : null}
      </div>
    </main>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Card className="flex-1 p-3.5 text-center">
      <div dir="ltr" className="text-[22px] font-bold [unicode-bidi:isolate]">
        {value}
      </div>
      <div className="text-fg-muted mt-1 text-xs">{label}</div>
    </Card>
  )
}
