/**
 * The growth scoring engine — section 3 of Pisga_Goals_Library_v1.md.
 *
 * The principle the whole product rests on: the score measures growth, not
 * strength. Someone who does 200 push-ups a day and stops improving earns
 * less than someone who went from 10 to 20. Every branch below exists to
 * keep that true.
 *
 * This module is a pure function with no I/O so it can be unit-tested against
 * the worked example in section 3.3. It is NOT the authority: weekly_metrics
 * has no client write policy, and the numbers that reach the friends
 * leaderboard are computed by compute_weekly_metrics() in
 * 0012_growth_engine.sql. Both implement this same formula and both are
 * tested against that same example — this one so the maths is provable, the
 * SQL one so the maths cannot be forged.
 */

/** Section 3.4 — the single global dial. Change one number, not eighty rows. */
export const POINTS_SCALE = 1.0

/** Section 4.1.1 — how far the "hard for me" penalty can go, and no further. */
export const LEVEL_MULTIPLIER_FLOOR = 0.6

/** Section 10.3 — a week cannot count as more than a doubling. */
export const MAX_DELTA = 1.0

/** Section 10.2 — improvement points per category per week. */
export const IMPROVEMENT_CAP_PER_CATEGORY = 100

/** Section 10.8 — a new goal has nothing to be measured against yet. */
export const BASELINE_WARMUP_WEEKS = 2

/** Section 3.2 — the baseline is the peak of this many prior weeks. */
export const BASELINE_WINDOW_WEEKS = 4

export type MetricDirection = 'up' | 'down'

export type GoalWeekInput = {
  /** base_points — what one verified performance of this goal is worth. */
  basePoints: number
  /** level_1_value — the opening level, and the floor of the baseline. */
  level1Value: number
  metricDirection: MetricDirection
  /** The target the user is held to right now, in the metric's own unit. */
  currentLevelValue: number
  /** The highest level ever reached. Section 4.3: this never goes down. */
  personalRecordValue: number
  /** Total performed this week, in the metric's own unit. */
  totalValue: number
  /**
   * Every verified completion this week, as its trust multiplier (section 5).
   * One entry per completion — the length is the number of performances.
   */
  completionTrustMultipliers: number[]
  /**
   * Weekly totals of the prior weeks, newest first. Only weeks that counted
   * for ranking belong here: section 5.1 rule 3 puts weeks spent as a
   * personal goal outside the window entirely, in either direction.
   */
  priorWeekTotals: number[]
  /** How many weeks this goal has existed. Below 2, improvement is withheld. */
  goalAgeInWeeks: number
  /** Set when a level-up this week beat the previous personal record. */
  setNewPersonalRecord?: boolean
}

export type GoalWeekPoints = {
  levelMultiplier: number
  baselineValue: number
  /** Signed. Negative is a real, displayable result — it just scores zero. */
  deltaPct: number
  executionPoints: number
  improvementPoints: number
  maintenancePoints: number
  levelBonusPoints: number
  totalPoints: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Section 4.1.1 — the "hard for me" penalty, expressed as a ratio against the
 * user's own record rather than against any absolute level. Someone at their
 * personal best earns ×1.0 whether that best is 200 push-ups or 12; the
 * penalty is for personal regression, never for being a beginner.
 *
 * The ratio inverts for a `down` goal. There, a better level is a SMALLER
 * number — a screen-time record of 120 minutes beaten back up to 180 is a
 * regression, and current ÷ record would read it as 1.5 and clamp to a full
 * ×1.0, quietly handing the two down-direction goals in the library
 * (S-19, I-16) an exemption from the penalty the other 78 goals carry.
 */
export function levelMultiplier(
  currentLevelValue: number,
  personalRecordValue: number,
  direction: MetricDirection = 'up',
): number {
  if (personalRecordValue <= 0 || currentLevelValue <= 0) return 1.0
  const ratio =
    direction === 'up'
      ? currentLevelValue / personalRecordValue
      : personalRecordValue / currentLevelValue
  return clamp(ratio, LEVEL_MULTIPLIER_FLOOR, 1.0)
}

/**
 * Section 3.2b — the comparison baseline: the peak of the last four ranked
 * weeks, floored at the opening level.
 *
 * The floor is what stops a beginner from being paid for noise. Without it,
 * going from 1 rep to 2 is a 100% improvement and outscores everyone; with
 * it, that same user's route to a big score is the level-up bonus, which
 * lands every week or two, rather than an inflated delta.
 */
export function baselineValue(priorWeekTotals: number[], level1Value: number): number {
  const window = priorWeekTotals.slice(0, BASELINE_WINDOW_WEEKS)
  return Math.max(level1Value, ...window, 0)
}

/**
 * Section 3.2b — relative change against the baseline, in the goal's own
 * direction. A `down` goal (screen time, social media) improves by shrinking,
 * so the subtraction flips.
 */
export function deltaPct(
  totalValue: number,
  baseline: number,
  direction: MetricDirection,
): number {
  if (baseline <= 0) return 0
  const raw = direction === 'up' ? (totalValue - baseline) / baseline : (baseline - totalValue) / baseline
  // Capped on the positive side only (section 10.3): a ×5 week is a
  // measurement error or an exploit. A negative delta stays exact, because
  // the progress screen shows it.
  return Math.min(raw, MAX_DELTA)
}

/** Section 3.2 — one goal's points for one week. */
export function scoreGoalWeek(input: GoalWeekInput): GoalWeekPoints {
  const {
    basePoints,
    level1Value,
    metricDirection,
    currentLevelValue,
    personalRecordValue,
    totalValue,
    completionTrustMultipliers,
    priorWeekTotals,
    goalAgeInWeeks,
    setNewPersonalRecord = false,
  } = input

  const multiplier = levelMultiplier(currentLevelValue, personalRecordValue, metricDirection)
  const baseline = baselineValue(priorWeekTotals, level1Value)
  const delta = deltaPct(totalValue, baseline, metricDirection)

  // (a) Execution — what rewards simply turning up. Each completion is worth
  // the goal's base points, scaled by how trustworthy its verification is and
  // by how far the user currently sits below their own record.
  const executionPoints = completionTrustMultipliers.reduce(
    (sum, trust) => sum + basePoints * trust * multiplier,
    0,
  )

  // (b) Improvement — the part that carries the principle. Withheld for the
  // first two weeks of a goal's life, because there is nothing to measure
  // against yet and any number would be invented.
  const improvementPoints =
    delta > 0 && goalAgeInWeeks >= BASELINE_WARMUP_WEEKS ? basePoints * 3 * delta : 0

  // (c) Maintenance — without it, everyone who reaches their own ceiling stops
  // earning and leaves. Denied at a reduced level multiplier: someone who
  // dropped a level is not holding a record, so this is the second half of
  // the penalty, not an oversight.
  const maintenancePoints =
    delta <= 0 && totalValue >= 0.95 * baseline && multiplier === 1.0 ? basePoints * 0.3 : 0

  // (d) Level-up bonus — only on a genuinely new personal record, so that
  // cycling down and back up cannot be farmed (section 4.3).
  const levelBonusPoints = setNewPersonalRecord ? basePoints * 0.5 : 0

  const round = (value: number) => Math.round(value * POINTS_SCALE)

  const execution = round(executionPoints)
  const improvement = round(improvementPoints)
  const maintenance = round(maintenancePoints)
  const levelBonus = round(levelBonusPoints)

  return {
    levelMultiplier: multiplier,
    baselineValue: baseline,
    deltaPct: delta,
    executionPoints: execution,
    improvementPoints: improvement,
    maintenancePoints: maintenance,
    levelBonusPoints: levelBonus,
    totalPoints: execution + improvement + maintenance + levelBonus,
  }
}

/**
 * Section 10.2 — improvement is capped at 100 points per category per week,
 * applied across the category's goals rather than per goal.
 *
 * Proportional rather than first-come: scaling every goal down by the same
 * factor keeps the ordering between them, where truncating in query order
 * would hand the cap to whichever goal happened to be read first.
 */
export function capImprovementForCategory(improvementPoints: number[]): number[] {
  const total = improvementPoints.reduce((sum, points) => sum + points, 0)
  if (total <= IMPROVEMENT_CAP_PER_CATEGORY) return improvementPoints

  const factor = IMPROVEMENT_CAP_PER_CATEGORY / total
  return improvementPoints.map((points) => Math.floor(points * factor))
}
