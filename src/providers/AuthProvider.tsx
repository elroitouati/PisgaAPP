import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

type AuthValue = {
  session: Session | null
  user: User | null
  /** True until the initial session lookup resolves — gate routing on this. */
  initializing: boolean
  signInWithGoogle: () => Promise<void>
  signInWithPassword: (email: string, password: string) => Promise<void>
  /** Resolves to true when Supabase still needs the address confirmed. */
  signUpWithPassword: (email: string, password: string, displayName: string) => Promise<boolean>
  /**
   * Completes signup with the 6-digit code from the confirmation email,
   * instead of the link in that same email.
   *
   * The link depends on Supabase's redirect landing back inside this app —
   * on native that means either a Universal/App Link (a real domain, none
   * of which exists yet) or a custom URL scheme (a further round of native
   * config plus a Supabase redirect-URL allowlist entry, neither shippable
   * tonight). A typed code has no such dependency: it is one REST call,
   * identical on web and native, and matches what the app already asks
   * for on the calibration and check-in screens elsewhere.
   */
  verifySignupCode: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setInitializing(false)
      return
    }

    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setSession(data.session)
      })
      .finally(() => {
        if (active) setInitializing(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
    if (error) throw error
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUpWithPassword = useCallback(
    async (email: string, password: string, displayName: string) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Read by the handle_new_user trigger to seed the profile row.
          data: { display_name: displayName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) throw error
      // With email confirmation on, Supabase returns a user but no session.
      return !data.session
    },
    [],
  )

  const verifySignupCode = useCallback(async (email: string, code: string) => {
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
    if (error) throw error
    // onAuthStateChange picks up the resulting session; nothing else to do.
  }, [])

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signInWithGoogle,
      signInWithPassword,
      signUpWithPassword,
      verifySignupCode,
      signOut,
    }),
    [
      session,
      initializing,
      signInWithGoogle,
      signInWithPassword,
      signUpWithPassword,
      verifySignupCode,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
