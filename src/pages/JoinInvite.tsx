import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '@/i18n/useI18n'
import { useAuth } from '@/providers/useAuth'
import { useProfile } from '@/providers/useProfile'
import { fetchInvitePreview, redeemInvite, type InvitePreview } from '@/lib/api'
import type { Profile } from '@/types/db'
import { CheckIcon, MailIcon } from '@/components/icons'
import { PrimaryButton } from '@/components/ui'
import { Spinner } from '@/components/Spinner'
import { categoryStyle } from '@/lib/categories'

export const PENDING_INVITE_KEY = 'pisga.pendingInvite'

type State =
  | { kind: 'loading' }
  | { kind: 'preview'; inviter: InvitePreview | null }
  | { kind: 'redeemed'; inviter: Profile }
  | { kind: 'error'; message: string }

/**
 * Designs 8m/8n (already signed in) and 8o/8p (brand-new visitor). One route,
 * `/join/:token`, outside the protected app shell — a signed-out visitor has
 * to see who is inviting them before any auth happens at all.
 */
export default function JoinInvite() {
  const { token } = useParams<{ token: string }>()
  const { t } = useI18n()
  const { session, signInWithGoogle } = useAuth()
  const { profile } = useProfile()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!token) return
    localStorage.setItem(PENDING_INVITE_KEY, token)

    let active = true
    async function run() {
      if (session) {
        try {
          const inviter = await redeemInvite(token!)
          localStorage.removeItem(PENDING_INVITE_KEY)
          if (active) setState({ kind: 'redeemed', inviter })
        } catch (caught) {
          localStorage.removeItem(PENDING_INVITE_KEY)
          if (active) {
            setState({
              kind: 'error',
              message: caught instanceof Error ? caught.message : t('join.invalid'),
            })
          }
        }
      } else {
        const inviter = await fetchInvitePreview(token!).catch(() => null)
        if (active) setState({ kind: 'preview', inviter })
      }
    }
    void run()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session])

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3">
        <Spinner className="size-7" />
        <p className="text-fg-muted text-sm">{t('join.loading')}</p>
      </main>
    )
  }

  if (state.kind === 'error') {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-fg-muted text-sm">{state.message}</p>
        <PrimaryButton className="px-6" onClick={() => navigate('/')}>
          {t('join.backToApp')}
        </PrimaryButton>
      </main>
    )
  }

  if (state.kind === 'redeemed') {
    return (
      <main
        style={categoryStyle('physical')}
        className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-5.5 px-[26px]"
      >
        <div className="flex size-16 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--cat)_16%,var(--color-surface))] text-[var(--cat)]">
          <CheckIcon size={30} strokeWidth={2.4} />
        </div>
        <div className="flex items-center justify-center">
          <Avatar name={profile?.display_name ?? ''} url={profile?.avatar_url} />
          <span className="-me-3.5">
            <Avatar name={state.inviter.display_name ?? ''} url={state.inviter.avatar_url} tint />
          </span>
        </div>
        <div className="-mt-1 text-center">
          <div className="text-[21px] font-bold">
            {state.inviter.display_name} {t('join.invitedYouSuffix')}
          </div>
          <p className="text-fg-muted mt-2 text-[14.5px] leading-relaxed whitespace-pre-line">
            {t('join.becameFriends')}
          </p>
        </div>
        <PrimaryButton className="mt-2 w-full" onClick={() => navigate('/')}>
          {t('join.backToApp')}
        </PrimaryButton>
      </main>
    )
  }

  const inviter = state.inviter

  if (!inviter) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-fg-muted text-sm">{t('join.invalid')}</p>
        <PrimaryButton className="px-6" onClick={() => navigate('/login')}>
          {t('auth.signIn')}
        </PrimaryButton>
      </main>
    )
  }

  const name = inviter.display_name ?? ''

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-[26px] py-16">
      <div className="flex flex-shrink-0 flex-col items-center gap-3.5">
        <Avatar name={name} url={inviter?.avatar_url} tint />
        <div className="text-center">
          <div className="text-[19px] font-bold">
            {name} {t('join.invitesYouSuffix')}
          </div>
          <p className="text-fg-muted mt-1.5 max-w-[280px] text-[13.5px] leading-relaxed">
            {t('join.inviteBody')}
          </p>
        </div>
      </div>

      <div className="my-5.5 flex flex-1 flex-col justify-center gap-[11px]">
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="bg-brand text-on-brand flex h-13 items-center justify-center gap-2.5 rounded-[14px] text-[15px] font-semibold"
        >
          <span className="bg-on-brand text-brand flex size-[22px] items-center justify-center rounded-full text-sm font-bold">
            G
          </span>
          {t('auth.google')}
        </button>
        <button
          type="button"
          onClick={() =>
            navigate('/login', { state: { from: { pathname: `/join/${token}` } } })
          }
          className="border-line text-fg flex h-13 items-center justify-center gap-2.5 rounded-[14px] border text-[15px] font-semibold"
        >
          <MailIcon size={19} />
          {t('auth.email')}
        </button>
      </div>

      <p className="text-fg-subtle flex-shrink-0 text-center text-[11.5px] leading-relaxed">
        {name} {t('join.autoFriendSuffix')}
      </p>
    </main>
  )
}

function Avatar({ name, url, tint = false }: { name: string; url?: string | null; tint?: boolean }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        className={`border-bg size-13 flex-none rounded-full border-[3px] object-cover ${tint ? '' : ''}`}
      />
    )
  }
  return (
    <div
      style={tint ? categoryStyle('academic') : undefined}
      className={`border-bg flex size-13 flex-none items-center justify-center rounded-full border-[3px] text-[19px] font-bold ${
        tint
          ? 'bg-[color-mix(in_oklch,var(--cat)_40%,var(--color-surface))] text-[var(--cat)]'
          : 'bg-fg-subtle text-bg'
      }`}
    >
      {name.trim().charAt(0) || '?'}
    </div>
  )
}
