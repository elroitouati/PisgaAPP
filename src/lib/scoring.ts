import type { TrackedGoal } from '@/types/db'
import type { VerificationMethod } from '@/types/db'

/**
 * ⚠ PROVISIONAL — the points formula is NOT specified anywhere in the PRD.
 * The design shows totals ("1,240 נקודות") and a per-goal award ("+40 נק'"),
 * which tells us points exist and vary by goal, but not how they are earned.
 *
 * The weights below are a placeholder so the screens have real numbers to
 * render, scaled by how much a verification method actually demands. Replace
 * this table once the rule is decided — it is the only place points are
 * computed, so nothing else has to change.
 *
 * PRD 3.1 is settled and enforced here: only structured (library) goals score.
 * Custom goals are excluded because there is no objective way to compare their
 * difficulty.
 */
const POINTS_BY_VERIFICATION: Record<VerificationMethod, number> = {
  guided_session: 40,
  sensor_sync: 30,
  daily_checkin: 20,
  checkbox_reflection: 20,
}

export function pointsFor(goal: Pick<TrackedGoal, 'is_custom' | 'verification'>): number {
  if (goal.is_custom) return 0
  return POINTS_BY_VERIFICATION[goal.verification]
}

export function pointsEarnedToday(goals: TrackedGoal[]): number {
  return goals.reduce((total, goal) => total + (goal.completedToday ? pointsFor(goal) : 0), 0)
}

/**
 * The headline streak on the home screen: the longest run currently alive
 * across the user's goals. PRD 6.5 asks for streaks per goal and per category;
 * this is the roll-up the design puts in the stat strip.
 */
export function overallStreak(goals: TrackedGoal[]): number {
  return goals.reduce((best, goal) => Math.max(best, goal.streak), 0)
}
