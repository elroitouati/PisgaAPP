import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { saveOnboardingAnswers } from '@/lib/api'
import { CATEGORIES, CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { BackIcon, BellIcon, CheckIcon, ClockIcon } from '@/components/icons'
import { PrimaryButton, SectionLabel } from '@/components/ui'
import type { TranslationKey } from '@/i18n/translations'

/**
 * Designs 3b (step 1 — pick categories) and 3c (step 2 — pace and reminders),
 * plus a third step for experience level. The handoff draws three progress
 * pips but only supplied two screens; step 3 was specified separately and
 * reuses step 1's option-row treatment so it stays in the same visual language.
 */
const LEVELS = [
  { value: 'beginner', labelKey: 'onboarding.level.beginner', subKey: 'onboarding.level.beginnerSub' },
  {
    value: 'intermediate',
    labelKey: 'onboarding.level.intermediate',
    subKey: 'onboarding.level.intermediateSub',
  },
  { value: 'advanced', labelKey: 'onboarding.level.advanced', subKey: 'onboarding.level.advancedSub' },
] satisfies { value: string; labelKey: TranslationKey; subKey: TranslationKey }[]

const PACES = [
  { value: 2, labelKey: 'onboarding.pace.light' },
  { value: 3, labelKey: 'onboarding.pace.recommended' },
  { value: 5, labelKey: 'onboarding.pace.challenging' },
] satisfies { value: number; labelKey: TranslationKey }[]

export default function Onboarding() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { finishOnboarding } = useProfile()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [categories, setCategories] = useState<Category[]>([])
  const [pace, setPace] = useState(3)
  const [morningReminder, setMorningReminder] = useState(true)
  const [eveningReminder, setEveningReminder] = useState(false)
  const [level, setLevel] = useState<string>('beginner')
  const [saving, setSaving] = useState(false)

  function toggle(category: Category) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    )
  }

  async function finish(skipped: boolean) {
    setSaving(true)
    try {
      if (user && !skipped) {
        await saveOnboardingAnswers(user.id, {
          focus_categories: categories,
          daily_pace: pace,
          reminder_morning: morningReminder,
          reminder_evening: eveningReminder,
          experience_level: level,
        })
      }
      await finishOnboarding()
      navigate('/', { replace: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-[26px] pt-14 pb-9"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? navigate(-1) : setStep(step - 1))}
          className="text-fg-muted flex"
          aria-label={t('common.back')}
        >
          <BackIcon />
        </button>

        <div className="flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className={`h-[5px] rounded-full transition-all ${
                index === step ? 'bg-fg w-[22px]' : 'bg-line w-[9px]'
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => void finish(true)}
          disabled={saving}
          className="text-fg-muted text-[13px]"
        >
          {t('common.skip')}
        </button>
      </header>

      {step === 0 ? (
        <>
          <div className="mt-[30px]">
            <h1 className="text-2xl leading-[1.25] font-bold">{t('onboarding.step1.title')}</h1>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              {t('onboarding.step1.sub')}
            </p>
          </div>

          <div className="mt-[26px] flex flex-col gap-[11px]">
            {CATEGORIES.map((category) => (
              <CategoryChoice
                key={category}
                category={category}
                selected={categories.includes(category)}
                onToggle={() => toggle(category)}
              />
            ))}
          </div>

          <PrimaryButton
            className="mt-auto"
            onClick={() => setStep(1)}
            disabled={categories.length === 0}
          >
            {t('onboarding.step1.cta')}
            {categories.length > 0
              ? ` · ${t('onboarding.step1.selected')} ${categories.length}`
              : ''}
          </PrimaryButton>
        </>
      ) : step === 1 ? (
        <>
          <div className="mt-[30px]">
            <h1 className="text-2xl leading-[1.25] font-bold">{t('onboarding.step2.title')}</h1>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              {t('onboarding.step2.sub')}
            </p>
          </div>

          <div
            className="mt-[26px] flex gap-2.5"
            style={categoryStyle(categories[0] ?? 'physical')}
          >
            {PACES.map((option) => {
              const active = pace === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPace(option.value)}
                  aria-pressed={active}
                  className={`flex-1 rounded-[15px] px-2 py-[18px] text-center ${
                    active
                      ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_10%,var(--color-surface))]'
                      : 'border-line bg-surface border'
                  }`}
                >
                  <div className={`text-2xl font-bold ${active ? 'text-[var(--cat)]' : ''}`}>
                    {option.value}
                  </div>
                  <div className="text-fg-muted mt-1 text-[11px]">{t(option.labelKey)}</div>
                </button>
              )
            })}
          </div>

          <div className="mt-[30px]">
            <SectionLabel>{t('onboarding.reminders')}</SectionLabel>
          </div>

          <ReminderToggle
            icon={<BellIcon />}
            title={t('onboarding.reminder.morning')}
            subtitle={t('onboarding.reminder.morningSub')}
            checked={morningReminder}
            onChange={setMorningReminder}
            category={categories[0] ?? 'physical'}
          />
          <ReminderToggle
            icon={<ClockIcon />}
            title={t('onboarding.reminder.evening')}
            subtitle={t('onboarding.reminder.eveningSub')}
            checked={eveningReminder}
            onChange={setEveningReminder}
            category={categories[0] ?? 'physical'}
          />

          <PrimaryButton className="mt-auto" onClick={() => setStep(2)}>
            {t('onboarding.step2.cta')}
          </PrimaryButton>
        </>
      ) : (
        <>
          <div className="mt-[30px]">
            <h1 className="text-2xl leading-[1.25] font-bold">{t('onboarding.step3.title')}</h1>
            <p className="text-fg-muted mt-2 text-sm leading-relaxed">
              {t('onboarding.step3.sub')}
            </p>
          </div>

          <div className="mt-[26px] flex flex-col gap-[11px]">
            {LEVELS.map((option) => (
              <LevelChoice
                key={option.value}
                title={t(option.labelKey)}
                subtitle={t(option.subKey)}
                selected={level === option.value}
                category={categories[0] ?? 'physical'}
                onSelect={() => setLevel(option.value)}
              />
            ))}
          </div>

          <PrimaryButton className="mt-auto" onClick={() => void finish(false)} disabled={saving}>
            {t('onboarding.step3.cta')}
          </PrimaryButton>
        </>
      )}
    </main>
  )
}

function CategoryChoice({
  category,
  selected,
  onToggle,
}: {
  category: Category
  selected: boolean
  onToggle: () => void
}) {
  const { t } = useI18n()
  const meta = CATEGORY_META[category]
  const Icon = meta.icon

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      style={categoryStyle(category)}
      className={`flex items-center gap-[13px] rounded-[16px] p-[15px] text-start ${
        selected
          ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_9%,var(--color-surface))]'
          : 'border-line bg-surface border'
      }`}
    >
      <div
        className="flex size-10 flex-none items-center justify-center rounded-xl text-[var(--cat)]"
        style={{
          background: `color-mix(in oklch, var(--cat) ${selected ? 18 : 15}%, var(--pisga-card))`,
        }}
      >
        <Icon size={22} />
      </div>

      <div className="flex-1">
        <div className="text-base font-semibold">{t(meta.labelKey)}</div>
        <div className="text-fg-muted mt-0.5 text-xs">{t(meta.blurbKey)}</div>
      </div>

      <div
        className={`flex size-6 flex-none items-center justify-center rounded-full ${
          selected ? 'text-on-brand bg-[var(--cat)]' : 'border-line border-[1.6px]'
        }`}
      >
        {selected ? <CheckIcon size={14} /> : null}
      </div>
    </button>
  )
}

function LevelChoice({
  title,
  subtitle,
  selected,
  category,
  onSelect,
}: {
  title: string
  subtitle: string
  selected: boolean
  category: Category
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={categoryStyle(category)}
      className={`flex items-center gap-[13px] rounded-[16px] p-[15px] text-start ${
        selected
          ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_9%,var(--color-surface))]'
          : 'border-line bg-surface border'
      }`}
    >
      <div className="flex-1">
        <div className="text-base font-semibold">{title}</div>
        <div className="text-fg-muted mt-0.5 text-xs">{subtitle}</div>
      </div>
      <div
        className={`flex size-6 flex-none items-center justify-center rounded-full ${
          selected ? 'text-on-brand bg-[var(--cat)]' : 'border-line border-[1.6px]'
        }`}
      >
        {selected ? <CheckIcon size={14} /> : null}
      </div>
    </button>
  )
}

function ReminderToggle({
  icon,
  title,
  subtitle,
  checked,
  onChange,
  category,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  checked: boolean
  onChange: (next: boolean) => void
  category: Category
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={categoryStyle(category)}
      className="border-line bg-surface mt-[11px] flex items-center justify-between rounded-[16px] border px-[17px] py-4 text-start"
    >
      <span className="flex items-center gap-3">
        <span className="text-fg-muted">{icon}</span>
        <span>
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="text-fg-muted mt-0.5 block text-xs">{subtitle}</span>
        </span>
      </span>

      <span
        className={`relative h-[27px] w-[46px] flex-none rounded-full transition-colors ${
          checked ? 'bg-[var(--cat)]' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-[3px] size-[21px] rounded-full transition-all ${
            checked ? 'bg-bg end-[3px]' : 'bg-fg-muted start-[3px]'
          }`}
        />
      </span>
    </button>
  )
}
