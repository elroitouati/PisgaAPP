import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAsync } from '@/hooks/useAsync'
import { categoryStyle, CATEGORY_META } from '@/lib/categories'
import { todayKey } from '@/lib/dates'
import { supabase } from '@/lib/supabase'
import {
  changeGoalLevel,
  convertGoalToPersonal,
  convertGoalToStructured,
  conversionCooldownRemainingMs,
  effectiveMetric,
  fetchStructuredGoal,
  levelCooldownRemainingMs,
  nextLevelValue,
  describeOpeningLevel,
  type StructuredUserGoal,
} from '@/lib/structuredGoals'
import { BackIcon, GearIcon, WarningIcon } from '@/components/icons'
import { GoalRing } from '@/components/goals/GoalRing'
import { formatValue } from '@/lib/formatValue'
import { Spinner } from '@/components/Spinner'
import { LoadingScreen, PrimaryButton } from '@/components/ui'

/**
 * S1 — the goal card (design 11a/11b), and the two modals that hang off it:
 * S3 level adjustment (11e/11f) and S7 conversion to a personal goal
 * (12e/12f).
 *
 * One template for all 80 goals. The colour, the title, the unit and the
 * numbers are injected from the data; nothing here branches on which goal it
 * is — section 7.1 is the whole point.
 */
export default function GoalCard() {
  const { userGoalId } = useParams<{ userGoalId: string }>()
  const { t, lang } = useI18n()
  const navigate = useNavigate()

  const [levelPrompt, setLevelPrompt] = useState<'up' | 'down' | null>(null)
  const [converting, setConverting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: goal, reload } = useAsync<StructuredUserGoal | null>(
    () => (userGoalId ? fetchStructuredGoal(userGoalId) : Promise.resolve(null)),
    [userGoalId],
  )

  const { data: todaySoFar, reload: reloadToday } = useAsync<number>(async () => {
    if (!userGoalId) return 0
    const { data } = await supabase
      .from('goal_completions')
      .select('metric_value')
      .eq('user_goal_id', userGoalId)
      .eq('completed_date', todayKey())
      .maybeSingle()
    return (data as { metric_value: number | null } | null)?.metric_value ?? 0
  }, [userGoalId])

  const { data: streak } = useAsync<number>(async () => {
    if (!userGoalId) return 0
    const { data } = await supabase
      .from('goal_completions')
      .select('current_streak')
      .eq('user_goal_id', userGoalId)
      .order('completed_date', { ascending: false })
      .limit(1)
      .maybeSingle()
    return (data as { current_streak: number } | null)?.current_streak ?? 0
  }, [userGoalId])

  const library = goal?.library ?? null
  const cooldownMs = goal ? levelCooldownRemainingMs(goal) : 0
  const conversionMs = goal ? conversionCooldownRemainingMs(goal) : 0

  const dailyTarget = useMemo(() => {
    if (!goal?.current_level_value) return 0
    return goal.current_level_value
  }, [goal])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      reload()
      reloadToday()
      setLevelPrompt(null)
      setConverting(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setBusy(false)
    }
  }

  // Only `goal` is required. `library` used to be required too, but a
  // from-scratch personal goal (S5) genuinely has none — that non-null
  // requirement was what made opening one spin forever: nothing ever set
  // `library`, so this screen never got past its own loading state.
  if (!goal) {
    return (
      <LoadingScreen />
    )
  }

  const metric = effectiveMetric(goal)
  const nextUp = nextLevelValue(goal, 'up')
  const nextDown = nextLevelValue(goal, 'down')
  // The user's own copy is what the header shows; the library title is only
  // a fallback for a library goal adopted before a language switch — a
  // from-scratch personal goal has no library title to fall back to at all.
  const title = goal.title || (library ? (lang === 'he' ? library.title_he : library.title_en) : '')
  // The gear opens S7 (convert between the two economies), which only makes
  // sense for a goal that has, or once had, a library origin: converting a
  // from-scratch personal goal "back" to structured always fails server-side
  // ("this goal was never a structured goal"), because it never was one.
  const canConvert = goal.library_id !== null || goal.converted_from_goal_id !== null

  return (
    <main
      style={{ ...categoryStyle(goal.category), paddingTop: 'calc(3.25rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4.5 px-[22px] pb-safe-lg"
    >
      <header className="flex flex-shrink-0 items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon size={21} />
        </button>
        <span className="text-[17px] font-bold">{title}</span>
        {canConvert ? (
          <button
            type="button"
            onClick={() => setConverting(true)}
            aria-label={t('sg.convertTitle')}
            className="text-fg-muted flex"
          >
            <GearIcon size={21} />
          </button>
        ) : (
          // Reserves the gear's width so the title stays centered either way.
          <span className="size-[21px]" />
        )}
      </header>

      <span className="flex-shrink-0 self-start rounded-full border border-[color-mix(in_oklch,var(--cat)_45%,var(--color-line))] px-3 py-1 text-[12.5px] font-semibold text-[var(--cat)]">
        {t(CATEGORY_META[goal.category].labelKey)}
        {library?.subcategory ? ` · ${library.subcategory}` : ''}
      </span>

      {!goal.counts_for_ranking ? (
        <div className="border-line bg-surface text-fg-muted flex-shrink-0 rounded-[14px] border px-3.5 py-2.5 text-[12.5px]">
          {t('sg.personalGoal')} · {t('sg.notRanked')}
        </div>
      ) : null}

      <div className="mt-1.5 flex-shrink-0 text-center">
        <div className="text-[26px] font-bold">
          {library
            ? describeOpeningLevel(library, goal.current_level_value ?? library.level_1_value)
            : `${formatValue(goal.current_level_value ?? 0)} ${metric.metricUnit}`}
        </div>
        <div className="text-fg-muted mt-1.5 text-[13px]">
          {t('sg.yourRecord')}: {formatValue(goal.personal_record_value ?? 0)} {metric.metricUnit}
        </div>
      </div>

      <div className="mt-2 flex-shrink-0">
        <GoalRing value={todaySoFar ?? 0} target={dailyTarget} label={t('sg.today')} />
      </div>

      <div className="flex flex-shrink-0 gap-2.5">
        <Stat value={String(streak ?? 0)} label={t('sg.streakDays')} />
        <Stat value={String(metric.basePoints)} label={t('sg.pointsPerRun')} />
        {/* Q2's answer, not the metric key: how often the user said they would
            do this is what the streak and the weekly total are measured
            against, and it is the only one of the three they chose. */}
        <Stat value={String(goal.target_frequency ?? 7)} label={t('sg.daysPerWeek')} />
      </div>

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <PrimaryButton
        className="text-on-cat mt-1 flex-shrink-0 bg-[var(--cat)]"
        onClick={() => navigate(`/goal/${goal.id}/verify`)}
      >
        {/* goal.verification_code, not library.verification_default — the
            two agree for a library goal, and a from-scratch personal goal
            has only the former. */}
        {goal.verification_code === 'V3' || goal.verification_code === 'V1'
          ? t('sg.startWorkout')
          : t('sg.start')}
      </PrimaryButton>

      <div className="flex flex-shrink-0 gap-2.5">
        <LevelButton
          label={t('sg.hardForMe')}
          disabled={cooldownMs > 0 || nextDown === goal.current_level_value}
          onClick={() => setLevelPrompt('down')}
        />
        <LevelButton
          label={t('sg.easyForMe')}
          disabled={cooldownMs > 0}
          onClick={() => setLevelPrompt('up')}
        />
      </div>

      {cooldownMs > 0 ? (
        <p className="text-fg-subtle flex-shrink-0 text-center text-[11.5px]">
          {t('sg.cooldown').replace('{hours}', String(Math.ceil(cooldownMs / 3_600_000)))}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => navigate(`/goal/${goal.id}/progress`)}
        className="text-fg-muted mt-auto flex flex-shrink-0 items-center justify-center gap-1.5 text-[13px] font-semibold"
      >
        {t('sg.progressAndGrowth')}
        <BackIcon size={15} />
      </button>

      {levelPrompt ? (
        <LevelSheet
          goal={goal}
          direction={levelPrompt}
          nextValue={levelPrompt === 'up' ? nextUp : nextDown}
          busy={busy}
          onCancel={() => setLevelPrompt(null)}
          onConfirm={() => void run(() => changeGoalLevel(goal.id, levelPrompt))}
        />
      ) : null}

      {converting ? (
        <ConversionSheet
          goal={goal}
          cooldownMs={conversionMs}
          busy={busy}
          onCancel={() => setConverting(false)}
          onConfirm={() =>
            void run(() =>
              goal.counts_for_ranking
                ? convertGoalToPersonal(goal.id)
                : convertGoalToStructured(goal.id),
            )
          }
        />
      ) : null}
    </main>
  )
}

function Stat({ value, label, small = false }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="border-line bg-surface flex-1 rounded-[14px] border px-1.5 py-3 text-center">
      <div className={small ? 'text-[13px] font-bold' : 'text-[17px] font-bold'}>{value}</div>
      <div className="text-fg-muted mt-0.5 truncate text-[10.5px]">{label}</div>
    </div>
  )
}

function LevelButton({
  label,
  disabled,
  onClick,
}: {
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="border-line h-12 flex-1 rounded-[14px] border text-[14.5px] font-semibold disabled:opacity-40"
    >
      {label}
    </button>
  )
}

/**
 * S3 (design 11e/11f). The screen the document insists must state the penalty
 * up front: "a user who discovers a penalty after the fact feels cheated"
 * (section 4.2).
 */
function LevelSheet({
  goal,
  direction,
  nextValue,
  busy,
  onCancel,
  onConfirm,
}: {
  goal: StructuredUserGoal
  direction: 'up' | 'down'
  nextValue: number | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const metric = effectiveMetric(goal)
  const current = goal.current_level_value ?? 0
  const record = goal.personal_record_value ?? current

  // Section 4.1.1 — what the points per run become at the new level.
  const nextMultiplier =
    nextValue === null || record <= 0
      ? 1
      : Math.min(1, Math.max(0.6, metric.metricDirection === 'up' ? nextValue / record : record / nextValue))
  const currentPoints = Math.round(metric.basePoints)
  const nextPoints = Math.round(metric.basePoints * nextMultiplier)
  const isNewRecord =
    nextValue !== null &&
    (metric.metricDirection === 'up' ? nextValue > record : nextValue < record)

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" aria-label={t('common.cancel')} onClick={onCancel} className="bg-scrim absolute inset-0" />
      <div
        className="border-line bg-bg absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[26px] border-t px-6 pt-3.5"
        style={{ paddingBottom: 'calc(1.875rem + env(safe-area-inset-bottom))' }}
      >
        <div className="bg-line mx-auto mb-5 h-1 w-[38px] rounded-full" />
        <div className="text-center text-[19px] font-bold">
          {t(direction === 'up' ? 'sg.raiseLevel' : 'sg.lowerLevel')}
        </div>

        <div className="mt-5.5 flex items-baseline justify-center gap-3">
          <span dir="ltr" className="text-fg-muted text-[38px] font-bold [unicode-bidi:isolate]">
            {formatValue(current)}
          </span>
          <span className="text-fg-subtle">→</span>
          <span dir="ltr" className="text-[38px] font-bold [unicode-bidi:isolate]">
            {nextValue === null ? '—' : formatValue(nextValue)}
          </span>
        </div>
        <div className="text-fg-muted mt-1 text-center text-[13px]">{metric.metricUnit}</div>

        <div className="bg-surface-raised mt-5.5 rounded-[14px] px-4 py-3.5 text-[13px] leading-relaxed">
          {direction === 'down'
            ? t('sg.penaltyExplain')
                .replace('{from}', String(currentPoints))
                .replace('{to}', String(nextPoints))
                .replace('{record}', formatValue(record))
            : isNewRecord
              ? t('sg.bonusExplain').replace('{bonus}', String(Math.round(metric.basePoints * 0.5)))
              : t('sg.recordKept')}
        </div>

        {direction === 'down' ? (
          <p className="text-fg-muted mt-3 text-center text-[12.5px]">{t('sg.recordKept')}</p>
        ) : null}

        <div className="mt-5 flex flex-col gap-2.5">
          <PrimaryButton className="h-13" disabled={busy || nextValue === null} onClick={onConfirm}>
            {busy ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
            {t(direction === 'up' ? 'sg.yesRaise' : 'sg.yesLower')}
          </PrimaryButton>
          <button
            type="button"
            onClick={onCancel}
            className="border-line text-fg-muted h-13 rounded-[15px] border text-[15.5px] font-semibold"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** S7 (design 12e/12f) — section 5.1's explicit confirmation. */
function ConversionSheet({
  goal,
  cooldownMs,
  busy,
  onCancel,
  onConfirm,
}: {
  goal: StructuredUserGoal
  cooldownMs: number
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const goingPersonal = goal.counts_for_ranking
  const blocked = !goingPersonal && cooldownMs > 0

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-[22px]">
      <button type="button" aria-label={t('common.cancel')} onClick={onCancel} className="bg-scrim absolute inset-0" />
      <div className="border-line bg-surface relative w-full max-w-sm rounded-[20px] border px-[22px] pt-[26px] pb-[22px]">
        <div className="flex flex-col items-center gap-3.5">
          <div className="bg-danger/15 text-danger flex size-13 items-center justify-center rounded-full">
            <WarningIcon size={26} />
          </div>
          <div className="text-center">
            <div className="text-[17px] font-bold">
              {goingPersonal ? t('sg.convertTitle') : t('sg.convertBack')}
            </div>
            <p className="text-fg-muted mt-2 text-[13.5px] leading-relaxed">{t('sg.convertBody')}</p>
          </div>
        </div>

        <div className="text-fg-muted mt-4 space-y-1.5 text-[12.5px]">
          <div>✓ {t('sg.convertKeeps')}</div>
          <div>✗ {t('sg.convertLoses')}</div>
        </div>

        {blocked ? (
          <p className="text-fg-subtle mt-3 text-center text-[12px]">
            {t('sg.convertCooldown').replace('{days}', String(Math.ceil(cooldownMs / 86_400_000)))}
          </p>
        ) : null}

        <div className="mt-5.5 flex flex-col gap-2.5">
          <PrimaryButton className="h-13" disabled={busy || blocked} onClick={onConfirm}>
            {busy ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
            {goingPersonal ? t('sg.convertConfirm') : t('sg.convertBack')}
          </PrimaryButton>
          <button
            type="button"
            onClick={onCancel}
            className="border-line text-fg-muted h-13 rounded-[14px] border text-[14.5px] font-semibold"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
