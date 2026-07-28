import { useAuth } from '@/providers/useAuth'
import { useAsync } from './useAsync'
import { fetchMonthlyPoints, fetchTotalPoints } from '@/lib/api'
import type { Category } from '@/lib/categories'

/** Lifetime score — the figure the home stat strip shows. */
export function useTotalPoints() {
  const { user } = useAuth()
  const { data, loading } = useAsync<number>(
    () => (user ? fetchTotalPoints(user.id) : Promise.resolve(0)),
    [user?.id],
  )
  return { points: data ?? 0, loading }
}

/** This calendar month, scoped to a category — the category screen's figure. */
export function useMonthlyPoints(category?: Category) {
  const { user } = useAuth()
  const { data, loading } = useAsync<number>(
    () => (user ? fetchMonthlyPoints(user.id, category) : Promise.resolve(0)),
    [user?.id, category],
  )
  return { points: data ?? 0, loading }
}
