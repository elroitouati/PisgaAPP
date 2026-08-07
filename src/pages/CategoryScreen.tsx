import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useTrackedGoals } from '@/hooks/useGoals'
import { CATEGORIES, CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { useMonthlyPoints } from '@/hooks/usePoints'
import { BackIcon, SummitIcon } from '@/components/icons'
import { Card, CategoryTile, EmptyState, ErrorState, SectionLabel } from '@/components/ui'
import { GoalRow } from '@/components/GoalRow'
import { Spinner } from '@/components/Spinner'

/**
 * Design 5b. The structured/personal split (PRD 3.1) is the screen's spine:
 * the two groups are separated visually and labelled with whether they count
 * toward ranking.
 */
export default function CategoryScreen() {
  const { category } = useParams<{ category: string }>()
  const { t } = useI18n()
  const navigate = useNavigate()
  const { goals, loading, error, reload, complete, undo } = useTrackedGoals()
  const { points: monthlyPoints } = useMonthlyPoints(
    CATEGORIES.includes(category as Category) ? (category as Category) : undefined,
  )

  if (!CATEGORIES.includes(category as Category)) return <Navigate to="/404" replace />
  const key = category as Category
  const meta = CATEGORY_META[key]

  const inCategory = goals.filter((goal) => goal.category === key)
  const structured = inCategory.filter((goal) => !goal.is_custom)
  const personal = inCategory.filter((goal) => goal.is_custom)
  const done = inCategory.filter((goal) => goal.completedToday).length
  const ratio = inCategory.length === 0 ? 0 : done / inCategory.length
  const categoryStreak = inCategory.reduce((best, goal) => Math.max(best, goal.streak), 0)

  return (
    <div style={categoryStyle(key)}>
      <header className="flex items-center gap-3">
        <Link to="/" className="text-fg-muted flex size-[34px] items-center justify-center">
          <BackIcon />
        </Link>
        <CategoryTile category={key} />
        <h1 className="text-xl font-bold">{t(meta.labelKey)}</h1>
        <span className="text-fg-subtle ms-auto flex items-center gap-1.5 text-xs font-extrabold tracking-[0.16em]">
          <SummitIcon size={13} strokeWidth={2} />
          {t('app.wordmark')}
        </span>
      </header>

      <Card className="mt-4.5 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-fg-muted text-[13px]">{t('cat.progressToday')}</span>
          <span
            dir="ltr"
            className="text-[15px] font-bold text-[var(--cat)] [unicode-bidi:isolate]"
          >
            {done} / {inCategory.length}
          </span>
        </div>
        <div className="bg-line h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full bg-[var(--cat)] transition-[width]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>
        <div className="text-fg-muted mt-3.5 flex gap-4 text-[13px]">
          <span>
            <b className="text-fg font-semibold">{categoryStreak}</b> {t('cat.streakInCategory')}
          </span>
          <span>
            <b className="text-fg font-semibold">{monthlyPoints}</b>{' '}
            {t('cat.pointsThisMonth')}
          </span>
        </div>
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
          <Group
            label={t('cat.structured')}
            goals={structured}
            emptyLabel={t('cat.emptyStructured')}
            actionLabel={t('cat.addStructured')}
            onAction={() => navigate(`/library?category=${key}`)}
            onComplete={complete}
            onUndo={undo}
          />
          <Group
            label={t('cat.personal')}
            goals={personal}
            emptyLabel={t('cat.emptyPersonal')}
            actionLabel={t('cat.addPersonal')}
            onAction={() => navigate('/goal/new')}
            onComplete={complete}
            onUndo={undo}
          />
        </>
      )}
    </div>
  )
}

function Group({
  label,
  goals,
  emptyLabel,
  actionLabel,
  onAction,
  onComplete,
  onUndo,
}: {
  label: string
  goals: ReturnType<typeof useTrackedGoals>['goals']
  emptyLabel: string
  actionLabel: string
  onAction: () => void
  onComplete: (goalId: string, note?: string | null) => Promise<void>
  onUndo: (goalId: string) => Promise<void>
}) {
  return (
    <section className="mt-4.5">
      <div className="mb-2.5">
        <SectionLabel>{label}</SectionLabel>
      </div>
      {goals.length === 0 ? (
        <EmptyState actionLabel={actionLabel} onAction={onAction}>
          {emptyLabel}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {goals.map((goal) => (
            <GoalRow key={goal.id} goal={goal} onComplete={onComplete} onUndo={onUndo} />
          ))}
        </div>
      )}
    </section>
  )
}
