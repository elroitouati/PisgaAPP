import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import {
  fetchActiveChallenges,
  fetchManagedGoals,
  archiveGoal,
  unarchiveGoal,
  deleteGoal,
  type ActiveChallenge,
  type ManagedGoal,
} from '@/lib/api'
import { CATEGORIES, CATEGORY_META, categoryStyle } from '@/lib/categories'
import { todayKey } from '@/lib/dates'
import { BackIcon, ArchiveIcon, UnarchiveIcon, TrashIcon } from '@/components/icons'
import { ConfirmSheet, EmptyState, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'

type Tab = 'active' | 'archived'

/** Designs 8g (dark) / 8h (light). */
export default function MyGoals() {
  const { t } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('active')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<ManagedGoal | null>(null)

  const { data, loading, patch } = useAsync<ManagedGoal[]>(
    () => (user ? fetchManagedGoals(user.id, tab === 'active') : Promise.resolve([])),
    [user?.id, tab],
  )
  const goals = useMemo(() => data ?? [], [data])

  const { data: challengeData } = useAsync<ActiveChallenge[]>(
    () => (user && tab === 'active' ? fetchActiveChallenges(user.id) : Promise.resolve([])),
    [user?.id, tab],
  )
  const challenges = challengeData ?? []

  async function toggleArchive(goal: ManagedGoal) {
    setBusyId(goal.id)
    try {
      if (tab === 'active') {
        await archiveGoal(goal.id)
      } else {
        await unarchiveGoal(goal.id)
      }
      patch((current) => current.filter((candidate) => candidate.id !== goal.id))
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDeleteGoal() {
    if (!confirmDelete) return
    setBusyId(confirmDelete.id)
    try {
      await deleteGoal(confirmDelete.id)
      patch((current) => current.filter((candidate) => candidate.id !== confirmDelete.id))
      setConfirmDelete(null)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4.5 px-[22px] pt-14 pb-8"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon />
        </button>
        <h1 className="text-[19px] font-bold">{t('goals.title')}</h1>
      </header>

      <div className="border-line bg-surface flex flex-shrink-0 rounded-[14px] border p-1">
        {(['active', 'archived'] as Tab[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setTab(option)}
            aria-pressed={tab === option}
            className={`flex-1 rounded-[11px] py-2.5 text-center text-[13.5px] font-semibold ${
              tab === option ? 'bg-surface-raised' : 'text-fg-muted'
            }`}
          >
            {t(option === 'active' ? 'goals.active' : 'goals.archived')}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-7" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState>{t(tab === 'active' ? 'goals.emptyActive' : 'goals.emptyArchived')}</EmptyState>
      ) : (
        CATEGORIES.map((category) => {
          const inCategory = goals.filter((goal) => goal.category === category)
          if (inCategory.length === 0) return null
          return (
            <div key={category} className="flex-shrink-0">
              <div className="mb-2.5 flex items-center gap-1.5">
                <span
                  style={categoryStyle(category)}
                  className="size-[7px] rounded-full bg-[var(--cat)]"
                />
                <SectionLabel>{t(CATEGORY_META[category].labelKey)}</SectionLabel>
              </div>
              <div className="flex flex-col gap-2">
                {inCategory.map((goal) => (
                  <div
                    key={goal.id}
                    className="border-line bg-surface flex items-center gap-3 rounded-[14px] border px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold">{goal.title}</div>
                      <div className="text-fg-muted mt-0.5 text-[11.5px]">
                        {goal.streak} {t('goals.streak')} · {goal.completions} {t('goals.completions')} ·{' '}
                        {t('goals.added')} {shortDate(goal.added_at)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleArchive(goal)}
                      disabled={busyId === goal.id}
                      aria-label={t(tab === 'active' ? 'goals.archiveAction' : 'goals.unarchiveAction')}
                      className="text-fg-subtle flex-none disabled:opacity-50"
                    >
                      {busyId === goal.id ? (
                        <Spinner className="size-4" />
                      ) : tab === 'active' ? (
                        <ArchiveIcon size={18} />
                      ) : (
                        <UnarchiveIcon size={18} />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(goal)}
                      disabled={busyId === goal.id}
                      aria-label={t('goals.deleteAction')}
                      className="text-danger flex-none disabled:opacity-50"
                    >
                      <TrashIcon size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )
        })
      )}

      {challenges.length > 0 ? (
        <div className="flex-shrink-0">
          <div className="mb-2.5">
            <SectionLabel>{t('goals.activeChallenges')}</SectionLabel>
          </div>
          <div className="flex flex-col gap-2">
            {challenges.map((challenge) => (
              <div
                key={challenge.id}
                style={categoryStyle(challenge.category)}
                className="flex items-center gap-2.5 rounded-[14px] border border-[color-mix(in_oklch,var(--cat)_26%,var(--color-line))] bg-[color-mix(in_oklch,var(--cat)_8%,var(--color-surface))] px-3.5 py-3"
              >
                <div
                  style={{ background: 'color-mix(in oklch, var(--cat) 40%, var(--pisga-card))' }}
                  className="flex size-8 flex-none items-center justify-center rounded-full text-[13px] font-bold text-[var(--cat)]"
                >
                  {challenge.otherName.trim().charAt(0) || '?'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">
                    {challenge.title} · {challenge.otherName}
                  </div>
                  <div className="text-fg-muted mt-0.5 text-[11.5px]">
                    {t('goals.endsInPrefix')} {daysLeft(challenge.targetDate)} {t('goals.daysUnit')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {confirmDelete ? (
        <ConfirmSheet
          title={t('goals.deleteConfirmTitle')}
          body={t('goals.deleteConfirmBody').replace('{title}', confirmDelete.title)}
          confirmLabel={t('goals.deleteAction')}
          busy={busyId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => void confirmDeleteGoal()}
        />
      ) : null}
    </main>
  )
}

function daysLeft(targetDate: string) {
  const diff = Math.round(
    (new Date(targetDate).getTime() - new Date(todayKey()).getTime()) / 86_400_000,
  )
  return Math.max(0, diff)
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric' }).format(new Date(iso))
}
