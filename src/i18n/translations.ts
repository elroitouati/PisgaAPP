export const LANGUAGES = ['he', 'en'] as const
export type Lang = (typeof LANGUAGES)[number]

export const DEFAULT_LANG: Lang = 'he'

export const LANG_DIR: Record<Lang, 'rtl' | 'ltr'> = {
  he: 'rtl',
  en: 'ltr',
}

export const LANG_LABEL: Record<Lang, string> = {
  he: 'עברית',
  en: 'English',
}

const he = {
  'app.name': 'פסגה',
  'app.tagline': 'צעד קטן כל יום, עד לפסגה',

  'common.loading': 'טוען…',
  'common.retry': 'נסה שוב',
  'common.continue': 'המשך',
  'common.cancel': 'ביטול',
  'common.signOut': 'התנתקות',
  'common.language': 'שפה',
  'common.theme': 'ערכת נושא',
  'common.theme.light': 'בהיר',
  'common.theme.dark': 'כהה',
  'common.theme.system': 'לפי המכשיר',

  'auth.title': 'ברוכים הבאים לפסגה',
  'auth.subtitle': 'התחברו כדי להתחיל לעקוב אחרי המטרות שלכם',
  'auth.google': 'המשך עם Google',
  'auth.emailLabel': 'כתובת אימייל',
  'auth.emailPlaceholder': 'name@example.com',
  'auth.sendLink': 'שליחת קישור התחברות',
  'auth.sending': 'שולח…',
  'auth.linkSent': 'שלחנו לך קישור התחברות. בדקו את תיבת הדואר.',
  'auth.or': 'או',
  'auth.terms': 'בהתחברות אתם מאשרים את תנאי השימוש ומדיניות הפרטיות.',
  'auth.completing': 'משלים התחברות…',
  'auth.error.generic': 'ההתחברות נכשלה. נסו שוב.',
  'auth.error.invalidEmail': 'כתובת האימייל אינה תקינה.',

  'setup.title': 'חסרה הגדרת Supabase',
  'setup.body':
    'צרו קובץ .env.local על בסיס .env.example והזינו את VITE_SUPABASE_URL ואת VITE_SUPABASE_ANON_KEY.',

  'home.title': 'המטרות שלי',
  'home.placeholder': 'מסך הבית ייבנה לפי קובץ העיצוב המצורף.',

  'error.title': 'משהו השתבש',
  'error.body': 'אירעה שגיאה בלתי צפויה. רעננו את הדף כדי להמשיך.',
  'error.reload': 'רענון',

  'notFound.title': 'הדף לא נמצא',
  'notFound.back': 'חזרה לדף הבית',
} as const

export type TranslationKey = keyof typeof he

const en: Record<TranslationKey, string> = {
  'app.name': 'Pisga',
  'app.tagline': 'One small step a day, all the way to the summit',

  'common.loading': 'Loading…',
  'common.retry': 'Try again',
  'common.continue': 'Continue',
  'common.cancel': 'Cancel',
  'common.signOut': 'Sign out',
  'common.language': 'Language',
  'common.theme': 'Theme',
  'common.theme.light': 'Light',
  'common.theme.dark': 'Dark',
  'common.theme.system': 'System',

  'auth.title': 'Welcome to Pisga',
  'auth.subtitle': 'Sign in to start tracking your goals',
  'auth.google': 'Continue with Google',
  'auth.emailLabel': 'Email address',
  'auth.emailPlaceholder': 'name@example.com',
  'auth.sendLink': 'Send sign-in link',
  'auth.sending': 'Sending…',
  'auth.linkSent': 'We sent you a sign-in link. Check your inbox.',
  'auth.or': 'or',
  'auth.terms': 'By signing in you agree to the Terms of Service and Privacy Policy.',
  'auth.completing': 'Completing sign-in…',
  'auth.error.generic': 'Sign-in failed. Please try again.',
  'auth.error.invalidEmail': 'That email address is not valid.',

  'setup.title': 'Supabase is not configured',
  'setup.body':
    'Create a .env.local from .env.example and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',

  'home.title': 'My goals',
  'home.placeholder': 'The home screen will be built from the attached design file.',

  'error.title': 'Something went wrong',
  'error.body': 'An unexpected error occurred. Reload the page to continue.',
  'error.reload': 'Reload',

  'notFound.title': 'Page not found',
  'notFound.back': 'Back to home',
}

export const translations: Record<Lang, Record<TranslationKey, string>> = { he, en }
