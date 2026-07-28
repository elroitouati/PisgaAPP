import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { useAsync } from '@/hooks/useAsync'
import { adoptLibraryGoal, fetchFriends, fetchLibrary, shareGoal } from '@/lib/api'
import { CATEGORY_META, categoryStyle, type Category } from '@/lib/categories'
import { addDays, todayKey } from '@/lib/dates'
import { BackIcon, PlusIcon } from '@/components/icons'
import { PrimaryButton, SectionLabel } from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import type { LibraryGoal } from '@/types/db'
import type { TranslationKey } from '@/i18n/translations'

/** How long the challenge runs, from design 4b/5h. */
const DURATIONS = [
  { days: 7, labelKey: 'shared.week' },
  { days: 30, labelKey: 'shared.month' },
  { days: 90, labelKey: 'shared.quarter' },
] satisfies { days: number; labelKey: TranslationKey }[]

/**
 * Designs 4b (dark) and 5h (light) — pick a friend, a goal and a length, then
 * send the invitation.
 *
 * A shared challenge is a library goal the owner adopts and then shares: the
 * friend accepts it on their side, which is also what opens the challenge
 * thread (see the trigger in 0005_chat.sql).
 */
export default function SharedGoal() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()

  const [friendId, setFriendId] = useState<string | null>(null)
  const [goal, setGoal] = useState<LibraryGoal | null>(null)
  const [days, setDays] = useState(30)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const friends = useAsync(
    () => (user ? fetchFriends(user.id) : Promise.resolve([])),
    [user?.id],
  )
  const library = useAsync<LibraryGoal[]>(() => fetchLibrary(), [])

  const people = useMemo(() => friends.data ?? [], [friends.data])
  const goals = useMemo(() => library.data ?? [], [library.data])
  const friend = people.find((candidate) => candidate.id === friendId) ?? null

  const ready = Boolean(friendId && goal)

  async function invite() {
    if (!user || !friendId || !goal) return
    setSaving(true)
    setError(null)
    try {
      // The challenge is the owner's goal with an end date; sharing it is what
      // invites the friend.
      const mine = await adoptLibraryGoal(user.id, goal, {
        goalType: 'deadline',
        targetDate: addDays(todayKey(), days),
      })
      await shareGoal(mine.id, friendId)
      navigate('/friends')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('error.load'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-[22px] pt-14 pb-8"
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
        <div>
          <h1 className="text-[19px] font-bold">{t('shared.title')}</h1>
          <p className="text-fg-muted mt-0.5 text-xs">{t('shared.sub')}</p>
        </div>
      </header>

      <section>
        <div className="mb-2.5">
          <SectionLabel>{t('shared.withWho')}</SectionLabel>
        </div>
        {friends.loading ? (
          <Spinner />
        ) : people.length === 0 ? (
          <p className="text-fg-muted text-[13px]">{t('friends.empty')}</p>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {people.map((person, index) => {
              const accent = (['academic', 'social', 'physical', 'personal'] as Category[])[index % 4]
              const selected = friendId === person.id
              return (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setFriendId(selected ? null : person.id)}
                  aria-pressed={selected}
                  className="flex w-[70px] flex-none flex-col items-center gap-[7px]"
                >
                  <span
                    style={{
                      ...categoryStyle(accent),
                      background: 'color-mix(in oklch, var(--cat) 30%, var(--pisga-card))',
                      ...(selected
                        ? { boxShadow: '0 0 0 2px var(--pisga-social)' }
                        : {}),
                    }}
                    className="flex size-[52px] items-center justify-center rounded-full text-[19px] font-bold text-[var(--cat)]"
                  >
                    {person.displayName.trim().charAt(0) || '?'}
                  </span>
                  <span className={`truncate text-[11.5px] ${selected ? '' : 'text-fg-muted'}`}>
                    {person.displayName.split(' ')[0]}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5">
          <SectionLabel>{t('shared.theGoal')}</SectionLabel>
        </div>
        <select
          value={goal?.id ?? ''}
          onChange={(event) =>
            setGoal(goals.find((candidate) => candidate.id === event.target.value) ?? null)
          }
          className="border-line bg-surface w-full rounded-[14px] border px-4 py-4 text-[15px] font-semibold outline-none"
        >
          <option value="">{t('shared.pickGoal')}</option>
          {goals.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {t(CATEGORY_META[candidate.category].labelKey)} ·{' '}
              {lang === 'he' ? candidate.title_he : candidate.title_en}
            </option>
          ))}
        </select>
      </section>

      <section>
        <div className="mb-2.5">
          <SectionLabel>{t('shared.duration')}</SectionLabel>
        </div>
        <div className="flex gap-2" style={categoryStyle('social')}>
          {DURATIONS.map((option) => {
            const active = days === option.days
            return (
              <button
                key={option.days}
                type="button"
                onClick={() => setDays(option.days)}
                aria-pressed={active}
                className={`flex-1 rounded-[13px] px-2 py-3.5 text-center text-sm font-semibold ${
                  active
                    ? 'border-[1.4px] border-[var(--cat)] bg-[color-mix(in_oklch,var(--cat)_10%,var(--color-surface))] text-[var(--cat)]'
                    : 'border-line bg-surface border'
                }`}
              >
                {t(option.labelKey)}
              </button>
            )
          })}
        </div>
      </section>

      {ready && friend ? (
        <section
          className="border-line bg-surface rounded-[16px] border p-4"
          style={categoryStyle('social')}
        >
          <div className="text-fg-muted mb-3 text-[13px]">{t('shared.preview')}</div>
          <div className="flex items-center gap-2.5">
            <div className="flex">
              <span className="border-bg flex size-9 items-center justify-center rounded-full border-2 bg-[#6b6d74] text-[15px] font-bold text-white">
                {(profile?.display_name ?? '?').trim().charAt(0)}
              </span>
              <span
                style={{
                  ...categoryStyle('academic'),
                  background: 'color-mix(in oklch, var(--cat) 40%, var(--pisga-card))',
                }}
                className="border-bg -me-2.5 flex size-9 items-center justify-center rounded-full border-2 text-[15px] font-bold text-[var(--cat)]"
              >
                {friend.displayName.trim().charAt(0)}
              </span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {profile?.display_name} {t('shared.and')} {friend.displayName.split(' ')[0]}
              </div>
              <div className="text-fg-muted mt-px text-xs">
                {lang === 'he' ? goal!.title_he : goal!.title_en} ·{' '}
                {t(DURATIONS.find((d) => d.days === days)!.labelKey)}
              </div>
            </div>
          </div>
          <div className="bg-line mt-3.5 h-[5px] overflow-hidden rounded-full">
            <div className="h-full w-0 bg-[var(--cat)]" />
          </div>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-center text-xs">
          {error}
        </p>
      ) : null}

      <PrimaryButton className="mt-auto" disabled={!ready || saving} onClick={() => void invite()}>
        {saving ? <Spinner className="border-on-brand/30 border-t-on-brand" /> : <PlusIcon size={18} />}
        {friend ? `${t('shared.invite')} ${friend.displayName.split(' ')[0]}` : t('shared.invite')}
      </PrimaryButton>
    </main>
  )
}
