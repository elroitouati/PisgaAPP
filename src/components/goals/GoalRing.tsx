import { formatValue } from '@/lib/formatValue'

/**
 * The progress ring on the goal card (design 11a/11b).
 *
 * Drawn once here rather than per goal: section 7.3 is explicit that the
 * difference between goals is textual and logical, never visual. The only
 * thing that changes between 80 goals is the category token feeding
 * `--cat` and the numbers inside.
 */
export function GoalRing({
  value,
  target,
  label,
  size = 172,
}: {
  value: number
  target: number
  label: string
  size?: number
}) {
  const radius = size / 2 - 10
  const circumference = 2 * Math.PI * radius
  const ratio = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--cat)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span dir="ltr" className="text-[30px] font-bold [unicode-bidi:isolate]">
          {formatValue(value)} / {formatValue(target)}
        </span>
        <span className="text-fg-muted mt-0.5 text-xs">{label}</span>
      </div>
    </div>
  )
}
