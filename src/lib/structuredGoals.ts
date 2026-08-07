import { supabase } from './supabase'
import type { Category } from './categories'

/**
 * The data layer for structured goals (Pisga_Goals_Library_v1.md).
 *
 * Every write that affects points goes through an RPC rather than a table
 * write: weekly_metrics and level_changes have no client write policy, and
 * the cooldowns, the personal record and the trust multipliers are all
 * resolved server-side. What the client is allowed to do is read, and ask.
 */

export type VerificationCode = 'V0' | 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7' | 'V8'
export type MetricDirection = 'up' | 'down'
export type CalibrationQuestionCode = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'Q5' | 'Q6' | 'Q7'
export type CustomWidget =
  | 'water_cups'
  | 'steps_ring'
  | 'gps_route'
  | 'sleep_bar'
  | 'savings_jar'
  | 'screen_time'

export type LibraryGoalRow = {
  id: string
  code: string
  title_he: string
  title_en: string
  description_he: string | null
  description_en: string | null
  category: Category
  subcategory: string | null
  metric_key: string
  metric_unit: string
  metric_direction: MetricDirection
  metric_ceiling: number | null
  base_points: number
  level_1_value: number
  level_1_weekly_value: number | null
  level_step: number
  verification_default: VerificationCode
  verification_allowed: VerificationCode[]
  calibration_questions: CalibrationQuestionCode[]
  custom_widget: CustomWidget | null
  measurement_window: 'week' | 'month'
  session_config: Record<string, number>
}

export type StructuredUserGoal = {
  id: string
  user_id: string
  library_id: string | null
  is_custom: boolean
  title: string
  category: Category
  verification_code: VerificationCode | null
  current_level_value: number | null
  personal_record_value: number | null
  level_changed_at: string | null
  target_frequency: number | null
  counts_for_ranking: boolean
  converted_from_goal_id: string | null
  converted_at: string | null
  added_at: string
  library: LibraryGoalRow | null
  // Only meaningful when `library` is null — a from-scratch personal goal
  // (S5) has nowhere else to keep the metric it was built with. Named with a
  // personal_ prefix, not reused from goals_library's own column names: see
  // the comment in 0016_personal_goal_metrics.sql for why that collision is
  // real and was already tested, not theoretical. effectiveMetric() below is
  // what every screen should read through rather than these directly.
  personal_metric_unit: string | null
  personal_metric_direction: MetricDirection | null
  personal_level_step: number | null
  personal_base_points: number
}

/**
 * The metric/level shape a screen actually renders with, regardless of
 * whether the goal came from the library, was converted from one, or was
 * built from scratch in S5.
 *
 * Every screen that used to reach for `goal.library!.metric_unit` (etc.)
 * should read this instead — that non-null assertion was exactly what made
 * a from-scratch personal goal spin forever, since `library` is genuinely
 * null for one and nothing ever throws to say so.
 */
export type EffectiveMetric = {
  metricUnit: string
  metricDirection: MetricDirection
  levelStep: number
  basePoints: number
}

export function effectiveMetric(goal: StructuredUserGoal): EffectiveMetric {
  if (goal.library) {
    return {
      metricUnit: goal.library.metric_unit,
      metricDirection: goal.library.metric_direction,
      levelStep: goal.library.level_step,
      basePoints: goal.library.base_points,
    }
  }
  return {
    metricUnit: goal.personal_metric_unit ?? 'פעמים',
    metricDirection: goal.personal_metric_direction ?? 'up',
    levelStep: goal.personal_level_step ?? 1,
    basePoints: goal.personal_base_points,
  }
}

/**
 * A library row when there is one, else a synthetic one built from the
 * goal's own personal_* columns — for VS screens (Verify.tsx), which were
 * written against `goal.library` as a hard requirement throughout and, like
 * GoalCard, would otherwise spin forever for a from-scratch personal goal.
 *
 * Filling in a full LibraryGoalRow rather than making every screen handle
 * `library: LibraryGoalRow | null` individually: those screens read a dozen
 * different library fields between them (session_config, metric_key,
 * verification_allowed, code, description_*...), and most already degrade
 * sensibly on missing/empty values (`session_config?.sets ?? 3` and
 * similar). One synthetic object is a smaller, more honest change than
 * threading optionality through every one of those call sites, and it keeps
 * the invariant "a VS screen can assume its library prop is real" true for
 * everyone downstream instead of almost everyone.
 */
export function effectiveLibrary(goal: StructuredUserGoal): LibraryGoalRow {
  if (goal.library) return goal.library

  const metric = effectiveMetric(goal)
  return {
    id: '',
    code: '',
    title_he: goal.title,
    title_en: goal.title,
    description_he: null,
    description_en: null,
    category: goal.category,
    subcategory: null,
    metric_key: '',
    metric_unit: metric.metricUnit,
    metric_direction: metric.metricDirection,
    metric_ceiling: null,
    base_points: metric.basePoints,
    level_1_value: goal.current_level_value ?? metric.levelStep,
    level_1_weekly_value: null,
    level_step: metric.levelStep,
    verification_default: goal.verification_code ?? 'V0',
    // No known alternatives for a from-scratch goal — VS2's fallback list is
    // simply empty for one, which is a real (if minor) gap: a personal V2
    // goal has no library row for my_health_goals() to find either, so
    // sensor sync for a personal goal is a known, unimplemented edge case,
    // not something this fallback is pretending to solve.
    verification_allowed: [],
    calibration_questions: [],
    custom_widget: null,
    measurement_window: 'week',
    session_config: {},
  }
}

export type WeeklyMetricsRow = {
  id: string
  user_goal_id: string
  week_start: string
  total_value: number
  baseline_value: number | null
  delta_pct: number | null
  level_multiplier: number
  counted_for_ranking: boolean
  execution_points: number
  improvement_points: number
  maintenance_points: number
  level_bonus_points: number
  total_points: number
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

/** The 14 fields of section 2 for every goal in the library, in display order. */
const LIBRARY_FIELDS =
  'id, code, title_he, title_en, description_he, description_en, category, subcategory,' +
  ' metric_key, metric_unit, metric_direction, metric_ceiling, base_points, level_1_value,' +
  ' level_1_weekly_value, level_step, verification_default, verification_allowed,' +
  ' calibration_questions, custom_widget, measurement_window, session_config'

export async function fetchStructuredLibrary(category?: Category): Promise<LibraryGoalRow[]> {
  const query = supabase
    .from('goals_library')
    .select(LIBRARY_FIELDS)
    .not('code', 'is', null)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  return unwrap(category ? await query.eq('category', category) : await query) as unknown as LibraryGoalRow[]
}

export async function fetchLibraryGoal(libraryId: string): Promise<LibraryGoalRow> {
  return unwrap(
    await supabase.from('goals_library').select(LIBRARY_FIELDS).eq('id', libraryId).single(),
  ) as unknown as LibraryGoalRow
}

const USER_GOAL_FIELDS =
  'id, user_id, library_id, is_custom, title, category, verification_code,' +
  ' current_level_value, personal_record_value, level_changed_at, target_frequency,' +
  ' counts_for_ranking, converted_from_goal_id, converted_at, added_at,' +
  ' personal_metric_unit, personal_metric_direction, personal_level_step, personal_base_points'

export async function fetchStructuredGoal(userGoalId: string): Promise<StructuredUserGoal> {
  const goal = unwrap(
    await supabase.from('user_goals').select(USER_GOAL_FIELDS).eq('id', userGoalId).single(),
  ) as unknown as Omit<StructuredUserGoal, 'library'>

  // A converted goal keeps pointing at its origin, so the level step and the
  // metric survive the move into the personal economy (section 5.1).
  const libraryId = goal.library_id ?? goal.converted_from_goal_id
  const library = libraryId ? await fetchLibraryGoal(libraryId) : null

  return { ...goal, library }
}

export async function fetchStructuredGoals(userId: string): Promise<StructuredUserGoal[]> {
  const goals = unwrap(
    await supabase
      .from('user_goals')
      .select(USER_GOAL_FIELDS)
      .eq('user_id', userId)
      .eq('active', true),
  ) as unknown as Omit<StructuredUserGoal, 'library'>[]

  const libraryIds = [
    ...new Set(goals.map((g) => g.library_id ?? g.converted_from_goal_id).filter(Boolean)),
  ] as string[]

  const libraries =
    libraryIds.length === 0
      ? []
      : ((unwrap(
          await supabase.from('goals_library').select(LIBRARY_FIELDS).in('id', libraryIds),
        ) as unknown as LibraryGoalRow[]) ?? [])

  const byId = new Map(libraries.map((l) => [l.id, l]))
  return goals.map((goal) => ({
    ...goal,
    library: byId.get(goal.library_id ?? goal.converted_from_goal_id ?? '') ?? null,
  }))
}

// ── Calibration (S2, section 6) ─────────────────────────────────────────────

export type CalibrationAnswers = {
  /** Q1 — current ability in the goal's metric. */
  Q1?: number
  /** Q2 — days per week. */
  Q2?: number
  /** Q3 — preferred time of day. */
  Q3?: string
  /** Q4 — what makes it hardest. */
  Q4?: string[]
  /** Q5 — where they want to be in a month. */
  Q5?: number
  /** Q6 — where/with what. */
  Q6?: string
  /** Q7 — how often it happens today (avoidance goals). */
  Q7?: number
}

/** Section 6 — the coefficient that decides whether the first session finishes. */
export const CALIBRATION_COEFFICIENT = 0.6

/**
 * Section 6 — turns the Q1 answer into an opening level.
 *
 * The 0.6 is a product decision rather than a training one: someone who
 * finishes their first session comes back, and someone who breaks in the
 * second set disappears. Never below the library's own L1, which is also the
 * baseline floor — opening beneath it would make the first weeks unscoreable.
 */
export function calibrateOpeningLevel(library: LibraryGoalRow, answers: CalibrationAnswers): number {
  const stated = answers.Q1 ?? answers.Q7
  if (stated === undefined || Number.isNaN(stated)) return library.level_1_value

  const scaled =
    library.metric_direction === 'up'
      ? stated * CALIBRATION_COEFFICIENT
      : // A `down` goal opens just under where the user is today: asking
        // someone on 300 minutes of screen time to jump to 180 on day one is
        // the same mistake as the second-set break, in the other direction.
        stated * (2 - CALIBRATION_COEFFICIENT)

  const rounded = library.level_1_value % 1 === 0 ? Math.round(scaled) : Number(scaled.toFixed(1))

  return library.metric_direction === 'up'
    ? Math.max(rounded, library.level_1_value)
    : Math.min(rounded, library.level_1_value)
}

/** Section 6 — how the opening level reads on the calibration screen. */
export function describeOpeningLevel(library: LibraryGoalRow, level: number): string {
  const sets = library.session_config?.sets
  if (sets && sets > 1 && library.metric_key.startsWith('reps')) {
    return `${sets} × ${Math.round(level / sets)} ${library.metric_unit}`
  }
  return `${level} ${library.metric_unit}`
}

export async function adoptStructuredGoal(
  libraryId: string,
  openingLevel: number,
  targetFrequency: number | null,
  answers: CalibrationAnswers,
  verification?: VerificationCode,
): Promise<{ id: string }> {
  return unwrap(
    await supabase
      .rpc('adopt_structured_goal', {
        p_library_id: libraryId,
        p_level_1_value: openingLevel,
        p_target_frequency: targetFrequency,
        p_calibration_answers: answers,
        p_verification: verification ?? null,
      })
      .single(),
  )
}

// ── Level changes (S3, section 4) ───────────────────────────────────────────

export async function changeGoalLevel(
  userGoalId: string,
  direction: 'up' | 'down',
  systemSuggested = false,
): Promise<void> {
  const { error } = await supabase.rpc('change_goal_level', {
    p_user_goal_id: userGoalId,
    p_direction: direction,
    p_system_suggested: systemSuggested,
  })
  if (error) throw new Error(error.message)
}

/** Protection 6 — the 72-hour cooldown, so the button can say why it is off. */
export function levelCooldownRemainingMs(goal: StructuredUserGoal): number {
  if (!goal.level_changed_at) return 0
  const elapsed = Date.now() - new Date(goal.level_changed_at).getTime()
  return Math.max(0, 72 * 60 * 60 * 1000 - elapsed)
}

/**
 * What the level becomes if the button is pressed — S3 previews this.
 *
 * Mirrors change_goal_level's own clamp exactly (0017): for an up-direction
 * metric, level_1_value (or one level step, for a from-scratch personal
 * goal with no library value on record) is a FLOOR. For a down-direction
 * metric it is a CEILING instead — level_1_value is the beginner's worst
 * value, and a `down` goal only ever improves by falling. A from-scratch
 * down-direction goal has no such ceiling to fall from, so its guard is a
 * floor too, at one level step rather than zero: user_goals.current_level_
 * value has a > 0 check, so a from-scratch goal is never allowed to reach
 * zero either.
 */
export function nextLevelValue(goal: StructuredUserGoal, direction: 'up' | 'down'): number | null {
  const { current_level_value: current } = goal
  if (current === null) return null

  const { metricDirection, levelStep } = effectiveMetric(goal)
  const better = direction === 'up'
  const towardsHigher = better === (metricDirection === 'up')
  const next = towardsHigher ? current + levelStep : current - levelStep

  if (metricDirection === 'up') {
    return Math.max(next, goal.library?.level_1_value ?? levelStep)
  }
  return goal.library ? Math.min(next, goal.library.level_1_value) : Math.max(next, levelStep)
}

// ── Completions (the VS screens) ────────────────────────────────────────────

export async function recordStructuredCompletion(args: {
  userGoalId: string
  metricValue: number
  reflectionNote?: string | null
  completedDate?: string
  composite?: boolean
  /**
   * The method actually used, when it is not the goal's default — one of the
   * goal's `verification_allowed`. The server validates it and derives the
   * trust multiplier from it, so this cannot be used to claim V2's ×1.2.
   */
  verification?: VerificationCode
}): Promise<void> {
  const { error } = await supabase.rpc('record_structured_completion', {
    p_user_goal_id: args.userGoalId,
    p_metric_value: args.metricValue,
    p_reflection_note: args.reflectionNote ?? null,
    p_completed_date: args.completedDate ?? null,
    p_composite: args.composite ?? false,
    p_verification: args.verification ?? null,
  })
  if (error) throw new Error(error.message)
}

// ── Conversion between the two economies (S7, section 5.1) ──────────────────

export async function convertGoalToPersonal(userGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('convert_goal_to_personal', { p_user_goal_id: userGoalId })
  if (error) throw new Error(error.message)
}

export async function convertGoalToStructured(userGoalId: string): Promise<void> {
  const { error } = await supabase.rpc('convert_goal_to_structured', { p_user_goal_id: userGoalId })
  if (error) throw new Error(error.message)
}

/** Section 5.1 rule 2 — the 7-day cooldown on returning to the ranking. */
export function conversionCooldownRemainingMs(goal: StructuredUserGoal): number {
  if (!goal.converted_at) return 0
  const elapsed = Date.now() - new Date(goal.converted_at).getTime()
  return Math.max(0, 7 * 24 * 60 * 60 * 1000 - elapsed)
}

// ── Progress and summary (S4, S6) ───────────────────────────────────────────

export async function fetchWeeklyMetrics(
  userGoalId: string,
  limit = 6,
): Promise<WeeklyMetricsRow[]> {
  const rows = unwrap(
    await supabase
      .from('weekly_metrics')
      .select('*')
      .eq('user_goal_id', userGoalId)
      .order('week_start', { ascending: false })
      .limit(limit),
  ) as unknown as WeeklyMetricsRow[]
  return rows.reverse()
}

export type LeaderboardRow = {
  user_id: string
  display_name: string | null
  growth_points: number
  total_points: number
}

/** Section 3.5 — ranked by improvement, not by volume. */
export async function fetchGrowthLeaderboard(weekStart?: string): Promise<LeaderboardRow[]> {
  return unwrap(
    await supabase.rpc('growth_leaderboard', { p_week_start: weekStart ?? null }),
  ) as unknown as LeaderboardRow[]
}

export type WeekSummary = {
  weekStart: string
  totalPoints: number
  previousTotal: number
  byCategory: Record<Category, number>
  topGoal: { title: string; category: Category; points: number; deltaPct: number | null } | null
}

/** Section 3.5 / design 12c — the week's points, split by category. */
export async function fetchWeekSummary(userId: string, weekStart: string): Promise<WeekSummary> {
  const goals = unwrap(
    await supabase.from('user_goals').select('id, title, category').eq('user_id', userId),
  ) as unknown as { id: string; title: string; category: Category }[]

  const empty: WeekSummary = {
    weekStart,
    totalPoints: 0,
    previousTotal: 0,
    byCategory: { physical: 0, academic: 0, social: 0, personal: 0 },
    topGoal: null,
  }
  if (goals.length === 0) return empty

  const previousWeek = new Date(`${weekStart}T00:00:00`)
  previousWeek.setDate(previousWeek.getDate() - 7)
  const previousKey = previousWeek.toISOString().slice(0, 10)

  const rows = unwrap(
    await supabase
      .from('weekly_metrics')
      .select('user_goal_id, week_start, total_points, delta_pct')
      .in('user_goal_id', goals.map((g) => g.id))
      .in('week_start', [weekStart, previousKey]),
  ) as unknown as { user_goal_id: string; week_start: string; total_points: number; delta_pct: number | null }[]

  const byId = new Map(goals.map((g) => [g.id, g]))
  const summary: WeekSummary = { ...empty, byCategory: { ...empty.byCategory } }
  let best = { points: -1 } as { points: number; row?: (typeof rows)[number] }

  for (const row of rows) {
    if (row.week_start === previousKey) {
      summary.previousTotal += row.total_points
      continue
    }
    summary.totalPoints += row.total_points
    const goal = byId.get(row.user_goal_id)
    if (goal) summary.byCategory[goal.category] += row.total_points
    if (row.total_points > best.points) best = { points: row.total_points, row }
  }

  if (best.row) {
    const goal = byId.get(best.row.user_goal_id)
    if (goal) {
      summary.topGoal = {
        title: goal.title,
        category: goal.category,
        points: best.row.total_points,
        deltaPct: best.row.delta_pct,
      }
    }
  }

  return summary
}
