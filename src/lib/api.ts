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
import { CATEGORIES, type Category } from './categories'

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
export async function adoptLibraryGoal(
  userId: string,
  goal: LibraryGoal,
  /** A shared challenge adopts the same goal but with an end date. */
  overrides?: { goalType?: UserGoal['goal_type']; targetDate?: string },
): Promise<UserGoal> {
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
        goal_type: overrides?.goalType ?? goal.goal_type,
        verification: goal.verification,
        session_config: goal.session_config,
        target_date: overrides?.targetDate ?? null,
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
      // Section 1 of the goals library: a personal goal earns bonus points but
      // never enters the shared ranking. Set at insert rather than patched
      // afterwards, so a failed second call cannot leave a ranked personal goal.
      .insert({ ...goal, user_id: userId, is_custom: true, counts_for_ranking: false })
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

// ── Calendar (design 6a / 6b) ────────────────────────────────────────────────

export type CalendarDay = {
  /** Local date key, YYYY-MM-DD. */
  date: string
  /** Distinct categories completed that day, in CATEGORIES order. */
  categories: Category[]
  entries: { goalId: string; title: string; category: Category; points: number; isCustom: boolean }[]
}

/**
 * Every completion in one calendar month, grouped by day. The calendar needs
 * the whole month at once, so this is a separate query from the two-day window
 * the tracking screens use.
 */
export async function fetchMonth(userId: string, year: number, month: number) {
  const first = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const nextMonth = month === 11 ? `${year + 1}-01-01` : `${year}-${String(month + 2).padStart(2, '0')}-01`

  const goals = unwrap(
    await supabase.from('user_goals').select('*').eq('user_id', userId),
  ) as UserGoal[]

  if (goals.length === 0) return new Map<string, CalendarDay>()

  const completions = unwrap(
    await supabase
      .from('goal_completions')
      .select('user_goal_id, completed_date')
      .in('user_goal_id', goals.map((g) => g.id))
      .gte('completed_date', first)
      .lt('completed_date', nextMonth),
  ) as { user_goal_id: string; completed_date: string }[]

  const byId = new Map(goals.map((goal) => [goal.id, goal]))
  const days = new Map<string, CalendarDay>()

  for (const completion of completions) {
    const goal = byId.get(completion.user_goal_id)
    if (!goal) continue

    const day = days.get(completion.completed_date) ?? {
      date: completion.completed_date,
      categories: [],
      entries: [],
    }
    if (!day.categories.includes(goal.category)) day.categories.push(goal.category)
    day.entries.push({
      goalId: goal.id,
      title: goal.title,
      category: goal.category,
      points: goal.points,
      isCustom: goal.is_custom,
    })
    days.set(completion.completed_date, day)
  }

  // Keep the dot order stable so a day's dots don't reshuffle between renders.
  for (const day of days.values()) {
    day.categories.sort((a, b) => CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b))
  }

  return days
}

// ── Calendar timeline (PRD 6.5, design 10a-10d) ─────────────────────────────

export type TimelineGoal = {
  id: string
  title: string
  category: Category
  addedAt: string
  targetDate: string
  /** Fraction of the way from added_at to target_date, clamped to [0, 1]. */
  progress: number
  daysLeft: number
  /**
   * Five checkpoints evenly spaced across the goal's whole span (including
   * the start and target dates themselves). There is no user-facing concept
   * of an individual milestone anywhere in the app yet — no way to name one,
   * no way to tap one done — so rather than half-build that, this treats
   * "milestone" purely as a time-based reading of progress. `goal_milestones`
   * (schema, unused) is a real per-milestone table for if that ever changes.
   */
  checkpointsReached: number
  checkpointsTotal: number
}

const TIMELINE_CHECKPOINTS = 5

/**
 * Active goals with a target date — the "long-term" tab of the calendar.
 * Ordered by nearest deadline first, matching the design.
 */
export async function fetchLongTermGoals(userId: string): Promise<TimelineGoal[]> {
  const goals = unwrap(
    await supabase
      .from('user_goals')
      .select('id, title, category, added_at, target_date')
      .eq('user_id', userId)
      .eq('active', true)
      .in('goal_type', ['deadline', 'long_term'])
      .not('target_date', 'is', null)
      .order('target_date', { ascending: true }),
  ) as { id: string; title: string; category: Category; added_at: string; target_date: string }[]

  const now = Date.now()

  return goals.map((goal) => {
    const start = new Date(goal.added_at).getTime()
    const target = new Date(goal.target_date).getTime()
    const span = Math.max(target - start, 1)
    const progress = Math.min(1, Math.max(0, (now - start) / span))
    const daysLeft = Math.max(0, Math.ceil((target - now) / 86_400_000))
    // A checkpoint counts as reached only once progress has actually passed
    // it — floor, not round, or a goal at 40% would falsely show its 50%
    // checkpoint as already hit.
    const checkpointsReached = Math.floor(progress * (TIMELINE_CHECKPOINTS - 1)) + 1

    return {
      id: goal.id,
      title: goal.title,
      category: goal.category,
      addedAt: goal.added_at,
      targetDate: goal.target_date,
      progress,
      daysLeft,
      checkpointsReached: Math.min(TIMELINE_CHECKPOINTS, checkpointsReached),
      checkpointsTotal: TIMELINE_CHECKPOINTS,
    }
  })
}

// ── Friends (PRD 6.7, design 5e / 2e) ────────────────────────────────────────

export type FriendProgress = {
  id: string
  displayName: string
  avatarUrl: string | null
  doneToday: number
  totalToday: number
  streak: number
  categories: Category[]
  /** Became friends in the last 48h — surfaces an unfamiliar join (PRD follow-up
   *  to the permanent, auto-accept invite link: a stranger with the link
   *  becomes a friend immediately, so a fresh join is worth calling out). */
  recentlyJoined: boolean
}

const RECENTLY_JOINED_MS = 48 * 60 * 60 * 1000

/**
 * Accepted friends with today's progress. RLS already limits this to people
 * the caller is actually friends with, so the query does not re-check it.
 */
export async function fetchFriends(userId: string): Promise<FriendProgress[]> {
  const links = unwrap(
    await supabase
      .from('friendships')
      .select('user_id, friend_id, responded_at')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},friend_id.eq.${userId}`),
  ) as { user_id: string; friend_id: string; responded_at: string | null }[]

  const friendIds = links.map((link) => (link.user_id === userId ? link.friend_id : link.user_id))
  if (friendIds.length === 0) return []

  const respondedAt = new Map(
    links.map((link) => [link.user_id === userId ? link.friend_id : link.user_id, link.responded_at]),
  )

  const [profiles, goals] = await Promise.all([
    supabase.from('profiles').select('id, display_name, avatar_url').in('id', friendIds),
    supabase.from('user_goals').select('id, user_id, category').in('user_id', friendIds).eq('active', true),
  ])

  const people = unwrap(profiles) as { id: string; display_name: string | null; avatar_url: string | null }[]
  const theirGoals = unwrap(goals) as { id: string; user_id: string; category: Category }[]

  const completions =
    theirGoals.length === 0
      ? []
      : (unwrap(
          await supabase
            .from('goal_completions')
            .select('user_goal_id, current_streak')
            .in('user_goal_id', theirGoals.map((g) => g.id))
            .eq('completed_date', todayKey()),
        ) as { user_goal_id: string; current_streak: number }[])

  const doneIds = new Map(completions.map((c) => [c.user_goal_id, c.current_streak]))

  return people.map((person) => {
    const mine = theirGoals.filter((goal) => goal.user_id === person.id)
    const done = mine.filter((goal) => doneIds.has(goal.id))
    const joinedAt = respondedAt.get(person.id)
    return {
      id: person.id,
      displayName: person.display_name ?? '',
      avatarUrl: person.avatar_url,
      doneToday: done.length,
      totalToday: mine.length,
      streak: done.reduce((best, goal) => Math.max(best, doneIds.get(goal.id) ?? 0), 0),
      categories: CATEGORIES.filter((category) =>
        done.some((goal) => goal.category === category),
      ),
      recentlyJoined: Boolean(
        joinedAt && Date.now() - new Date(joinedAt).getTime() < RECENTLY_JOINED_MS,
      ),
    }
  })
}

/** Sends a friend request. The addressee accepts it on their side. */
export async function requestFriendship(userId: string, friendId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .insert({ user_id: userId, friend_id: friendId })
  if (error) throw new Error(error.message)
}

export async function respondToFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = accept
    ? await supabase
        .from('friendships')
        .update({ status: 'accepted', responded_at: new Date().toISOString() })
        .eq('id', friendshipId)
    : await supabase.from('friendships').delete().eq('id', friendshipId)
  if (error) throw new Error(error.message)
}

/** Shares one of my goals with a friend (design 4b). */
export async function shareGoal(userGoalId: string, friendId: string): Promise<void> {
  const { error } = await supabase
    .from('goal_shares')
    .insert({ user_goal_id: userGoalId, shared_with_user_id: friendId })
  if (error) throw new Error(error.message)
}

/**
 * Library goals to suggest to this user: the categories they picked in
 * onboarding, minus anything they already have. Falls back to the whole
 * library when the questionnaire was skipped, so the list is never empty for
 * the wrong reason.
 *
 * This is what makes the questionnaire pay off — without it a new user answers
 * three questions and lands on an empty home screen.
 */
export async function fetchSuggestions(userId: string, limit = 6): Promise<LibraryGoal[]> {
  const [answers, library, mine] = await Promise.all([
    fetchOnboardingAnswers(userId),
    fetchLibrary(),
    supabase.from('user_goals').select('library_id').eq('user_id', userId).eq('active', true),
  ])

  const adopted = new Set(
    ((unwrap(mine) as { library_id: string | null }[]) ?? [])
      .map((row) => row.library_id)
      .filter(Boolean),
  )

  const focus = Array.isArray(answers.focus_categories)
    ? (answers.focus_categories as Category[])
    : []

  const available = library.filter((goal) => !adopted.has(goal.id))
  const preferred = focus.length > 0
    ? available.filter((goal) => focus.includes(goal.category))
    : available

  // One from each chosen category first, so the suggestions look deliberate
  // rather than like the top of an alphabetical list.
  const spread: LibraryGoal[] = []
  const seen = new Set<string>()
  for (const category of focus.length > 0 ? focus : CATEGORIES) {
    const pick = preferred.find((goal) => goal.category === category && !seen.has(goal.id))
    if (pick) {
      spread.push(pick)
      seen.add(pick.id)
    }
  }
  for (const goal of preferred) {
    if (spread.length >= limit) break
    if (!seen.has(goal.id)) {
      spread.push(goal)
      seen.add(goal.id)
    }
  }

  return spread.slice(0, limit)
}

// ── Invite links (PRD decision: permanent, revocable, auto-accept) ──────────

export type InviteCode = { id: string; token: string; created_at: string }

export async function fetchMyInviteCode(): Promise<InviteCode> {
  return unwrap(await supabase.rpc('my_invite_code').single())
}

export async function regenerateInviteCode(): Promise<InviteCode> {
  return unwrap(await supabase.rpc('regenerate_invite_code').single())
}

/** Redeems a link, returning the profile of the friend it came from. */
export async function redeemInvite(token: string): Promise<Profile> {
  return unwrap(await supabase.rpc('redeem_invite', { p_token: token }).single())
}

export type InvitePreview = { display_name: string | null; avatar_url: string | null }

/** Who is inviting you — callable while signed out (design 8o/8p). */
export async function fetchInvitePreview(token: string): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc('invite_preview', { p_token: token }).maybeSingle()
  if (error) throw new Error(error.message)
  return data as InvitePreview | null
}

// ── Avatar upload ─────────────────────────────────────────────────────────

/**
 * Uploads to `<user_id>/<timestamp>.<ext>` — the storage policies key off that
 * first path segment, and the timestamp avoids a stale CDN-cached URL after a
 * replacement photo.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, {
    contentType: file.type,
    upsert: true,
  })
  if (uploadError) throw new Error(uploadError.message)

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path)

  const updated = unwrap<{ avatar_url: string | null }>(
    await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId).select().single(),
  )
  return updated.avatar_url ?? publicUrl
}

export async function removeAvatar(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', userId)
  if (error) throw new Error(error.message)
}

// ── My goals (design 8g/8h) ──────────────────────────────────────────────

export type ManagedGoal = UserGoal & { streak: number; completions: number }

/** Every goal the user owns, active or archived, with lifetime stats. */
export async function fetchManagedGoals(userId: string, active: boolean): Promise<ManagedGoal[]> {
  const goals = unwrap(
    await supabase.from('user_goals').select('*').eq('user_id', userId).eq('active', active),
  ) as UserGoal[]

  if (goals.length === 0) return []

  const completions = unwrap(
    await supabase
      .from('goal_completions')
      .select('user_goal_id, current_streak')
      .in('user_goal_id', goals.map((g) => g.id))
      .order('completed_date', { ascending: false }),
  ) as { user_goal_id: string; current_streak: number }[]

  const latestStreak = new Map<string, number>()
  const totalCompletions = new Map<string, number>()
  for (const row of completions) {
    if (!latestStreak.has(row.user_goal_id)) latestStreak.set(row.user_goal_id, row.current_streak)
    totalCompletions.set(row.user_goal_id, (totalCompletions.get(row.user_goal_id) ?? 0) + 1)
  }

  return goals.map((goal) => ({
    ...goal,
    streak: latestStreak.get(goal.id) ?? 0,
    completions: totalCompletions.get(goal.id) ?? 0,
  }))
}

export async function unarchiveGoal(goalId: string): Promise<void> {
  const { error } = await supabase.rpc('unarchive_goal', { p_user_goal_id: goalId })
  if (error) throw new Error(error.message)
}

export type ActiveChallenge = {
  id: string
  title: string
  category: Category
  targetDate: string
  otherName: string
}

/**
 * Accepted, still-open shared challenges — mine or ones a friend shared with
 * me. Two flat queries rather than one embedded join, matching how
 * fetchConversations resolves names, since RLS already scopes each table to
 * what the caller may see.
 */
export async function fetchActiveChallenges(userId: string): Promise<ActiveChallenge[]> {
  const [owned, received] = await Promise.all([
    supabase
      .from('goal_shares')
      .select('shared_with_user_id, user_goals!inner(id, title, category, target_date, active, user_id)')
      .eq('status', 'accepted')
      .eq('user_goals.user_id', userId)
      .eq('user_goals.active', true)
      .not('user_goals.target_date', 'is', null),
    supabase
      .from('goal_shares')
      .select('user_goals!inner(id, title, category, target_date, active, user_id)')
      .eq('status', 'accepted')
      .eq('shared_with_user_id', userId)
      .eq('user_goals.active', true)
      .not('user_goals.target_date', 'is', null),
  ])

  type GoalRow = { id: string; title: string; category: Category; target_date: string; user_id: string }
  type OwnedRow = { shared_with_user_id: string; user_goals: GoalRow[] }
  type ReceivedRow = { user_goals: GoalRow[] }

  const ownedRows = unwrap(owned) as unknown as OwnedRow[]
  const receivedRows = unwrap(received) as unknown as ReceivedRow[]

  const otherIds = new Set([
    ...ownedRows.map((row) => row.shared_with_user_id),
    ...receivedRows.map((row) => row.user_goals[0]?.user_id).filter((id): id is string => Boolean(id)),
  ])
  const names = new Map<string, string>()
  if (otherIds.size > 0) {
    const people = unwrap(
      await supabase.from('profiles').select('id, display_name').in('id', [...otherIds]),
    ) as { id: string; display_name: string | null }[]
    for (const person of people) names.set(person.id, person.display_name ?? '')
  }

  const fromOwned = ownedRows
    .filter((row) => row.user_goals[0])
    .map((row) => ({
      id: row.user_goals[0].id,
      title: row.user_goals[0].title,
      category: row.user_goals[0].category,
      targetDate: row.user_goals[0].target_date,
      otherName: names.get(row.shared_with_user_id) ?? '',
    }))
  const fromReceived = receivedRows
    .filter((row) => row.user_goals[0])
    .map((row) => ({
      id: row.user_goals[0].id,
      title: row.user_goals[0].title,
      category: row.user_goals[0].category,
      targetDate: row.user_goals[0].target_date,
      otherName: names.get(row.user_goals[0].user_id) ?? '',
    }))

  return [...fromOwned, ...fromReceived]
}

// ── Privacy & data ───────────────────────────────────────────────────────

export type BlockedUser = { id: string; display_name: string | null }

export async function fetchBlockedUsers(userId: string): Promise<BlockedUser[]> {
  const rows = unwrap(
    await supabase.from('blocks').select('blocked_id').eq('blocker_id', userId),
  ) as { blocked_id: string }[]
  if (rows.length === 0) return []

  return unwrap(
    await supabase.from('profiles').select('id, display_name').in('id', rows.map((r) => r.blocked_id)),
  )
}

/**
 * Bundles everything the account owns into one JSON object for download
 * (design 8d "הורדת הנתונים שלי"). Reads only tables RLS already lets the
 * caller see as themself — no new access, just an export of it.
 */
export async function exportMyData(userId: string) {
  const [profile, goals, completions, badges, friendships] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('user_goals').select('*').eq('user_id', userId),
    supabase
      .from('goal_completions')
      .select('*, user_goals!inner(user_id)')
      .eq('user_goals.user_id', userId),
    supabase.from('user_badges').select('*, badges(*)').eq('user_id', userId),
    supabase.from('friendships').select('*').or(`user_id.eq.${userId},friend_id.eq.${userId}`),
  ])

  return {
    exported_at: new Date().toISOString(),
    profile: unwrap(profile),
    goals: unwrap(goals),
    completions: unwrap(completions),
    badges: unwrap(badges),
    friendships: unwrap(friendships),
  }
}

/**
 * Deletes everything the client is able to (see 0006_profile_features.sql).
 * The auth.users row itself needs the service-role key and is left for
 * finishAccountDeletion() — this does not sign the user out or finish it.
 */
export async function requestAccountDeletion(): Promise<void> {
  const { error } = await supabase.rpc('request_account_deletion')
  if (error) throw new Error(error.message)
}

/**
 * Calls the `delete-account` Edge Function to remove the auth.users row
 * itself — the one thing the client can never do with the anon key. Deleting
 * it cascades away everything requestAccountDeletion() didn't already wipe
 * (see the function's own comment for the cascade chain).
 */
export async function finishAccountDeletion(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account')
  if (error) throw new Error(error.message)
}

// ── Push notifications ──────────────────────────────────────────────────

/**
 * Records one browser/device subscription. Keyed by endpoint (unique per
 * registration), so re-subscribing the same browser updates the row instead
 * of duplicating it.
 */
export async function savePushSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw new Error(error.message)
}
