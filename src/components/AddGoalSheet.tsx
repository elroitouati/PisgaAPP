import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useAsync } from '@/hooks/useAsync'
import { adoptLibraryGoal, fetchSuggestions } from '@/lib/api'
import { CATEGORY_META, categoryStyle } from '@/lib/categories'
import { BackIcon, FriendsIcon, PersonalIcon, SummitIcon } from '@/components/icons'
import type { LibraryGoal } from '@/types/db'

/**
 * Designs 4a (dark) and 5g (light) — the sheet the ＋ button opens.
 *
 * The "suggested for you" row is what closes the loop on onboarding: the
 * questionnaire records which categories matter, and this is where that answer
 * finally does something for the user.
 */
export function AddGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const navigate = useNavigate()
  const panel = useRef<HTMLDivElement>(null)

  const { data, reload } = useAsync<LibraryGoal[]>(
    () => (user && open ? fetchSuggestions(user.id, 2) : Promise.resolve([])),
    [user?.id, open],
  )

  // Escape closes the sheet, and focus moves into it so a keyboard or screen
  // reader is not left behind on the page underneath.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    panel.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const suggestions = data ?? []

  async function adopt(goal: LibraryGoal) {
    if (!user) return
    await adoptLibraryGoal(user.id, goal)
    reload()
    onClose()
    navigate(`/category/${goal.category}`)
  }

  return (
    <div className="fixed inset-0 z-30">
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={onClose}
        className="bg-scrim absolute inset-0 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={t('sheet.title')}
        tabIndex={-1}
        className="border-line bg-bg absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[26px] border-t px-[22px] pt-3.5 outline-none"
        style={{ paddingBottom: 'calc(1.875rem + env(safe-area-inset-bottom))' }}
      >
        <div className="bg-line mx-auto mb-[18px] h-1 w-[38px] rounded-full" />

        <h2 className="mb-1 text-[19px] font-bold">{t('sheet.title')}</h2>
        <p className="text-fg-muted mb-[18px] text-[13px]">{t('sheet.sub')}</p>

        <div className="flex flex-col gap-2.5">
          <Choice
            icon={<SummitIcon size={20} />}
            title={t('sheet.fromLibrary')}
            subtitle={t('sheet.fromLibrarySub')}
            onClick={() => {
              onClose()
              navigate('/library')
            }}
          />
          <Choice
            icon={<PersonalIcon size={20} />}
            title={t('sheet.custom')}
            subtitle={t('sheet.customSub')}
            onClick={() => {
              onClose()
              navigate('/library?new=1')
            }}
          />
          <Choice
            icon={<FriendsIcon size={20} />}
            title={t('sheet.shared')}
            subtitle={t('sheet.sharedSub')}
            badge={t('sheet.new')}
            accent="social"
            onClick={() => {
              onClose()
              navigate('/shared-goal')
            }}
          />
        </div>

        {suggestions.length > 0 ? (
          <>
            <div className="my-5 mb-1 flex items-center gap-3">
              <span className="bg-line h-px flex-1" />
              <span className="text-fg-subtle text-[11px]">{t('sheet.suggested')}</span>
              <span className="bg-line h-px flex-1" />
            </div>

            <div className="mt-3 flex gap-2">
              {suggestions.map((goal) => {
                const Icon = CATEGORY_META[goal.category].icon
                return (
                  <button
                    key={goal.id}
                    type="button"
                    onClick={() => void adopt(goal)}
                    style={categoryStyle(goal.category)}
                    className="border-line bg-surface flex flex-1 items-center gap-2.5 rounded-[13px] border px-3 py-[11px] text-start"
                  >
                    <span className="text-[var(--cat)]">
                      <Icon size={17} />
                    </span>
                    <span className="truncate text-[12.5px] font-semibold">
                      {lang === 'he' ? goal.title_he : goal.title_en}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

function Choice({
  icon,
  title,
  subtitle,
  badge,
  accent,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  badge?: string
  accent?: 'social'
  onClick: () => void
}) {
  const highlighted = accent === 'social'

  return (
    <button
      type="button"
      onClick={onClick}
      style={highlighted ? categoryStyle('social') : undefined}
      className={`flex items-center gap-[13px] rounded-[16px] p-4 text-start ${
        highlighted
          ? 'border-[1.4px] border-[color-mix(in_oklch,var(--cat)_40%,var(--color-line))] bg-[color-mix(in_oklch,var(--cat)_9%,var(--color-surface))]'
          : 'border-line bg-surface border'
      }`}
    >
      <span
        className={`flex size-10 flex-none items-center justify-center rounded-xl ${
          highlighted
            ? 'bg-[color-mix(in_oklch,var(--cat)_20%,var(--color-surface))] text-[var(--cat)]'
            : 'bg-surface-raised text-fg'
        }`}
      >
        {icon}
      </span>

      <span className="flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="text-fg-muted mt-0.5 block text-xs">{subtitle}</span>
      </span>

      {badge ? (
        <span className="rounded-full border border-[color-mix(in_oklch,var(--cat)_45%,var(--color-line))] px-2 py-0.5 text-[10px] font-semibold text-[var(--cat)]">
          {badge}
        </span>
      ) : (
        <span className="text-fg-subtle">
          <BackIcon size={18} className="rotate-180" />
        </span>
      )}
    </button>
  )
}
