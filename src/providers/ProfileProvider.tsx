import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from './useAuth'
import { fetchProfile, markOnboarded } from '@/lib/api'
import type { Profile } from '@/types/db'

type ProfileValue = {
  profile: Profile | null
  loading: boolean
  error: Error | null
  reload: () => void
  /** Records that the questionnaire is finished, answered or skipped. */
  finishOnboarding: () => Promise<void>
}

export const ProfileContext = createContext<ProfileValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const userId = user?.id

  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    fetchProfile(userId).then(
      (next) => {
        if (!active) return
        setProfile(next)
        setLoading(false)
      },
      (caught: Error) => {
        if (!active) return
        setError(caught)
        setLoading(false)
      },
    )

    return () => {
      active = false
    }
  }, [userId, nonce])

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  const finishOnboarding = useCallback(async () => {
    if (!userId) return
    await markOnboarded(userId)
    setProfile((prev) => (prev ? { ...prev, onboarded_at: new Date().toISOString() } : prev))
  }, [userId])

  const value = useMemo(
    () => ({ profile, loading, error, reload, finishOnboarding }),
    [profile, loading, error, reload, finishOnboarding],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}
