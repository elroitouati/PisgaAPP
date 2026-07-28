import { useI18n } from '@/i18n/useI18n'
import { SummitIcon } from '@/components/icons'

/** Shown when the Supabase env vars are missing, instead of a blank crash. */
export default function SetupRequired() {
  const { t } = useI18n()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <SummitIcon size={48} className="text-fg-subtle" />
      <h1 className="text-lg font-bold">{t('setup.title')}</h1>
      <p className="text-fg-muted max-w-sm text-sm">{t('setup.body')}</p>
      <code className="bg-surface-raised text-fg-muted rounded-lg px-3 py-2 text-xs" dir="ltr">
        cp .env.example .env.local
      </code>
    </main>
  )
}
