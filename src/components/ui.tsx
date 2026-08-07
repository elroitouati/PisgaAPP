import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { useI18n } from '@/i18n/useI18n'
import { BackIcon, WarningIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

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

export function EmptyState({
  children,
  actionLabel,
  onAction,
}: {
  children: ReactNode
  /** When given with onAction, the empty state becomes a tappable CTA. */
  actionLabel?: string
  onAction?: () => void
}) {
  if (actionLabel && onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className="text-fg-muted flex w-full flex-col items-center gap-1 rounded-[14px] border border-dashed border-[var(--color-line)] px-4 py-6 text-center text-[13px]"
      >
        <span>{children}</span>
        <span className="text-[var(--cat)] font-semibold">{actionLabel}</span>
      </button>
    )
  }
  return (
    <p className="text-fg-muted rounded-[14px] border border-dashed border-[var(--color-line)] px-4 py-6 text-center text-[13px]">
      {children}
    </p>
  )
}

/**
 * A destructive-action confirmation, styled like GoalCard's ConversionSheet
 * (S7) — the one confirmation dialog already in the app before this one.
 * Used for both deleting a goal and signing out.
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  busy = false,
  danger = true,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  busy?: boolean
  /** False for a confirmation that isn't itself destructive (e.g. sign out). */
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center px-[22px]">
      <button
        type="button"
        aria-label={t('common.cancel')}
        onClick={onCancel}
        className="bg-scrim absolute inset-0"
      />
      <div className="border-line bg-surface relative w-full max-w-sm rounded-[20px] border px-[22px] pt-[26px] pb-[22px]">
        <div className="flex flex-col items-center gap-3.5">
          <div
            className={`flex size-13 items-center justify-center rounded-full ${
              danger ? 'bg-danger/15 text-danger' : 'bg-surface-raised text-fg-muted'
            }`}
          >
            <WarningIcon size={26} />
          </div>
          <div className="text-center">
            <div className="text-[17px] font-bold">{title}</div>
            <p className="text-fg-muted mt-2 text-[13.5px] leading-relaxed">{body}</p>
          </div>
        </div>

        <div className="mt-5.5 flex flex-col gap-2.5">
          <PrimaryButton
            className={danger ? 'bg-danger text-on-brand h-13' : 'h-13'}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? <Spinner className="border-current/30 border-t-current" /> : null}
            {confirmLabel}
          </PrimaryButton>
          <button
            type="button"
            onClick={onCancel}
            className="border-line text-fg-muted h-13 rounded-[14px] border text-[14.5px] font-semibold"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The full-screen spinner every goal screen shows while its data loads —
 * with a way out. Six screens across the structured-goals flow (GoalCard,
 * Verify, Calibrate, GoalProgress, WeeklySummary) plus GuidedSession used a
 * bare spinner with no back button here: on a slow connection, or a request
 * that never resolves, there was nothing on screen to tap. The OS back
 * gesture still worked underneath it, but nothing on screen told anyone that.
 */
export function LoadingScreen() {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <main className="relative flex min-h-dvh items-center justify-center">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label={t('common.back')}
        className="text-fg-muted absolute start-[22px] flex"
        style={{ top: 'calc(1.25rem + env(safe-area-inset-top))' }}
      >
        <BackIcon size={21} />
      </button>
      <Spinner className="size-7" />
    </main>
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
