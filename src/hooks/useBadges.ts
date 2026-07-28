import { useMemo } from 'react'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from './useAsync'
import { fetchBadges } from '@/lib/api'
import type { EarnedBadge } from '@/types/db'

export function useBadges() {
  const { user } = useAuth()

  const { data, loading, error, reload } = useAsync<EarnedBadge[]>(
    () => (user ? fetchBadges(user.id) : Promise.resolve([])),
    [user?.id],
  )

  const badges = useMemo(() => data ?? [], [data])
  const earned = useMemo(() => badges.filter((badge) => badge.earnedAt), [badges])

  return { badges, earned, loading, error, reload }
}
