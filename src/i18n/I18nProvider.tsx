import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DEFAULT_LANG,
  LANG_DIR,
  LANGUAGES,
  translations,
  type Lang,
  type TranslationKey,
} from './translations'

const STORAGE_KEY = 'pisga.lang'

type I18nValue = {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

// eslint-disable-next-line react-refresh/only-export-components
export const I18nContext = createContext<I18nValue | null>(null)

function readStoredLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && (LANGUAGES as readonly string[]).includes(stored)) return stored as Lang
  } catch {
    /* storage blocked */
  }
  return DEFAULT_LANG
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang)

  const dir = LANG_DIR[lang]

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* storage blocked — the choice just won't survive a reload */
    }
  }, [])

  const t = useCallback((key: TranslationKey) => translations[lang][key] ?? key, [lang])

  const value = useMemo(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
