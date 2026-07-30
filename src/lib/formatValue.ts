/**
 * How a metric value is written across every structured-goal screen.
 *
 * Always en-US grouping, never the locale's: the numbers sit inside
 * `dir="ltr"` spans so that "5,000 steps" reads the same in both languages,
 * and Hebrew digit grouping would fight the isolate rather than help it.
 */
export function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return value % 1 === 0 ? value.toLocaleString('en-US') : value.toFixed(1)
}
