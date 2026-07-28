import type { TrackedGoal } from '@/types/db'

/**
 * Points come from the goal itself — each library goal carries its own value
 * (see supabase/migrations/0004_goal_points.sql), rather than being derived
 * from its category or verification method.
 *
 * PRD 3.1: only structured (library) goals score. The database already forces
 * `points` to 0 on a custom goal, so this is a display-side echo of a rule
 * that is enforced where it cannot be bypassed.
 */
export function pointsFor(goal: Pick<TrackedGoal, 'is_custom' | 'points'>): number {
  return goal.is_custom ? 0 : goal.points
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
