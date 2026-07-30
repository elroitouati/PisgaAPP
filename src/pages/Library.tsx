import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { createCustomGoal, fetchLibrary, fetchTrackedGoals } from '@/lib/api'
import { CATEGORIES, CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { todayKey } from '@/lib/dates'
import { BackIcon, CheckIcon, PlusIcon } from '@/components/icons'
import { Card, CategoryTile, ErrorState, PrimaryButton, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import type { LibraryGoal } from '@/types/db'

/**
 * PRD 6.3/6.4 — browse the built-in library and add goals from it, or write a
 * personal one. Adapted from design 4a, which draws this as a bottom sheet.
 */
export default function Library() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState<Category>('physical')
  // The calendar timeline's empty-state CTA lands here with the deadline form
  // already open. Everything else now goes to the builder at /goal/new — the
  // inline form is kept only because it is the one place a target date can be
  // set, which the builder has no concept of.
  const [params] = useSearchParams()
  const [showCustom, setShowCustom] = useState(params.get('new') === '1')
  const defaultLongTerm = params.get('longTerm') === '1'

  const library = useAsync<LibraryGoal[]>(() => fetchLibrary(), [])
  const mine = useAsync(
    () => (user ? fetchTrackedGoals(user.id) : Promise.resolve([])),
    [user?.id],
  )

  const alreadyAdded = useMemo(
    () => new Set((mine.data ?? []).map((goal) => goal.library_id).filter(Boolean)),
    [mine.data],
  )

  const shown = (library.data ?? []).filter((goal) => goal.category === tab)

  return (
    <>
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="text-fg-muted flex size-[34px] items-center justify-center"
          aria-label={t('common.back')}
        >
          <BackIcon />
        </button>
        <h1 className="text-xl font-bold">{t('nav.add')}</h1>
      </header>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((category) => {
          const active = tab === category
          return (
            <button
              key={category}
              type="button"
              onClick={() => setTab(category)}
              aria-pressed={active}
              style={categoryStyle(category)}
              className={`flex-none rounded-full px-3.5 py-1.5 text-[13px] font-medium ${
                active
                  ? 'border-[1.4px] border-[var(--cat)] text-[var(--cat)]'
                  : 'border-line text-fg-muted border'
              }`}
            >
              {t(CATEGORY_META[category].labelKey)}
            </button>
          )
        })}
      </div>

      <div className="mt-4.5 mb-2.5">
        <SectionLabel>{t('cat.structured')}</SectionLabel>
      </div>

      {library.loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : library.error ? (
        <ErrorState onRetry={library.reload} />
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((goal) => {
            const added = alreadyAdded.has(goal.id)
            return (
              <Card key={goal.id} className="flex items-center gap-3 px-3.5 py-[13px]">
                <CategoryTile category={goal.category} size={34} iconSize={18} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-semibold">
                    {lang === 'he' ? goal.title_he : goal.title_en}
                  </div>
                  <div className="text-fg-muted mt-0.5 text-xs">
                    {(lang === 'he' ? goal.description_he : goal.description_en) ??
                      goal.suggested_frequency}
                  </div>
                </div>
                {/* Adding is a two-screen act now: a structured goal without a
                    calibrated opening level would sit outside the scoring
                    engine entirely, so the ＋ opens S2 rather than inserting. */}
                <button
                  type="button"
                  onClick={() => navigate(`/library/${goal.id}/calibrate`)}
                  disabled={added}
                  aria-label={t('nav.add')}
                  style={categoryStyle(goal.category)}
                  className={`flex size-7 flex-none items-center justify-center rounded-full ${
                    added
                      ? 'bg-[var(--cat)] text-on-cat'
                      : 'border-line text-fg-muted border disabled:opacity-50'
                  }`}
                >
                  {added ? <CheckIcon size={15} /> : <PlusIcon size={16} />}
                </button>
              </Card>
            )
          })}
        </div>
      )}

      <div className="mt-6 mb-2.5">
        <SectionLabel>{t('cat.personal')}</SectionLabel>
      </div>

      {showCustom ? (
        <CustomGoalForm
          category={tab}
          defaultLongTerm={defaultLongTerm}
          onCancel={() => setShowCustom(false)}
          onCreated={() => {
            setShowCustom(false)
            mine.reload()
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => navigate('/goal/new')}
          className="border-line text-fg-muted flex items-center justify-center gap-2 rounded-[14px] border border-dashed px-4 py-4 text-[13px]"
        >
          <PlusIcon size={18} />
          {t('nav.add')}
        </button>
      )}
    </>
  )
}

function CustomGoalForm({
  category,
  defaultLongTerm = false,
  onCancel,
  onCreated,
}: {
  category: Category
  defaultLongTerm?: boolean
  onCancel: () => void
  onCreated: () => void
}) {
  const { t } = useI18n()
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [longTerm, setLongTerm] = useState(defaultLongTerm)
  const [targetDate, setTargetDate] = useState('')
  const [saving, setSaving] = useState(false)

  const ready = title.trim() !== '' && (!longTerm || targetDate !== '')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!user || !ready) return
    setSaving(true)
    try {
      await createCustomGoal(user.id, {
        title: title.trim(),
        description: description.trim() || null,
        category,
        goal_type: longTerm ? 'deadline' : 'daily',
        // PRD 6.4: checkbox + reflection is the default for personal goals.
        verification: 'checkbox_reflection',
        target_date: longTerm ? targetDate : null,
      })
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="border-line bg-surface flex flex-col gap-3 rounded-[16px] border p-4">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('auth.namePlaceholder')}
        className="border-line bg-bg focus:border-fg rounded-xl border px-3 py-2.5 text-sm outline-none"
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder={t('verify.reflection.placeholder')}
        rows={2}
        className="border-line bg-bg focus:border-fg resize-none rounded-xl border px-3 py-2.5 text-sm outline-none"
      />
      <button
        type="button"
        role="switch"
        aria-checked={longTerm}
        onClick={() => setLongTerm((prev) => !prev)}
        className="flex items-center justify-between text-start"
      >
        <span className="text-fg-muted text-xs font-medium">{t('goals.longTerm')}</span>
        <span
          className={`relative h-[24px] w-[42px] flex-none rounded-full transition-colors ${
            longTerm ? 'bg-fg' : 'bg-line'
          }`}
        >
          <span
            className={`absolute top-[3px] size-[18px] rounded-full transition-all ${
              longTerm ? 'bg-bg end-[3px]' : 'bg-fg-muted start-[3px]'
            }`}
          />
        </span>
      </button>
      {longTerm ? (
        <input
          type="date"
          value={targetDate}
          onChange={(event) => setTargetDate(event.target.value)}
          min={todayKey()}
          className="border-line bg-bg focus:border-fg rounded-xl border px-3 py-2.5 text-sm outline-none"
        />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="border-line text-fg-muted flex-1 rounded-xl border py-2.5 text-sm"
        >
          {t('common.cancel')}
        </button>
        <PrimaryButton type="submit" disabled={saving || !ready} className="h-11 flex-1">
          {t('common.save')}
        </PrimaryButton>
      </div>
    </form>
  )
}
