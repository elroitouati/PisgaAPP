import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { categoryStyle, CATEGORY_META } from '@/lib/categories'
import { supabase } from '@/lib/supabase'
import {
  fetchStructuredGoal,
  recordStructuredCompletion,
  type LibraryGoalRow,
  type StructuredUserGoal,
  type VerificationCode,
} from '@/lib/structuredGoals'
import { BackIcon, CameraIcon, UploadIcon } from '@/components/icons'
import { formatValue } from '@/lib/formatValue'
import { Spinner } from '@/components/Spinner'
import { PrimaryButton } from '@/components/ui'

/**
 * VS1–VS8 — the eight verification screens (designs 14a–15h).
 *
 * One route. Which screen renders is decided by the goal's
 * `verification_code`, never by which goal it is: section 7.1 says a goal's
 * screens are S1 + S2 + the screen of its verification method, and that is
 * literally what this switch is. Adding an 81st goal touches nothing here.
 */
export default function Verify() {
  const { userGoalId } = useParams<{ userGoalId: string }>()
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // The method being used for this one completion. Only ever differs from the
  // goal's own when the user picked a fallback the library allows — the server
  // re-checks it and prices the trust multiplier off it, so this is a request,
  // not a claim.
  const [using, setUsing] = useState<VerificationCode | null>(null)

  const { data: goal } = useAsync<StructuredUserGoal | null>(
    () => (userGoalId ? fetchStructuredGoal(userGoalId) : Promise.resolve(null)),
    [userGoalId],
  )

  async function submit(metricValue: number, note?: string, mediaPath?: string) {
    if (!goal) return
    setSaving(true)
    setError(null)
    try {
      await recordStructuredCompletion({
        userGoalId: goal.id,
        metricValue,
        reflectionNote: note,
        verification: using ?? undefined,
      })
      if (mediaPath) {
        await supabase
          .from('goal_completions')
          .update({ media_path: mediaPath })
          .eq('user_goal_id', goal.id)
          .eq('completed_date', new Date().toISOString().slice(0, 10))
      }
      navigate(`/goal/${goal.id}`, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
      setSaving(false)
    }
  }

  if (!goal || !goal.library) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Spinner className="size-7" />
      </main>
    )
  }

  const library = goal.library
  const target = goal.current_level_value ?? library.level_1_value
  const shared = { goal, library, target, saving, submit }
  // What the goal is being completed with right now, which is what decides
  // which VS screen renders.
  const method = using ?? goal.verification_code

  return (
    <main
      style={{ ...categoryStyle(goal.category), paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4.5 px-[26px] pb-10"
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
        <div className="text-[17px] font-bold">{goal.title}</div>
      </header>

      <span className="flex-shrink-0 self-start rounded-full border border-[color-mix(in_oklch,var(--cat)_45%,var(--color-line))] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--cat)]">
        {t(CATEGORY_META[goal.category].labelKey)}
      </span>

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      {method === 'V1' ? <TimerScreen {...shared} focus={false} /> : null}
      {method === 'V2' ? <SensorScreen {...shared} onFallback={setUsing} /> : null}
      {method === 'V3' ? <RepCounterScreen {...shared} /> : null}
      {method === 'V4' ? <CheckInScreen {...shared} /> : null}
      {method === 'V5' ? <TellUsScreen {...shared} /> : null}
      {method === 'V6' ? <MediaScreen {...shared} /> : null}
      {method === 'V7' ? <TimerScreen {...shared} focus /> : null}
      {method === 'V8' ? <OutputScreen {...shared} /> : null}
      {method === 'V0' ? <SelfCheckScreen {...shared} /> : null}

      {/* The trust multiplier of a fallback is lower than the sensor's, and
          saying so is the point: the user chose the cheaper method knowingly. */}
      {using ? (
        <p className="text-fg-subtle flex-shrink-0 text-center text-[11.5px]">
          {t('sg.usingFallback').replace('{method}', t(`sg.${using.toLowerCase()}.title` as 'sg.v1.title'))}
        </p>
      ) : null}

      <p className="text-fg-subtle flex-shrink-0 pt-2 text-center text-[11px]">
        {lang === 'he' ? library.description_he : library.description_en}
      </p>
    </main>
  )
}

type ScreenProps = {
  goal: StructuredUserGoal
  library: LibraryGoalRow
  target: number
  saving: boolean
  submit: (metricValue: number, note?: string, mediaPath?: string) => Promise<void>
}

/** VS3 — rep and set counter (design 15a/15b). */
function RepCounterScreen({ library, target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  const totalSets = Math.max(1, library.session_config?.sets ?? 3)
  const perSet = Math.round(target / totalSets)
  const restSeconds = library.session_config?.rest_seconds ?? 60

  const [done, setDone] = useState(0)
  const [resting, setResting] = useState<number | null>(null)

  useEffect(() => {
    if (resting === null) return
    if (resting <= 0) {
      setResting(null)
      return
    }
    const id = setTimeout(() => setResting((r) => (r === null ? null : r - 1)), 1000)
    return () => clearTimeout(id)
  }, [resting])

  const finished = done >= totalSets

  return (
    <>
      <div className="flex-1 text-center">
        <div className="text-fg-muted text-[13px]">
          {t('sg.v3.set')} {Math.min(done + 1, totalSets)} / {totalSets}
        </div>
        <div className="mt-2 text-[52px] leading-none font-bold">{perSet}</div>
        <div className="text-fg-muted mt-1 text-[14px]">{library.metric_unit}</div>

        <div className="mt-7 flex justify-center gap-2">
          {Array.from({ length: totalSets }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-9 rounded-full ${i < done ? 'bg-[var(--cat)]' : 'bg-line'}`}
            />
          ))}
        </div>

        {resting !== null ? (
          <div className="mt-7">
            <div className="text-fg-muted text-[13px]">{t('sg.v3.rest')}</div>
            <div dir="ltr" className="mt-1 text-[34px] font-bold [unicode-bidi:isolate]">
              {resting}
            </div>
            <button
              type="button"
              onClick={() => setResting(null)}
              className="border-line text-fg mt-3 rounded-[13px] border px-5 py-2.5 text-[13px] font-semibold"
            >
              {t('sg.v3.skipRest')}
            </button>
          </div>
        ) : null}
      </div>

      {finished ? (
        <PrimaryButton
          className="text-on-cat flex-shrink-0 bg-[var(--cat)]"
          disabled={saving}
          onClick={() => void submit(perSet * totalSets)}
        >
          {saving ? <Spinner className="border-current/30 border-t-current" /> : null}
          {t('sg.finish')}
        </PrimaryButton>
      ) : (
        <PrimaryButton
          className="text-on-cat flex-shrink-0 bg-[var(--cat)]"
          disabled={resting !== null}
          onClick={() => {
            setDone((d) => d + 1)
            if (done + 1 < totalSets) setResting(restSeconds)
          }}
        >
          {t('sg.v3.finishSet')}
        </PrimaryButton>
      )}
    </>
  )
}

/**
 * VS1 and VS7 — the two timers (designs 15e/15f for focus).
 *
 * The difference is not cosmetic: section 5 says a V7 session is VOIDED if
 * the user leaves the app, which is the only thing that makes a focus timer
 * mean anything. V1 merely pauses.
 */
function TimerScreen({ library, target, saving, submit, focus }: ScreenProps & { focus: boolean }) {
  const { t } = useI18n()

  // A timer can only count down to a level when the level is a duration.
  // "2 gym sessions a week" or "200 metres" is not one, and treating the
  // target as seconds would end a gym session after two seconds — so those
  // goals get a stopwatch instead, and record one performance when it stops.
  const minutesMetric = library.metric_key.startsWith('minutes')
  const configured = library.session_config?.work_seconds
  const isCountdown =
    configured !== undefined || minutesMetric || library.metric_key.startsWith('seconds')
  const totalSeconds = Math.round(configured ?? (minutesMetric ? target * 60 : target))

  /** A stopwatch stopped after two seconds is not proof of anything. */
  const STOPWATCH_FLOOR_SECONDS = 60

  const [left, setLeft] = useState(isCountdown ? totalSeconds : 0)
  const [running, setRunning] = useState(false)
  const [voided, setVoided] = useState(false)

  useEffect(() => {
    if (!running) return
    if (isCountdown && left <= 0) return
    const id = setTimeout(() => setLeft((s) => (isCountdown ? s - 1 : s + 1)), 1000)
    return () => clearTimeout(id)
  }, [running, left, isCountdown])

  useEffect(() => {
    if (!focus || !running) return
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        setVoided(true)
        setRunning(false)
      }
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [focus, running])

  const done = isCountdown ? left <= 0 : left >= STOPWATCH_FLOOR_SECONDS
  const minutes = String(Math.floor(left / 60)).padStart(2, '0')
  const seconds = String(left % 60).padStart(2, '0')

  return (
    <>
      <div className="flex-1 text-center">
        <div className="text-fg-muted text-[13px]">{t(focus ? 'sg.v7.title' : 'sg.v1.title')}</div>
        <div dir="ltr" className="mt-4 text-[64px] leading-none font-bold [unicode-bidi:isolate]">
          {minutes}:{seconds}
        </div>
        {focus ? (
          <p className="text-fg-subtle mx-auto mt-5 max-w-[260px] text-[12.5px] leading-relaxed">
            {t('sg.v7.explain')}
          </p>
        ) : null}
        {voided ? (
          <p role="alert" className="text-danger mt-4 text-[13px] font-semibold">
            {t('sg.v7.failed')}
          </p>
        ) : null}
      </div>

      {done ? (
        <PrimaryButton
          className="text-on-cat flex-shrink-0 bg-[var(--cat)]"
          disabled={saving}
          onClick={() =>
            void submit(
              // A stopwatch records one performance of the goal, not its own
              // elapsed seconds — the goal is measured in sessions or metres.
              isCountdown && minutesMetric ? totalSeconds / 60 : target,
            )
          }
        >
          {saving ? <Spinner className="border-current/30 border-t-current" /> : null}
          {t('sg.finish')}
        </PrimaryButton>
      ) : (
        <PrimaryButton
          className="text-on-cat flex-shrink-0 bg-[var(--cat)]"
          onClick={() => {
            setVoided(false)
            if (voided) setLeft(isCountdown ? totalSeconds : 0)
            setRunning((r) => !r)
          }}
        >
          {running ? t('timer.pause') : voided ? t('timer.restart') : t('sg.start')}
        </PrimaryButton>
      )}
    </>
  )
}

/**
 * VS2 — sensor sync (design 14a/14b).
 *
 * No manual fallback, deliberately. Section 5 defines V2 as "read directly
 * from the device, no self-reporting", and it is the only method worth ×1.2.
 * A typed-in number wearing that multiplier would be the single easiest way
 * to cheat the leaderboard, so an unavailable sensor says so.
 */
function SensorScreen({
  library,
  onFallback,
}: ScreenProps & { onFallback: (code: VerificationCode) => void }) {
  const { t } = useI18n()

  // Section 2 gives every goal a list of methods it accepts. V2 is excluded
  // because it is the one that is unavailable, and V0 because a ranked goal
  // leaves the ranking through S7, not through this screen.
  const alternatives = (library.verification_allowed ?? []).filter(
    (code) => code !== 'V2' && code !== 'V0',
  )

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-[18px] bg-[color-mix(in_oklch,var(--cat)_15%,var(--color-surface))] text-[var(--cat)]">
        <UploadIcon size={30} />
      </div>
      <div className="text-[19px] font-bold">{t('sg.v2.title')}</div>
      <p className="text-fg-muted mx-auto max-w-[280px] text-[13.5px] leading-relaxed">
        {t('sg.v2.explain')}
      </p>
      <p className="text-fg-subtle text-[13px]">{t('sg.v2.unavailable')}</p>

      {alternatives.length > 0 ? (
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <div className="text-fg-subtle text-[11px] font-semibold tracking-[0.08em]">
            {t('sg.orVerifyAnotherWay')}
          </div>
          {alternatives.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onFallback(code)}
              className="border-line bg-surface rounded-[15px] border px-4 py-3.5 text-[14.5px] font-semibold"
            >
              {t(`sg.${code.toLowerCase()}.title` as 'sg.v1.title')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** VS4 — avoidance check-in (design 14c/14d). Today only, per protection 7. */
function CheckInScreen({ target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  return (
    <>
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="text-center text-[22px] font-bold">{t('sg.v4.question')}</div>
        <div className="flex w-full gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit(target)}
            className="h-16 flex-1 rounded-[16px] border-[1.6px] border-[var(--cat)] text-[17px] font-bold text-[var(--cat)]"
          >
            {t('sg.v4.yes')}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void submit(0)}
            className="border-line text-fg h-16 flex-1 rounded-[16px] border-[1.6px] text-[17px] font-bold"
          >
            {t('sg.v4.no')}
          </button>
        </div>
        <p className="text-fg-subtle text-center text-[12.5px]">{t('sg.v4.noBackfill')}</p>
      </div>
    </>
  )
}

/**
 * VS5 — "tell us what happened" (design 14e/14f).
 *
 * The workhorse: 19 goals use it, and almost the whole social category, after
 * friend-approval was considered and rejected. Section 5 is emphatic that it
 * stays light — 40 characters, not 200 — because the moment logging feels
 * like homework people stop logging. The three chips exist to fill the box in
 * taps rather than sentences.
 */
function TellUsScreen({ target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const enough = note.trim().length >= 40

  const chips = ['sg.v5.withWho', 'sg.v5.whatDid', 'sg.v5.howWas'] as const

  return (
    <>
      <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.v5.title')}</div>

      <div className="flex flex-shrink-0 flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setNote((n) => `${n}${n && !n.endsWith(' ') ? ' ' : ''}${t(chip).replace('+ ', '')}: `)}
            className="rounded-full border border-[color-mix(in_oklch,var(--cat)_40%,var(--color-line))] bg-[color-mix(in_oklch,var(--cat)_12%,var(--color-surface))] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--cat)]"
          >
            {t(chip)}
          </button>
        ))}
      </div>

      <div className="border-line bg-surface flex-shrink-0 rounded-[16px] border px-4 pt-4 pb-3">
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder={t('sg.v5.placeholder')}
          className="w-full resize-none bg-transparent text-[14.5px] leading-relaxed outline-none"
        />
        <div className="border-line mt-2 flex items-center justify-end gap-1.5 border-t pt-2.5">
          <span dir="ltr" className={`text-[12px] [unicode-bidi:isolate] ${enough ? 'text-[var(--cat)]' : 'text-fg-subtle'}`}>
            {note.trim().length} / 40
          </span>
        </div>
      </div>

      <p className="text-fg-subtle flex-shrink-0 text-center text-[12.5px]">{t('sg.v5.hint')}</p>

      <PrimaryButton
        className="mt-auto flex-shrink-0"
        disabled={!enough || saving}
        onClick={() => void submit(target, note.trim())}
      >
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('sg.finish')}
      </PrimaryButton>
    </>
  )
}

/** VS6 — media proof (design 15c/15d). Private by default, per section 5. */
function MediaScreen({ goal, target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [preview, setPreview] = useState<string | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)

  async function upload(file: File | undefined) {
    if (!file || !user) return
    setUploading(true)
    setUploadError(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const key = `${user.id}/${goal.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('goal-media')
        .upload(key, file, { contentType: file.type })
      if (error) throw new Error(error.message)
      setPath(key)
      setPreview(URL.createObjectURL(file))
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.v6.title')}</div>

      <div className="border-line bg-surface flex flex-1 items-center justify-center overflow-hidden rounded-[16px] border">
        {preview ? (
          <img src={preview} alt="" className="max-h-full w-full object-contain" />
        ) : uploading ? (
          <Spinner className="size-7" />
        ) : (
          <span className="text-fg-subtle text-[13px]">{t('sg.v6.private')}</span>
        )}
      </div>

      {uploadError ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {uploadError}
        </p>
      ) : null}

      <div className="flex flex-shrink-0 gap-2.5">
        <button
          type="button"
          onClick={() => camera.current?.click()}
          className="border-line flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-semibold"
        >
          <CameraIcon size={19} />
          {t('sg.v6.take')}
        </button>
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="border-line flex h-12 flex-1 items-center justify-center gap-2 rounded-[14px] border text-[14px] font-semibold"
        >
          <UploadIcon size={19} />
          {t('sg.v6.upload')}
        </button>
      </div>

      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      <PrimaryButton
        className="flex-shrink-0"
        disabled={!path || saving}
        onClick={() => void submit(target, undefined, path ?? undefined)}
      >
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('sg.finish')}
      </PrimaryButton>
    </>
  )
}

/** VS8 — a measurable output (design 15g/15h). */
function OutputScreen({ library, target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  const [value, setValue] = useState<string>(String(target))
  const numeric = Number(value)

  return (
    <>
      <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.v8.title')}</div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('sg.v8.placeholder')}
          dir="ltr"
          className="border-line bg-surface focus:border-fg w-40 rounded-[16px] border py-4 text-center text-[38px] font-bold outline-none"
        />
        <span className="text-fg-muted text-[14px]">{library.metric_unit}</span>
        <span className="text-fg-subtle text-[12.5px]">
          {t('sg.today')}: {formatValue(target)} {library.metric_unit}
        </span>
      </div>

      <PrimaryButton
        className="flex-shrink-0"
        disabled={saving || !Number.isFinite(numeric) || numeric < 0}
        onClick={() => void submit(numeric)}
      >
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('sg.confirm')}
      </PrimaryButton>
    </>
  )
}

/**
 * V0 — the inline self-check. Section 7.2 says this is not a screen; it only
 * lands here because a goal converted to personal keeps the same route, and a
 * dead end would be worse than a checkbox.
 */
function SelfCheckScreen({ target, saving, submit }: ScreenProps) {
  const { t } = useI18n()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <div className="text-center text-[20px] font-bold">{t('verify.checkin.question')}</div>
      <PrimaryButton className="w-full" disabled={saving} onClick={() => void submit(target)}>
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {t('verify.checkin.yes')}
      </PrimaryButton>
    </div>
  )
}
