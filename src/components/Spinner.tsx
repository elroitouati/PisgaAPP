export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={`border-line border-t-brand inline-block size-5 animate-spin rounded-full border-2 ${className}`}
    />
  )
}

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3">
      <Spinner className="size-8" />
      <p className="text-fg-muted text-sm">{label}</p>
    </div>
  )
}
