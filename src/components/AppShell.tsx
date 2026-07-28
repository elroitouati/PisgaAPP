import { Outlet } from 'react-router-dom'
import { BottomNav } from './BottomNav'

/**
 * The phone-width column every signed-in screen lives in. Padding matches the
 * handoff frame: 52px above the header, 92px below to clear the bottom bar.
 */
export function AppShell() {
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
