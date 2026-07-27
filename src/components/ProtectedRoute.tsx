import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/useAuth'
import { useI18n } from '@/i18n/useI18n'
import { FullPageSpinner } from './Spinner'

export function ProtectedRoute() {
  const { session, initializing } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  if (initializing) return <FullPageSpinner label={t('common.loading')} />

  if (!session) {
    // Remember where they were headed so sign-in can return them there.
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
