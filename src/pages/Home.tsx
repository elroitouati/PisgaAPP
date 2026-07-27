import { useAuth } from '@/providers/useAuth'
import { useI18n } from '@/i18n/useI18n'
import { LanguageToggle, ThemeToggle } from '@/components/SettingsToggles'
import { PisgaMark } from '@/components/Brand'

/**
 * Temporary shell. The real home screen (goal rings, categories, daily
 * tracking) is built in a later step, from the design handoff.
 */
export default function Home() {
  const { user, signOut } = useAuth()
  const { t } = useI18n()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-5 py-8">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PisgaMark className="text-brand size-8" />
          <span className="text-lg font-bold">{t('app.name')}</span>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="border-line text-fg-muted hover:text-fg rounded-full border px-3 py-1.5 text-xs font-medium"
        >
          {t('common.signOut')}
        </button>
      </header>

      <section className="border-line bg-surface rounded-2xl border p-5">
        <h1 className="text-xl font-bold">{t('home.title')}</h1>
        <p className="text-fg-muted mt-2 text-sm">{t('home.placeholder')}</p>
        {user?.email ? (
          <p className="text-fg-subtle mt-4 text-xs" dir="ltr">
            {user.email}
          </p>
        ) : null}
      </section>

      <div className="mt-auto flex flex-wrap items-center justify-center gap-3">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </main>
  )
}
