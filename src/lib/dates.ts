/**
 * Dates here are calendar days in the user's own timezone, not instants: a
 * completion belongs to the day the user experienced, so everything goes
 * through local-date strings rather than toISOString() (which would shift the
 * day for anyone east or west of UTC around midnight).
 */

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function addDays(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  return toDateKey(new Date(year, month - 1, day + delta))
}

export function yesterdayKey(): string {
  return addDays(todayKey(), -1)
}
