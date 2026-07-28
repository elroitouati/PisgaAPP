import type { Category } from '@/lib/categories'

/** Mirrors supabase/migrations/0001_initial_schema.sql. */

export type GoalType = 'daily' | 'deadline' | 'long_term'

/** PRD 5 — one verification method per goal, matched to the activity's shape. */
export type VerificationMethod =
  | 'guided_session'
  | 'sensor_sync'
  | 'daily_checkin'
  | 'checkbox_reflection'

export type AppLanguage = 'he' | 'en'
export type AppTheme = 'light' | 'dark' | 'system'
export type FriendshipStatus = 'pending' | 'accepted'
export type ShareStatus = 'pending' | 'accepted' | 'declined'

/** Parameters a verification method needs at run time (goals_library.session_config). */
export type SessionConfig = {
  /** guided_session */
  sets?: number
  reps?: number
  work_seconds?: number
  rest_seconds?: number
  /** sensor_sync */
  metric?: 'steps' | 'distance_km'
  target?: number
}

export type Profile = {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  language: AppLanguage
  theme: AppTheme
  onboarded_at: string | null
  created_at: string
}

export type LibraryGoal = {
  id: string
  slug: string
  title_he: string
  title_en: string
  description_he: string | null
  description_en: string | null
  category: Category
  goal_type: GoalType
  verification: VerificationMethod
  suggested_frequency: string | null
  session_config: SessionConfig
  /** What one completion of this goal is worth (PRD 6.7). */
  points: number
  sort_order: number
}

export type UserGoal = {
  id: string
  user_id: string
  library_id: string | null
  /** PRD 3.1 — custom goals stay out of points and ranking. */
  is_custom: boolean
  title: string
  description: string | null
  category: Category
  goal_type: GoalType
  verification: VerificationMethod
  session_config: SessionConfig
  target_date: string | null
  /** Copied from the library at adoption; always 0 for a custom goal. */
  points: number
  /** Set when a deadline or long-term goal is finished. */
  completed_at: string | null
  active: boolean
  added_at: string
}

export type GoalCompletion = {
  id: string
  user_goal_id: string
  completed_date: string
  current_streak: number
  reflection_note: string | null
  created_at: string
}

export type GoalMilestone = {
  id: string
  user_goal_id: string
  milestone_date: string
  description: string
  completed: boolean
  completed_at: string | null
}

/** A goal joined with today's completion — what every tracking screen renders. */
export type TrackedGoal = UserGoal & {
  completedToday: boolean
  /** Consecutive days up to and including today, 0 when the streak is broken. */
  streak: number
  todaysNote: string | null
}

/** Icon key stored on a badge, resolved to a component in the achievements UI. */
export type BadgeIcon = 'summit' | 'check' | 'flame' | 'target' | 'activity' | 'friends'

export type Badge = {
  id: string
  slug: string
  title_he: string
  title_en: string
  description_he: string | null
  description_en: string | null
  icon: BadgeIcon
  /** Category whose colour tints the badge, or null for a neutral one. */
  accent: Category | null
  sort_order: number
}

export type EarnedBadge = Badge & { earnedAt: string | null }
