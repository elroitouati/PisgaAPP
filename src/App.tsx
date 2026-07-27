import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { AuthProvider } from '@/providers/AuthProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { isSupabaseConfigured } from '@/lib/supabase'
import Login from '@/pages/Login'
import AuthCallback from '@/pages/AuthCallback'
import Home from '@/pages/Home'
import NotFound from '@/pages/NotFound'
import SetupRequired from '@/pages/SetupRequired'

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          {isSupabaseConfigured ? (
            <AuthProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<Home />} />
                  </Route>
                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </BrowserRouter>
            </AuthProvider>
          ) : (
            <SetupRequired />
          )}
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}
