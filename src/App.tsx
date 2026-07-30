import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { I18nProvider } from '@/i18n/I18nProvider'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { AuthProvider } from '@/providers/AuthProvider'
import { ProfileProvider } from '@/providers/ProfileProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { OnboardingGate } from '@/components/OnboardingGate'
import { AppShell } from '@/components/AppShell'
import { isSupabaseConfigured } from '@/lib/supabase'
import Login from '@/pages/Login'
import AuthCallback from '@/pages/AuthCallback'
import Onboarding from '@/pages/Onboarding'
import Home from '@/pages/Home'
import CategoryScreen from '@/pages/CategoryScreen'
import GuidedSession from '@/pages/GuidedSession'
import Library from '@/pages/Library'
import Achievements from '@/pages/Achievements'
import Calendar from '@/pages/Calendar'
import Friends from '@/pages/Friends'
import Chat from '@/pages/Chat'
import GroupManage from '@/pages/GroupManage'
import SharedGoal from '@/pages/SharedGoal'
import Profile from '@/pages/Profile'
import EditProfile from '@/pages/EditProfile'
import PrivacyData from '@/pages/PrivacyData'
import DeleteAccount from '@/pages/DeleteAccount'
import MyGoals from '@/pages/MyGoals'
import NotificationsScreen from '@/pages/NotificationsScreen'
import InviteFriend from '@/pages/InviteFriend'
import JoinInvite from '@/pages/JoinInvite'
import NotFound from '@/pages/NotFound'
import SetupRequired from '@/pages/SetupRequired'
import Calibrate from '@/pages/goals/Calibrate'
import GoalCard from '@/pages/goals/GoalCard'
import GoalProgress from '@/pages/goals/GoalProgress'
import Verify from '@/pages/goals/Verify'
import GoalBuilder from '@/pages/goals/GoalBuilder'
import WeeklySummary from '@/pages/goals/WeeklySummary'

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <I18nProvider>
        <ThemeProvider>
          <SetupRequired />
        </ThemeProvider>
      </I18nProvider>
    )
  }

  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <AuthProvider>
            <ProfileProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  {/* Has to render signed out too — a new visitor previews the
                      inviter before any auth happens. */}
                  <Route path="/join/:token" element={<JoinInvite />} />

                  <Route element={<ProtectedRoute />}>
                    <Route element={<OnboardingGate />}>
                      <Route path="/onboarding" element={<Onboarding />} />
                      {/* Full-screen, outside the shell — no bottom bar. */}
                      <Route path="/session/:goalId" element={<GuidedSession />} />
                      {/* Full height, own composer — outside the shell. */}
                      <Route path="/chat/:conversationId" element={<Chat />} />
                      <Route path="/chat/:conversationId/manage" element={<GroupManage />} />
                      <Route path="/shared-goal" element={<SharedGoal />} />
                      <Route path="/profile/edit" element={<EditProfile />} />
                      <Route path="/profile/privacy" element={<PrivacyData />} />
                      <Route path="/profile/delete" element={<DeleteAccount />} />
                      <Route path="/profile/goals" element={<MyGoals />} />
                      <Route path="/profile/notifications" element={<NotificationsScreen />} />
                      <Route path="/profile/invite" element={<InviteFriend />} />

                      {/* Structured goals (S1–S7 + VS1–VS8). All full-screen:
                          each one is a single task the user is in the middle
                          of, and a bottom bar invites them to abandon it. */}
                      <Route path="/library/:libraryId/calibrate" element={<Calibrate />} />
                      <Route path="/goal/new" element={<GoalBuilder />} />
                      <Route path="/goal/:userGoalId" element={<GoalCard />} />
                      <Route path="/goal/:userGoalId/verify" element={<Verify />} />
                      <Route path="/goal/:userGoalId/progress" element={<GoalProgress />} />
                      <Route path="/weekly" element={<WeeklySummary />} />

                      <Route element={<AppShell />}>
                        <Route path="/" element={<Home />} />
                        <Route path="/category/:category" element={<CategoryScreen />} />
                        <Route path="/library" element={<Library />} />
                        <Route path="/achievements" element={<Achievements />} />
                        <Route path="/calendar" element={<Calendar />} />
                        <Route path="/friends" element={<Friends />} />
                        <Route path="/profile" element={<Profile />} />
                      </Route>
                    </Route>
                  </Route>

                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </BrowserRouter>
            </ProfileProvider>
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}
