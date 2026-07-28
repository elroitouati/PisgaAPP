import { useCallback, useMemo } from 'react'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from './useAsync'
import { completeGoal, fetchTrackedGoals, undoCompletion } from '@/lib/api'
import { CATEGORIES, type Category } from '@/lib/categories'
import type { TrackedGoal } from '@/types/db'

export type CategorySummary = {
  category: Category
  total: number
  done: number
  ratio: number
}

/**
 * Today's goals, plus the per-category roll-up the home screen renders.
 * Completing a goal patches local state from the row the database returns, so
 * the checkbox settles immediately without a refetch.
 */
export function useTrackedGoals() {
  const { user } = useAuth()
  const userId = user?.id

  const { data, loading, error, reload, patch } = useAsync<TrackedGoal[]>(
    () => (userId ? fetchTrackedGoals(userId) : Promise.resolve([])),
    [userId],
  )

  const goals = useMemo(() => data ?? [], [data])

  const complete = useCallback(
    async (goalId: string, reflectionNote?: string | null) => {
      const completion = await completeGoal(goalId, reflectionNote)
      patch((current) =>
        current.map((goal) =>
          goal.id === goalId
            ? {
                ...goal,
                completedToday: true,
                streak: completion.current_streak,
                todaysNote: completion.reflection_note,
              }
            : goal,
        ),
      )
    },
    [patch],
  )

  const undo = useCallback(
    async (goalId: string) => {
      await undoCompletion(goalId)
      patch((current) =>
        current.map((goal) =>
          goal.id === goalId
            ? // The streak snapshot is gone with the row; today no longer counts.
              { ...goal, completedToday: false, streak: Math.max(0, goal.streak - 1), todaysNote: null }
            : goal,
        ),
      )
    },
    [patch],
  )

  const byCategory = useMemo<CategorySummary[]>(
    () =>
      CATEGORIES.map((category) => {
        const inCategory = goals.filter((goal) => goal.category === category)
        const done = inCategory.filter((goal) => goal.completedToday).length
        return {
          category,
          total: inCategory.length,
          done,
          ratio: inCategory.length === 0 ? 0 : done / inCategory.length,
        }
      }),
    [goals],
  )

  const pending = useMemo(() => goals.filter((goal) => !goal.completedToday).length, [goals])

  return { goals, byCategory, pending, loading, error, reload, complete, undo }
}
