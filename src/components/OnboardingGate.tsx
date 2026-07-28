import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useProfile } from '@/providers/useProfile'
import { useI18n } from '@/i18n/useI18n'
import { FullPageSpinner } from './Spinner'

/**
 * Sends a signed-in user through the opening questionnaire once (PRD 6.2).
 * Skipping still marks it finished, so this never traps anyone in a loop.
 */
export function OnboardingGate() {
  const { profile, loading } = useProfile()
  const { t } = useI18n()
  const location = useLocation()

  if (loading) return <FullPageSpinner label={t('common.loading')} />

  // A missing profile means the trigger has not caught up yet; let the app
  // render rather than bouncing the user to onboarding on a transient miss.
  if (profile && !profile.onboarded_at && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
