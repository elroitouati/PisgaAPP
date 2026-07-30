import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { CATEGORIES, CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { createCustomGoal } from '@/lib/api'
import { fetchStructuredLibrary, type VerificationCode } from '@/lib/structuredGoals'
import { supabase } from '@/lib/supabase'
import { BackIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'
import { PrimaryButton } from '@/components/ui'

/**
 * Section 8 — what the builder inherits from a subcategory.
 *
 * This is the table that turns the wizard from a form into something that
 * knows what it is talking about: pick "strength" and the metric, the
 * verification default and the level step are already filled in. Taken
 * verbatim from the section 8 table rather than inferred.
 */
const INHERITANCE: Record<
  string,
  { metricUnit: string; verification: VerificationCode; alternatives: VerificationCode[]; step: number }
> = {
  כוח: { metricUnit: 'חזרות', verification: 'V3', alternatives: ['V1', 'V0'], step: 3 },
  ליבה: { metricUnit: 'שניות', verification: 'V3', alternatives: ['V1', 'V0'], step: 10 },
  סבולת: { metricUnit: 'דקות', verification: 'V2', alternatives: ['V1', 'V6', 'V0'], step: 5 },
  גמישות: { metricUnit: 'דקות', verification: 'V1', alternatives: ['V0'], step: 5 },
  מיינדפולנס: { metricUnit: 'דקות', verification: 'V1', alternatives: ['V0'], step: 2 },
  'זמן מרוכז': { metricUnit: 'דקות', verification: 'V7', alternatives: ['V1', 'V0'], step: 15 },
  תוצרים: { metricUnit: 'יחידות', verification: 'V8', alternatives: ['V6', 'V0'], step: 1 },
  שינון: { metricUnit: 'כרטיסים', verification: 'V8', alternatives: ['V6', 'V0'], step: 10 },
  'קשרים קרובים': { metricUnit: 'פעמים', verification: 'V5', alternatives: ['V6', 'V0'], step: 1 },
  נתינה: { metricUnit: 'שעות', verification: 'V5', alternatives: ['V6', 'V0'], step: 1 },
  הימנעות: { metricUnit: 'ימים נקיים', verification: 'V4', alternatives: ['V7', 'V0'], step: 1 },
  גבולות: { metricUnit: 'דקות', verification: 'V4', alternatives: ['V7', 'V0'], step: 15 },
  יצירה: { metricUnit: 'פעמים', verification: 'V6', alternatives: ['V0'], step: 1 },
  'סדר וארגון': { metricUnit: 'פעמים', verification: 'V6', alternatives: ['V0'], step: 1 },
}

const FALLBACK = { metricUnit: 'פעמים', verification: 'V0' as VerificationCode, alternatives: [], step: 1 }

/**
 * S5 — the personal goal builder (designs 13a–13h).
 *
 * Four steps, and the fourth is the one that closes the loop: section 8 says
 * the screen must state, in words, that lowering a level shrinks the points
 * per run. Without that sentence "easy for me" has nothing to push against.
 *
 * A personal goal earns bonus points and stays out of the shared ranking
 * (section 1). That is not a limitation to hide — it is what lets "no
 * verification" be a legitimate, visible choice here.
 */
export default function GoalBuilder() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<Category>('physical')
  const [subcategory, setSubcategory] = useState<string | null>(null)
  const [metricUnit, setMetricUnit] = useState('')
  const [verification, setVerification] = useState<VerificationCode>('V0')
  const [levelStep, setLevelStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The subcategory list comes from the library itself, so it can never drift
  // from the 80 goals the way a hard-coded list would.
  const { data: library } = useAsync(() => fetchStructuredLibrary(), [])
  const subcategories = useMemo(() => {
    const inCategory = (library ?? []).filter((g) => g.category === category)
    return [...new Set(inCategory.map((g) => g.subcategory).filter(Boolean))] as string[]
  }, [library, category])

  function chooseSubcategory(name: string) {
    setSubcategory(name)
    const inherited = INHERITANCE[name] ?? FALLBACK
    setMetricUnit(inherited.metricUnit)
    setVerification(inherited.verification)
    setLevelStep(inherited.step)
  }

  const inherited = subcategory ? (INHERITANCE[subcategory] ?? FALLBACK) : FALLBACK
  const allowed = [inherited.verification, ...inherited.alternatives].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  )

  async function create() {
    if (!user) return
    setSaving(true)
    setError(null)
    try {
      const goal = await createCustomGoal(user.id, {
        title: title.trim(),
        description: null,
        category,
        goal_type: 'daily',
        verification: 'checkbox_reflection',
      })
      // The level state and the chosen method are structured-goal columns, so
      // they are set after creation rather than through the legacy helper.
      // counts_for_ranking is already false — createCustomGoal sets it, which
      // is what makes the V0 option below legal against the DB constraint.
      await supabase
        .from('user_goals')
        .update({
          verification_code: verification,
          current_level_value: 1,
          personal_record_value: 1,
        })
        .eq('id', goal.id)
      navigate(`/goal/${goal.id}`, { replace: true })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
      setSaving(false)
    }
  }

  const canContinue =
    (step === 1 && title.trim() !== '' && subcategory !== null) ||
    (step === 2 && metricUnit.trim() !== '') ||
    step === 3 ||
    step === 4

  return (
    <main
      style={{ ...categoryStyle(category), paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5.5 px-[26px] pb-10"
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => (step === 1 ? navigate(-1) : setStep((s) => s - 1))}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon size={21} />
        </button>
        <div>
          <div className="text-[17px] font-bold">{t('sg.builderTitle')}</div>
          <div className="text-fg-muted mt-px text-[12px]">
            {t('sg.builderStep').replace('{step}', String(step))}
          </div>
        </div>
      </header>

      <div className="flex flex-shrink-0 gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-[var(--cat)]' : 'bg-line'}`}
          />
        ))}
      </div>

      {step === 1 ? (
        <>
          <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.builderWhat')}</div>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('sg.builderNamePlaceholder')}
            className="border-line bg-surface focus:border-fg flex-shrink-0 rounded-[14px] border px-4 py-3.5 text-[15px] font-semibold outline-none"
          />

          <div className="flex flex-shrink-0 flex-wrap gap-2">
            {CATEGORIES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setCategory(option)
                  setSubcategory(null)
                }}
                style={categoryStyle(option)}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${
                  category === option
                    ? 'border-[1.4px] border-[var(--cat)] text-[var(--cat)]'
                    : 'border-line text-fg-muted border'
                }`}
              >
                {t(CATEGORY_META[option].labelKey)}
              </button>
            ))}
          </div>

          <div className="flex-shrink-0">
            <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
              {t('sg.builderSubcategory')}
            </div>
            <div className="flex flex-wrap gap-2">
              {subcategories.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => chooseSubcategory(name)}
                  className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${
                    subcategory === name
                      ? 'border border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_12%,var(--color-surface))] text-[var(--cat)]'
                      : 'border-line text-fg-muted border'
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.builderMetric')}</div>
          <input
            value={metricUnit}
            onChange={(event) => setMetricUnit(event.target.value)}
            className="border-line bg-surface focus:border-fg flex-shrink-0 rounded-[14px] border px-4 py-3.5 text-[15px] font-semibold outline-none"
          />
          <p className="text-fg-subtle flex-shrink-0 text-[12.5px] leading-relaxed">
            {subcategory} → {inherited.metricUnit}
          </p>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.builderVerify')}</div>
          <div className="flex flex-shrink-0 flex-col gap-2.5">
            {allowed
              .filter((code) => code !== 'V0')
              .map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setVerification(code)}
                  className={`rounded-[15px] px-4 py-3.5 text-start text-[14.5px] font-semibold ${
                    verification === code
                      ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_10%,var(--color-surface))]'
                      : 'border-line bg-surface border'
                  }`}
                >
                  {t(`sg.${code.toLowerCase()}.title` as 'sg.v1.title')}
                </button>
              ))}
          </div>

          {/* Section 8: this has to be prominent, not hidden. A personal goal
              is outside the ranking anyway, so there is nothing to protect. */}
          <button
            type="button"
            onClick={() => setVerification('V0')}
            className={`flex-shrink-0 rounded-[15px] px-4 py-3.5 text-[14.5px] font-bold ${
              verification === 'V0'
                ? 'bg-brand text-on-brand'
                : 'border-line border border-dashed'
            }`}
          >
            {t('sg.builderNoVerification')}
          </button>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <div className="flex-shrink-0 text-[22px] font-bold">{t('sg.builderStep4')}</div>
          <div className="border-line bg-surface flex flex-shrink-0 items-center justify-between rounded-[14px] border px-4 py-3.5">
            <span className="text-[15px] font-semibold">{t('sg.builderStepLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              value={levelStep}
              onChange={(event) => setLevelStep(Number(event.target.value))}
              dir="ltr"
              className="w-20 bg-transparent text-end text-[18px] font-bold outline-none"
            />
          </div>
          <p className="text-fg-muted flex-shrink-0 text-[13px] leading-relaxed">
            {t('sg.builderPenaltyNote')}
          </p>
          <p className="text-fg-subtle flex-shrink-0 text-[12.5px] leading-relaxed">
            {t('sg.builderPersonalNote')}
          </p>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      <PrimaryButton
        className="mt-auto flex-shrink-0"
        disabled={!canContinue || saving}
        onClick={() => (step === 4 ? void create() : setStep((s) => s + 1))}
      >
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
        {step === 4 ? t('sg.create') : t('sg.next')}
      </PrimaryButton>
    </main>
  )
}
