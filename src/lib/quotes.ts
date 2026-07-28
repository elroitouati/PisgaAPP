import type { Category } from './categories'

/**
 * The daily motivational line (PRD 6.8). The list and its attributions were
 * supplied by the product owner.
 *
 * Each entry carries the category it belongs to, so the home screen can later
 * bias toward whatever the user picked in onboarding; today it simply rotates
 * through the whole list.
 *
 * ⚠ Three attributions below are contested and are marked `disputed`. They are
 * kept because the list is the owner's call, but the flag means they can be
 * swapped or dropped in one place rather than hunted for later.
 */
export type Quote = {
  he: string
  en: string
  authorHe: string
  authorEn: string
  /** null = general motivation, not tied to one category. */
  category: Category | null
  /** Set when the attribution is widely repeated but not reliably sourced. */
  disputed?: string
}

export const DAILY_QUOTES: Quote[] = [
  // ── גופני / התמדה ─────────────────────────────────────────────────────────
  {
    he: 'הגוף משיג את מה שהמוח מאמין בו.',
    en: 'The body achieves what the mind believes.',
    authorHe: 'נעם וודן',
    authorEn: 'Noam Woden',
    category: 'physical',
    disputed: 'The author name could not be matched to a known figure — worth double-checking.',
  },
  {
    he: 'הכאב זמני, הוויתור נצחי.',
    en: 'Pain is temporary. Quitting lasts forever.',
    authorHe: 'לאנס ארמסטרונג',
    authorEn: 'Lance Armstrong',
    category: 'physical',
  },
  {
    he: 'אלופים נבנים כשאף אחד לא מסתכל.',
    en: 'Champions are made when no one is watching.',
    authorHe: 'מוחמד עלי',
    authorEn: 'Muhammad Ali',
    category: 'physical',
    disputed: 'Ali’s documented line is about training away from witnesses; this wording circulates unsourced.',
  },
  {
    he: 'אל תספור ימים — תגרום לימים להיספר.',
    en: 'Don’t count the days, make the days count.',
    authorHe: 'מוחמד עלי',
    authorEn: 'Muhammad Ali',
    category: 'physical',
  },
  {
    he: 'הדבר היחיד העומד בינך לבין המטרה שלך הוא הסיפור שאתה מספר לעצמך.',
    en: 'The only thing standing between you and your goal is the story you keep telling yourself.',
    authorHe: 'ג׳ורדן בלפורט',
    authorEn: 'Jordan Belfort',
    category: 'physical',
  },

  // ── לימודי / צמיחה ────────────────────────────────────────────────────────
  {
    he: 'החינוך הוא הנשק החזק ביותר שאפשר להשתמש בו כדי לשנות את העולם.',
    en: 'Education is the most powerful weapon which you can use to change the world.',
    authorHe: 'נלסון מנדלה',
    authorEn: 'Nelson Mandela',
    category: 'academic',
  },
  {
    he: 'מי שמפסיק ללמוד הוא זקן, גם אם בגיל 20.',
    en: 'Anyone who stops learning is old, whether at twenty or eighty.',
    authorHe: 'הנרי פורד',
    authorEn: 'Henry Ford',
    category: 'academic',
  },
  {
    he: 'ההשקעה בידע משלמת את הריבית הטובה ביותר.',
    en: 'An investment in knowledge pays the best interest.',
    authorHe: 'בנג׳מין פרנקלין',
    authorEn: 'Benjamin Franklin',
    category: 'academic',
  },
  {
    he: 'לא נכשלתי. פשוט מצאתי 10,000 דרכים שלא עובדות.',
    en: 'I have not failed. I’ve just found 10,000 ways that won’t work.',
    authorHe: 'תומאס אדיסון',
    authorEn: 'Thomas Edison',
    category: 'academic',
  },
  {
    he: 'התפתחות היא בלתי אפשרית בלי שינוי, ומי שלא יכול לשנות את דעתו לא יכול לשנות כלום.',
    en: 'Progress is impossible without change, and those who cannot change their minds cannot change anything.',
    authorHe: 'ג׳ורג׳ ברנרד שו',
    authorEn: 'George Bernard Shaw',
    category: 'academic',
  },

  // ── חברתי / קשרים ─────────────────────────────────────────────────────────
  {
    he: 'אנשים ישכחו מה אמרת, ישכחו מה עשית, אבל לעולם לא ישכחו איך גרמת להם להרגיש.',
    en: 'People will forget what you said and what you did, but never how you made them feel.',
    authorHe: 'מאיה אנג׳לו',
    authorEn: 'Maya Angelou',
    category: 'social',
  },
  {
    he: 'לבד אנחנו יכולים לעשות כל כך מעט; יחד אנחנו יכולים לעשות כל כך הרבה.',
    en: 'Alone we can do so little; together we can do so much.',
    authorHe: 'הלן קלר',
    authorEn: 'Helen Keller',
    category: 'social',
  },
  {
    he: 'הדרך הכי טובה למצוא את עצמך היא לאבד את עצמך בשירות של אחרים.',
    en: 'The best way to find yourself is to lose yourself in the service of others.',
    authorHe: 'מהטמה גנדי',
    authorEn: 'Mahatma Gandhi',
    category: 'social',
  },
  {
    he: 'אנשים טובים מסביבך מרימים אותך גבוה יותר משאתה יכול להגיע לבד.',
    en: 'Surround yourself with people who are going to lift you higher.',
    authorHe: 'אופרה וינפרי',
    authorEn: 'Oprah Winfrey',
    category: 'social',
  },

  // ── אישי / הרגלים ומשמעת עצמית ────────────────────────────────────────────
  {
    he: 'אנחנו מה שאנחנו עושים שוב ושוב. מצוינות, אם כך, היא לא מעשה אלא הרגל.',
    en: 'We are what we repeatedly do. Excellence, then, is not an act but a habit.',
    authorHe: 'אריסטו',
    authorEn: 'Aristotle',
    category: 'personal',
    disputed:
      'Written by Will Durant in The Story of Philosophy (1926), summarising Aristotle — the words are Durant’s.',
  },
  {
    he: 'המסע של אלף מייל מתחיל בצעד אחד.',
    en: 'The journey of a thousand miles begins with a single step.',
    authorHe: 'לאו דזה',
    authorEn: 'Lao Tzu',
    category: 'personal',
  },
  {
    he: 'אתה לא צריך להיות גדול כדי להתחיל, אבל אתה צריך להתחיל כדי להיות גדול.',
    en: 'You don’t have to be great to start, but you have to start to be great.',
    authorHe: 'זיג זיגלר',
    authorEn: 'Zig Ziglar',
    category: 'personal',
  },
  {
    he: 'המחר שייך לאלה שמתכוננים לו היום.',
    en: 'The future belongs to those who prepare for it today.',
    authorHe: 'מלקולם X',
    authorEn: 'Malcolm X',
    category: 'personal',
  },
  {
    he: 'משמעת היא הגשר בין מטרות להישגים.',
    en: 'Discipline is the bridge between goals and accomplishment.',
    authorHe: 'ג׳ים רון',
    authorEn: 'Jim Rohn',
    category: 'personal',
  },
  {
    he: 'אל תחכה. הזמן לעולם לא יהיה בדיוק נכון.',
    en: 'Don’t wait. The time will never be just right.',
    authorHe: 'נפוליאון היל',
    authorEn: 'Napoleon Hill',
    category: 'personal',
  },

  // ── מוטיבציה כללית ────────────────────────────────────────────────────────
  {
    he: 'הדרך היחידה לעשות עבודה נהדרת היא לאהוב את מה שאתה עושה.',
    en: 'The only way to do great work is to love what you do.',
    authorHe: 'סטיב ג׳ובס',
    authorEn: 'Steve Jobs',
    category: null,
  },
  {
    he: 'הצלחה היא לא סופית, כישלון הוא לא קטלני: מה שחשוב זה האומץ להמשיך.',
    en: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
    authorHe: 'וינסטון צ׳רצ׳יל',
    authorEn: 'Winston Churchill',
    category: null,
  },
  {
    he: 'תאמין שאתה יכול, ואתה כבר באמצע הדרך.',
    en: 'Believe you can and you’re halfway there.',
    authorHe: 'תיאודור רוזוולט',
    authorEn: 'Theodore Roosevelt',
    category: null,
  },
  {
    he: 'עתידך נקבע ממה שאתה עושה היום, לא ממחר.',
    en: 'Your future is created by what you do today, not tomorrow.',
    authorHe: 'רוברט קיוסאקי',
    authorEn: 'Robert Kiyosaki',
    category: null,
  },
  {
    he: 'הדרך הטובה ביותר לחזות את העתיד היא ליצור אותו.',
    en: 'The best way to predict the future is to create it.',
    authorHe: 'אברהם לינקולן',
    authorEn: 'Abraham Lincoln',
    category: null,
    disputed:
      'No record of Lincoln saying this; it is usually traced to Dennis Gabor or Alan Kay in the 20th century.',
  },
]

/**
 * The same quote for everyone on a given day, rotating through the list. Keyed
 * off the local calendar day so it changes at the user's midnight, not UTC's.
 */
export function quoteOfTheDay(date = new Date()): Quote {
  const dayIndex = Math.floor(
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() / 86_400_000,
  )
  return DAILY_QUOTES[dayIndex % DAILY_QUOTES.length]
}
