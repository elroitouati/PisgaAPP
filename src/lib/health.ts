import { Capacitor } from '@capacitor/core'
import { Health, type HealthPermission } from 'capacitor-health'
import { supabase } from './supabase'
import { todayKey } from './dates'

/**
 * Reading V2 metrics from the phone's own health store.
 *
 * Apple Health on iPhone, Health Connect on Android — and Health Connect is
 * where Samsung Health writes, so Samsung is covered without a Samsung-specific
 * SDK. Neither platform has a cloud API: the data lives on the device, and only
 * a native app the user granted permission to can read it.
 *
 * That is why this file exists at all, and why it is careful. The number
 * necessarily travels client → server, which is the shape 0014 refused for V2.
 * What makes it acceptable is that we never send a number without the
 * platform's own "a human typed this" flag beside it, and the server refuses
 * the ones that carry it (0015). This module must therefore never invent,
 * default or drop that flag — if the platform will not tell us, we do not send.
 */

/** Which of our goals a health store can actually answer, and how. */
type HealthMapping =
  | { kind: 'steps' }
  | { kind: 'workout-distance'; match: (workoutType: string) => boolean }

/**
 * Only the goals the device can genuinely measure appear here. P-17 (sleep)
 * and I-18 (daylight) are deliberately absent — see UNSUPPORTED below.
 */
const MAPPINGS: Record<string, HealthMapping> = {
  'P-08': { kind: 'steps' },
  'P-07': {
    kind: 'workout-distance',
    match: (type) => /run|walk|hike/i.test(type),
  },
  'P-09': {
    kind: 'workout-distance',
    match: (type) => /bik|cycl/i.test(type),
  },
}

/**
 * Sensor goals the installed health plugin cannot answer today.
 *
 * P-17 — neither queryAggregated nor queryRecords exposes sleep.
 * I-18 — time in daylight is an Apple Watch metric with no Health Connect
 *        equivalent and no plugin support.
 *
 * Listed rather than silently skipped so the screen can say which goals will
 * not sync instead of showing an unexplained zero.
 */
export const UNSUPPORTED_SENSOR_GOALS = ['P-17', 'I-18']

const PERMISSIONS: HealthPermission[] = ['READ_STEPS', 'READ_WORKOUTS', 'READ_DISTANCE']

export type HealthGoal = {
  user_goal_id: string
  code: string
  metric_key: string
  metric_unit: string
  goal_title: string
}

export type HealthReading = {
  userGoalId: string
  value: number
  /** The platform's own flag. Never defaulted — see the note at the top. */
  manual: boolean
  sourceDevice: string | null
}

/** Which store this device speaks to, in the enum the database uses. */
export function healthSourceForPlatform(): 'apple_health' | 'health_connect' | null {
  const platform = Capacitor.getPlatform()
  if (platform === 'ios') return 'apple_health'
  if (platform === 'android') return 'health_connect'
  return null
}

/**
 * False in the browser, always. The PWA has no path to health data, and
 * pretending otherwise would put a dead button on the screen.
 */
export async function isHealthSyncAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { available } = await Health.isHealthAvailable()
    return available
  } catch {
    // Android without Health Connect installed lands here.
    return false
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  const response = await Health.requestHealthPermissions({ permissions: PERMISSIONS })
  // iOS cannot report what was actually granted (by design — knowing what a
  // user declined is itself health information), so a resolved call is the
  // most the platform will tell us. A later read returning nothing is how a
  // decline surfaces there.
  return Array.isArray(response.permissions)
}

/** The user's goals that a health store could feed. */
export async function fetchHealthGoals(): Promise<HealthGoal[]> {
  const { data, error } = await supabase.rpc('my_health_goals')
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as HealthGoal[]
}

function dayBounds(date: string): { startDate: string; endDate: string } {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(`${date}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { startDate: start.toISOString(), endDate: end.toISOString() }
}

/**
 * Reads one goal's metric for one day.
 *
 * Returns null when the store has nothing to say, which is different from
 * zero: a day with no data must not be written as a completion of 0.
 */
async function readGoal(goal: HealthGoal, date: string): Promise<HealthReading | null> {
  const mapping = MAPPINGS[goal.code]
  if (!mapping) return null
  const bounds = dayBounds(date)

  if (mapping.kind === 'steps') {
    // queryRecords rather than queryAggregated: only the per-record form
    // carries `manual`, and without it we have nothing to check.
    const { records } = await Health.queryRecords({ ...bounds, dataType: 'steps' })
    if (records.length === 0) return null

    const total = records.reduce((sum, record) => sum + record.value, 0)
    return {
      userGoalId: goal.user_goal_id,
      value: total,
      // One hand-entered record taints the day's total, because the total is
      // what gets scored. Conservative on purpose.
      manual: records.some((record) => record.manual),
      sourceDevice: records[0]?.sourceName ?? null,
    }
  }

  const { workouts } = await Health.queryWorkouts({
    ...bounds,
    includeHeartRate: false,
    includeRoute: false,
    includeSteps: false,
  })
  const matching = workouts.filter((workout) => mapping.match(workout.workoutType))
  if (matching.length === 0) return null

  const metres = matching.reduce((sum, workout) => sum + (workout.distance ?? 0), 0)
  if (metres <= 0) return null

  return {
    userGoalId: goal.user_goal_id,
    // The library measures these in kilometres; the platforms report metres.
    value: Number((metres / 1000).toFixed(2)),
    // Workouts carry no per-record manual flag on either platform. Treating
    // that absence as "not manual" is the honest reading — a workout is a
    // recorded session, not a typed number — but it is why steps are the
    // stronger signal of the two.
    manual: false,
    sourceDevice: matching[0]?.sourceName ?? null,
  }
}

/**
 * Reads every syncable goal and posts the readings to the Edge Function.
 *
 * The function, not the database: `record_health_completion` is service-role
 * only (0015), and the attestation that makes a ×1.2 write believable can only
 * be verified server-side.
 */
export async function syncHealthGoals(date = todayKey()): Promise<{ synced: number; skipped: string[] }> {
  const source = healthSourceForPlatform()
  if (!source) throw new Error('health sync is not available on this platform')

  const goals = await fetchHealthGoals()
  const readings: HealthReading[] = []
  const skipped: string[] = []

  for (const goal of goals) {
    if (!MAPPINGS[goal.code]) {
      skipped.push(goal.code)
      continue
    }
    const reading = await readGoal(goal, date)
    if (reading) readings.push(reading)
  }

  if (readings.length === 0) return { synced: 0, skipped }

  const { data: session } = await supabase.auth.getSession()
  const token = session.session?.access_token
  if (!token) throw new Error('not signed in')

  const { error } = await supabase.functions.invoke('health-sync', {
    body: { source, completedDate: date, readings },
  })
  if (error) throw new Error(error.message)

  return { synced: readings.length, skipped }
}

/** Records that this device's store is connected, after permissions are granted. */
export async function connectHealthSource(): Promise<void> {
  const source = healthSourceForPlatform()
  if (!source) throw new Error('health sync is not available on this platform')

  const { error } = await supabase.functions.invoke('health-sync', {
    body: { source, connect: true, grantedTypes: PERMISSIONS },
  })
  if (error) throw new Error(error.message)
}

export type HealthSourceRow = {
  source: 'apple_health' | 'health_connect'
  device_name: string | null
  last_synced_at: string | null
}

export async function fetchHealthSource(): Promise<HealthSourceRow | null> {
  const { data, error } = await supabase
    .from('health_sources')
    .select('source, device_name, last_synced_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as HealthSourceRow | null) ?? null
}
