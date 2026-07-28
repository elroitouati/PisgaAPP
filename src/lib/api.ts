import { supabase } from './supabase'
import { todayKey, yesterdayKey } from './dates'
import type {
  Badge,
  EarnedBadge,
  GoalCompletion,
  LibraryGoal,
  Profile,
  TrackedGoal,
  UserGoal,
} from '@/types/db'
import type { Category } from './categories'

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

// ── Profile ──────────────────────────────────────────────────────────────────

export async function fetchProfile(userId: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single())
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select('*').single(),
  )
}

// ── Onboarding (PRD 6.2) ─────────────────────────────────────────────────────

export async function saveOnboardingAnswers(
  userId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const rows = Object.entries(answers).map(([question_key, answer_value]) => ({
    user_id: userId,
    question_key,
    answer_value,
  }))
  const { error } = await supabase
    .from('onboarding_answers')
    .upsert(rows, { onConflict: 'user_id,question_key' })
  if (error) throw new Error(error.message)
}

export async function fetchOnboardingAnswers(userId: string) {
  const rows = unwrap(
    await supabase
      .from('onboarding_answers')
      .select('question_key, answer_value')
      .eq('user_id', userId),
  )
  return Object.fromEntries(rows.map((r) => [r.question_key, r.answer_value]))
}

/** Marks the questionnaire finished, whether it was answered or skipped. */
export async function markOnboarded(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new Error(error.message)
}

// ── Goal library (PRD 6.3) ───────────────────────────────────────────────────

export async function fetchLibrary(): Promise<LibraryGoal[]> {
  return unwrap(
    await supabase.from('goals_library').select('*').order('sort_order', { ascending: true }),
  )
}

/**
 * Copies a library goal into the user's own list (PRD 3.1: not custom).
 * `points` is deliberately not sent — a database trigger copies it from the
 * library so a client cannot name its own score.
 */
export async function adoptLibraryGoal(userId: string, goal: LibraryGoal): Promise<UserGoal> {
  return unwrap(
    await supabase
      .from('user_goals')
      .insert({
        user_id: userId,
        library_id: goal.id,
        is_custom: false,
        title: goal.title_he,
        description: goal.description_he,
        category: goal.category,
        goal_type: goal.goal_type,
        verification: goal.verification,
        session_config: goal.session_config,
      })
      .select('*')
      .single(),
  )
}

export async function createCustomGoal(
  userId: string,
  goal: {
    title: string
    description?: string | null
    category: Category
    goal_type: UserGoal['goal_type']
    verification: UserGoal['verification']
    target_date?: string | null
  },
): Promise<UserGoal> {
  return unwrap(
    await supabase
      .from('user_goals')
      .insert({ ...goal, user_id: userId, is_custom: true })
      .select('*')
      .single(),
  )
}

export async function archiveGoal(goalId: string): Promise<void> {
  const { error } = await supabase.from('user_goals').update({ active: false }).eq('id', goalId)
  if (error) throw new Error(error.message)
}

// ── Daily tracking ───────────────────────────────────────────────────────────

/**
 * Loads the user's active goals joined with the two completions that decide
 * today's state: today's (did they finish?) and yesterday's (is the streak
 * still alive?). Two days is all the home and category screens need.
 */
export async function fetchTrackedGoals(userId: string): Promise<TrackedGoal[]> {
  const today = todayKey()
  const yesterday = yesterdayKey()

  const goals = unwrap(
    await supabase
      .from('user_goals')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('added_at', { ascending: true }),
  ) as UserGoal[]

  if (goals.length === 0) return []

  const completions = unwrap(
    await supabase
      .from('goal_completions')
      .select('*')
      .in(
        'user_goal_id',
        goals.map((g) => g.id),
      )
      .in('completed_date', [today, yesterday]),
  ) as GoalCompletion[]

  const byGoal = new Map<string, { today?: GoalCompletion; yesterday?: GoalCompletion }>()
  for (const completion of completions) {
    const entry = byGoal.get(completion.user_goal_id) ?? {}
    if (completion.completed_date === today) entry.today = completion
    else entry.yesterday = completion
    byGoal.set(completion.user_goal_id, entry)
  }

  return goals.map((goal) => {
    const entry = byGoal.get(goal.id)
    return {
      ...goal,
      completedToday: Boolean(entry?.today),
      // Done today → today's stored streak. Otherwise the streak is still
      // alive only if yesterday was done; a gap means it has already reset.
      streak: entry?.today?.current_streak ?? entry?.yesterday?.current_streak ?? 0,
      todaysNote: entry?.today?.reflection_note ?? null,
    }
  })
}

/**
 * Marks a goal done for today. The streak is computed inside the database
 * (see record_goal_completion) so two devices cannot race to a wrong value.
 */
export async function completeGoal(
  userGoalId: string,
  reflectionNote?: string | null,
): Promise<GoalCompletion> {
  return unwrap(
    await supabase
      .rpc('record_goal_completion', {
        p_user_goal_id: userGoalId,
        p_reflection_note: reflectionNote ?? null,
      })
      .single(),
  )
}

export async function undoCompletion(userGoalId: string): Promise<void> {
  const { error } = await supabase
    .from('goal_completions')
    .delete()
    .eq('user_goal_id', userGoalId)
    .eq('completed_date', todayKey())
  if (error) throw new Error(error.message)
}

// ── Badges (PRD 6.6) ─────────────────────────────────────────────────────────

/**
 * The whole catalogue plus which of them this user has earned. Locked badges
 * are shown too (design 5d), so the list is never filtered server-side.
 */
export async function fetchBadges(userId: string): Promise<EarnedBadge[]> {
  const [catalogue, earned] = await Promise.all([
    supabase.from('badges').select('*').order('sort_order', { ascending: true }),
    supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', userId),
  ])

  const all = unwrap(catalogue) as Badge[]
  const mine = new Map(
    (unwrap(earned) as { badge_id: string; earned_at: string }[]).map((row) => [
      row.badge_id,
      row.earned_at,
    ]),
  )

  return all.map((badge) => ({ ...badge, earnedAt: mine.get(badge.id) ?? null }))
}

/** Marks a deadline or long-term goal finished (PRD 4). */
export async function finishGoal(userGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('finish_goal', { p_user_goal_id: userGoalId })
  if (error) throw new Error(error.message)
}

/** Lifetime score, summed in the database (see total_points). */
export async function fetchTotalPoints(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('total_points', { p_user_id: userId })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}

/** Points earned this calendar month, optionally scoped to one category. */
export async function fetchMonthlyPoints(userId: string, category?: Category): Promise<number> {
  const { data, error } = await supabase.rpc('points_this_month', {
    p_user_id: userId,
    p_category: category ?? null,
  })
  if (error) throw new Error(error.message)
  return (data as number) ?? 0
}
