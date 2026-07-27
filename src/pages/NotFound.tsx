import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'

export default function NotFound() {
  const { t } = useI18n()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-bold">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="bg-brand text-on-brand rounded-xl px-5 py-2.5 text-sm font-semibold"
      >
        {t('notFound.back')}
      </Link>
    </main>
  )
}
