import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/useAuth'

const CHANNEL = 'pisga-presence'

/**
 * Who is in the app right now, via Supabase Realtime presence — the green dot
 * in designs 4c and 7a/7b.
 *
 * Presence tells your friends when you have the app open, so it is opt-out:
 * `pisga.presence` set to 'off' skips tracking entirely. You still see others;
 * you just stop broadcasting yourself, which is the honest reading of "I don't
 * want to advertise that I'm online".
 *
 * The channel unsubscribes on unmount and on pagehide, so closing the tab does
 * not leave a stale "online" behind.
 */
export function usePresence() {
  const { user } = useAuth()
  const [online, setOnline] = useState<Set<string>>(new Set())
  const sharing = useRef(readSharing())

  useEffect(() => {
    if (!user) return

    const channel = supabase.channel(CHANNEL, {
      config: { presence: { key: user.id } },
    })

    const sync = () => {
      const state = channel.presenceState()
      setOnline(new Set(Object.keys(state)))
    }

    channel
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && sharing.current) {
          void channel.track({ at: new Date().toISOString() })
        }
      })

    const leave = () => void supabase.removeChannel(channel)
    window.addEventListener('pagehide', leave)

    return () => {
      window.removeEventListener('pagehide', leave)
      leave()
    }
  }, [user])

  return {
    /** Excludes yourself — you are never shown your own dot. */
    isOnline: (userId: string) => userId !== user?.id && online.has(userId),
    sharingPresence: sharing.current,
  }
}

function readSharing(): boolean {
  try {
    return localStorage.getItem('pisga.presence') !== 'off'
  } catch {
    return true
  }
}

export function setPresenceSharing(enabled: boolean) {
  try {
    localStorage.setItem('pisga.presence', enabled ? 'on' : 'off')
  } catch {
    /* storage blocked */
  }
}
