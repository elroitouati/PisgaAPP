import { useI18n } from '@/i18n/useI18n'
import { LANG_LABEL, LANGUAGES } from '@/i18n/translations'

const segmentBase =
  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60'

/** Small he/en switch. Flipping the language also flips document direction. */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n()

  return (
    <div
      role="group"
      aria-label={t('common.language')}
      className="border-line bg-surface inline-flex gap-1 rounded-full border p-1"
    >
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          aria-pressed={lang === code}
          className={`${segmentBase} ${
            lang === code ? 'bg-brand text-on-brand' : 'text-fg-muted hover:text-fg'
          }`}
        >
          {LANG_LABEL[code]}
        </button>
      ))}
    </div>
  )
}
