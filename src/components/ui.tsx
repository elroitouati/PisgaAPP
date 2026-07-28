import type { ReactNode } from 'react'
import { CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { useI18n } from '@/i18n/useI18n'

/** The card surface used across every screen in the handoff. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border-line bg-surface rounded-[16px] border ${className}`}>{children}</div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-fg-subtle text-[11px] font-semibold tracking-[0.08em]">{children}</div>
  )
}

export function PrimaryButton({
  children,
  className = '',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`bg-brand text-on-brand flex h-[54px] items-center justify-center gap-2 rounded-[15px] text-base font-bold disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

/** Thin category-tinted progress bar (design 5a/5b). */
export function ProgressBar({
  value,
  category,
  height = 4,
}: {
  value: number
  category: Category
  height?: number
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="bg-line overflow-hidden rounded-full"
      style={{ height, ...categoryStyle(category) }}
    >
      <div className="h-full bg-[var(--cat)]" style={{ width: `${pct}%` }} />
    </div>
  )
}

/** The rounded, category-tinted square that holds a category icon. */
export function CategoryTile({
  category,
  size = 38,
  iconSize = 21,
}: {
  category: Category
  size?: number
  iconSize?: number
}) {
  const Icon = CATEGORY_META[category].icon
  return (
    <div
      className="cat-tint flex flex-none items-center justify-center rounded-[11px]"
      style={{ width: size, height: size, ...categoryStyle(category) }}
    >
      <Icon size={iconSize} />
    </div>
  )
}

/** The three-up streak / points / badges strip on the home screen. */
export function StatStrip({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <Card className="flex px-1 py-3.5">
      {stats.map((stat, index) => (
        <div key={stat.label} className="flex flex-1 items-stretch">
          {index > 0 ? <div className="bg-line my-0.5 w-px" /> : null}
          <div className="flex-1 text-center">
            <div className="text-[19px] font-bold">{stat.value}</div>
            <div className="text-fg-muted mt-0.5 text-[11px]">{stat.label}</div>
          </div>
        </div>
      ))}
    </Card>
  )
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-fg-muted rounded-[14px] border border-dashed border-[var(--color-line)] px-4 py-6 text-center text-[13px]">
      {children}
    </p>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n()
  return (
    <Card className="flex flex-col items-center gap-3 p-6 text-center">
      <p className="text-fg-muted text-sm">{t('error.load')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="border-line rounded-full border px-4 py-1.5 text-xs font-medium"
      >
        {t('common.retry')}
      </button>
    </Card>
  )
}
