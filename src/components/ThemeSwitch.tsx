import { useI18n } from '@/i18n/useI18n'
import { useTheme } from '@/providers/useTheme'
import { MoonIcon, SunIcon } from './icons'

/**
 * The sun/moon pill. It appears in exactly two places — the sign-in screen and
 * the profile settings — and nowhere inside the app itself.
 *
 * Two options, not three: the control mirrors what is on screen right now, and
 * tapping commits to it. 'system' stays the default until someone touches this,
 * so a first-time user still gets whatever their device is set to; it just is
 * not an option worth a third of the control.
 */
export function ThemeSwitch({ className = '' }: { className?: string }) {
  const { t } = useI18n()
  const { theme, setPreference } = useTheme()

  // Dark first so that in RTL the sun lands on the left, as the mock draws it.
  const options = [
    { value: 'dark', icon: MoonIcon, label: t('common.theme.dark') },
    { value: 'light', icon: SunIcon, label: t('common.theme.light') },
  ] as const

  return (
    <div
      role="group"
      aria-label={t('common.theme')}
      className={`bg-surface-raised inline-flex gap-0.5 rounded-full p-1 ${className}`}
    >
      {options.map(({ value, icon: Icon, label }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setPreference(value)}
            aria-pressed={active}
            aria-label={label}
            title={label}
            className={`flex size-7 items-center justify-center rounded-full transition-colors ${
              active ? 'bg-bg text-fg shadow-sm' : 'text-fg-subtle'
            }`}
          >
            <Icon size={15} />
          </button>
        )
      })}
    </div>
  )
}
