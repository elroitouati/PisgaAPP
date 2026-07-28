import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'pisga.theme'

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type ResolvedTheme = 'light' | 'dark'

type ThemeValue = {
  preference: ThemePreference
  theme: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

export const ThemeContext = createContext<ThemeValue | null>(null)

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (THEME_PREFERENCES as readonly string[]).includes(stored)) {
      return stored as ThemePreference
    }
  } catch {
    /* storage blocked */
  }
  return 'system'
}

const prefersDark = () => window.matchMedia('(prefers-color-scheme: dark)')

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    prefersDark().matches ? 'dark' : 'light',
  )

  // Track the OS setting so 'system' keeps following it while the app is open.
  useEffect(() => {
    const media = prefersDark()
    const onChange = (event: MediaQueryListEvent) => setSystemTheme(event.matches ? 'dark' : 'light')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const theme: ResolvedTheme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // Match the page background exactly, or the OS draws a mismatched band
    // above the app. The markup ships one meta per colour scheme, so both are
    // collapsed to the resolved theme here.
    const resolved = theme === 'dark' ? '#0d0e10' : '#fbfbfa'
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      meta.removeAttribute('media')
      meta.setAttribute('content', resolved)
    }
  }, [theme])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage blocked — the choice just won't survive a reload */
    }
  }, [])

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
