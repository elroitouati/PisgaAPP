import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { LANGUAGES, LANG_LABEL, type Lang } from '@/i18n/translations'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { updateProfile, uploadAvatar, removeAvatar } from '@/lib/api'
import { BackIcon, CameraIcon, TrashIcon, UploadIcon } from '@/components/icons'
import { Spinner } from '@/components/Spinner'

/** Designs 8a (dark) / 8b (light) — display name, language, and the avatar sheet. */
export default function EditProfile() {
  const { t, lang, setLang } = useI18n()
  const { user } = useAuth()
  const { profile, reload } = useProfile()
  const navigate = useNavigate()

  const [name, setName] = useState(profile?.display_name ?? '')
  const [pendingLang, setPendingLang] = useState<Lang>(lang)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const cameraInput = useRef<HTMLInputElement>(null)

  const dirty = name.trim() !== (profile?.display_name ?? '') || pendingLang !== lang

  async function save() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      if (name.trim() !== (profile?.display_name ?? '')) {
        await updateProfile(user.id, { display_name: name.trim() })
      }
      if (pendingLang !== lang) setLang(pendingLang)
      reload()
      navigate(-1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('profile.edit.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file || !user) return
    setSheetOpen(false)
    setBusy(true)
    setError(null)
    try {
      await uploadAvatar(user.id, file)
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('profile.edit.error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!user) return
    setSheetOpen(false)
    setBusy(true)
    setError(null)
    try {
      await removeAvatar(user.id)
      reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('profile.edit.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-[22px] pt-14 pb-8"
      style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}
    >
      <header className="flex flex-shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label={t('common.back')}
          className="text-fg-muted flex"
        >
          <BackIcon />
        </button>
        <h1 className="text-[19px] font-bold">{t('profile.edit.title')}</h1>
      </header>

      <div className="flex flex-shrink-0 flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="relative size-[88px] rounded-full"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="size-[88px] rounded-full object-cover" />
          ) : (
            <div className="bg-surface-raised text-fg-muted flex size-[88px] items-center justify-center rounded-full text-[34px] font-bold">
              {(name || user?.email || '?').trim().charAt(0).toUpperCase()}
            </div>
          )}
          <span className="bg-fg text-bg border-bg absolute bottom-0 start-0 flex size-[30px] items-center justify-center rounded-full border-[3px]">
            <CameraIcon size={15} />
          </span>
        </button>
        <span className="text-fg-subtle text-[12.5px]">{t('profile.edit.hint')}</span>
      </div>

      <div className="flex-shrink-0">
        <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
          {t('profile.edit.displayName')}
        </div>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="border-line bg-surface focus:border-fg w-full rounded-[14px] border px-4 py-[15px] text-[15px] font-semibold outline-none"
        />
      </div>

      <div className="flex-shrink-0">
        <div className="text-fg-subtle mb-2.5 text-[11px] font-semibold tracking-[0.08em]">
          {t('common.language')}
        </div>
        <div className="border-line bg-surface flex rounded-[14px] border p-1">
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setPendingLang(code)}
              aria-pressed={pendingLang === code}
              className={`flex-1 rounded-[11px] py-2.5 text-center text-sm font-semibold ${
                pendingLang === code ? 'bg-surface-raised' : 'text-fg-muted'
              }`}
            >
              {LANG_LABEL[code]}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p role="alert" className="text-danger flex-shrink-0 text-center text-xs">
          {error}
        </p>
      ) : null}

      {dirty ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="bg-brand text-on-brand mt-auto flex h-[54px] flex-shrink-0 items-center justify-center gap-2 rounded-[15px] text-base font-bold disabled:opacity-60"
        >
          {busy ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : null}
          {t('common.save')}
        </button>
      ) : null}

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="user"
        className="hidden"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {sheetOpen ? (
        <div className="fixed inset-0 z-30">
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setSheetOpen(false)}
            className="bg-scrim absolute inset-0 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('profile.edit.sheetTitle')}
            className="border-line bg-bg absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-[26px] border-t px-[22px] pt-3.5"
            style={{ paddingBottom: 'calc(1.875rem + env(safe-area-inset-bottom))' }}
          >
            <div className="bg-line mx-auto mb-[18px] h-1 w-[38px] rounded-full" />
            <h2 className="mb-3.5 text-[16px] font-bold">{t('profile.edit.sheetTitle')}</h2>

            <div className="flex flex-col gap-2.5">
              <SheetRow
                icon={<CameraIcon size={21} />}
                label={t('profile.edit.takePhoto')}
                onClick={() => cameraInput.current?.click()}
              />
              <SheetRow
                icon={<UploadIcon size={21} />}
                label={t('profile.edit.uploadPhoto')}
                onClick={() => fileInput.current?.click()}
              />
              {profile?.avatar_url ? (
                <SheetRow
                  icon={<TrashIcon size={21} />}
                  label={t('profile.edit.removePhoto')}
                  danger
                  onClick={() => void handleRemove()}
                />
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="text-fg-muted mt-2.5 w-full py-3.5 text-center text-[15px] font-semibold"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function SheetRow({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-line bg-surface flex items-center gap-[13px] rounded-[15px] border px-[15px] py-3.5 text-start ${
        danger ? 'text-danger' : ''
      }`}
    >
      {icon}
      <span className="text-[15px] font-semibold">{label}</span>
    </button>
  )
}
