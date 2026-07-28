import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'
import { redeemInvite } from '@/lib/api'
import { PENDING_INVITE_KEY } from '@/pages/JoinInvite'

/**
 * The phone-width column every signed-in screen lives in. Padding matches the
 * handoff frame: 52px above the header, 92px below to clear the bottom bar.
 */
export function AppShell() {
  // Google's redirect always lands on /auth/callback → "/", never back on
  // /join/:token, so a Google sign-up started from the join landing page
  // would otherwise never redeem the link. This catches that one path;
  // email sign-up already returns straight to /join/:token on its own.
  useEffect(() => {
    const token = localStorage.getItem(PENDING_INVITE_KEY)
    if (!token) return
    localStorage.removeItem(PENDING_INVITE_KEY)
    void redeemInvite(token).catch(() => {
      /* own link, already friends, or revoked — nothing to surface here */
    })
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
      <div
        className="flex flex-1 flex-col px-[22px] pt-13 pb-23"
        style={{ paddingTop: 'calc(3.25rem + env(safe-area-inset-top))' }}
      >
        <Outlet />
      </div>
      <BottomNav />
    </div>
  )
}
