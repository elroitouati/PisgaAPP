/**
 * Emits supabase/migrations/0011_seed_structured_goals.sql from the 80 goals
 * of Pisga_Goals_Library_v1.md section 9.
 *
 * Written as a generator rather than 80 hand-typed INSERTs so the shared
 * conventions below are applied uniformly — the document states L1 and the
 * level step in mixed units ("3×5", "±2 לסט", "2×1.5 ק״מ"), and resolving
 * that by hand 80 times is how a seed picks up silent inconsistencies.
 *
 * Usage: node scripts/generate-goals-seed.mjs
 */
import { writeFileSync } from 'node:fs'

// ── Conventions ─────────────────────────────────────────────────────────────
//
// 1. level_1_value and level_step are BOTH expressed in the goal's own
//    metric_key unit. The engine's level_multiplier is current ÷ record, so
//    the two numbers have to share a unit or the ratio is meaningless.
//    Where the document writes "3×5 · ±2 לסט", the sets are fixed at 3, so
//    that becomes L1 = 15 reps/day and step = 6 reps/day.
// 2. verification_allowed always contains verification_default, and never
//    contains V0 (section 5: V0 is not an alternative for a structured goal).
// 3. Composite verification ("V1+V6") is stored as the primary method plus
//    the second as an allowed alternative. The ×0.1 composite bonus of
//    section 5 is applied per completion, where both methods are actually
//    known to have been used, not baked into the library row.
// 4. The legacy `verification` enum from 0001 is filled from a fixed map so
//    the pre-existing screens keep rendering these goals until they move to
//    verification_code.

const LEGACY_VERIFICATION = {
  V1: 'guided_session',
  V2: 'sensor_sync',
  V3: 'guided_session',
  V4: 'daily_checkin',
  V5: 'checkbox_reflection',
  V6: 'checkbox_reflection',
  V7: 'guided_session',
  V8: 'checkbox_reflection',
}

/** Sensible alternatives per subcategory, from the section 8 inheritance table. */
const ALTERNATIVES = {
  V1: ['V6'],
  V2: ['V1', 'V6'],
  V3: ['V1'],
  V4: ['V7'],
  V5: ['V6'],
  V6: ['V5'],
  V7: ['V1'],
  V8: ['V6'],
}

// code, title_he, title_en, subcategory, metric_key, metric_unit, direction,
// ceiling, BP, L1, step, default V, [extra allowed V], questions, widget, window
const GOALS = [
  // ── 9.1 גופני (P) ─────────────────────────────────────────────────────────
  ['P-01', 'שכיבות סמיכה', 'Push-ups', 'כוח', 'reps_per_day', 'חזרות', 'up', null, 24, 15, 6, 'V3', [], ['Q1','Q2','Q4'], null],
  ['P-02', 'מתח', 'Pull-ups', 'כוח', 'reps_per_day', 'חזרות', 'up', null, 30, 6, 3, 'V3', [], ['Q1','Q2','Q6'], null],
  ['P-03', 'סקוואט משקל גוף', 'Bodyweight squats', 'כוח', 'reps_per_day', 'חזרות', 'up', null, 20, 30, 9, 'V3', [], ['Q1','Q2'], null],
  ['P-04', 'פלאנק', 'Plank', 'ליבה', 'seconds_per_day', 'שניות', 'up', null, 20, 60, 30, 'V1', [], ['Q1','Q2'], null],
  ['P-05', 'כפיפות בטן', 'Sit-ups', 'ליבה', 'reps_per_day', 'חזרות', 'up', null, 16, 30, 15, 'V3', [], ['Q1','Q2'], null],
  ['P-06', 'אימון כוח בחדר כושר', 'Gym strength session', 'כוח', 'sessions_per_week', 'אימונים', 'up', null, 36, 2, 1, 'V1', ['V6'], ['Q1','Q2','Q6'], null],
  ['P-07', 'ריצה', 'Running', 'סבולת', 'km_per_week', 'ק״מ', 'up', null, 36, 3, 1, 'V2', [], ['Q1','Q2','Q5'], 'gps_route'],
  ['P-08', 'הליכה יומית', 'Daily walking', 'סבולת', 'steps_per_day', 'צעדים', 'up', null, 16, 5000, 1000, 'V2', [], ['Q1','Q3'], 'steps_ring'],
  ['P-09', 'רכיבה על אופניים', 'Cycling', 'סבולת', 'km_per_week', 'ק״מ', 'up', null, 30, 10, 3, 'V2', [], ['Q1','Q2'], 'gps_route'],
  ['P-10', 'שחייה', 'Swimming', 'סבולת', 'meters_per_session', 'מטרים', 'up', null, 32, 200, 100, 'V1', ['V6'], ['Q1','Q2','Q6'], null],
  ['P-11', 'חבל קפיצה', 'Jump rope', 'סבולת', 'minutes_per_day', 'דקות', 'up', null, 20, 3, 1, 'V1', [], ['Q1','Q2'], null],
  ['P-12', 'אינטרוולים / HIIT', 'Intervals / HIIT', 'סבולת', 'rounds_per_session', 'סבבים', 'up', null, 32, 4, 2, 'V1', [], ['Q1','Q2','Q4'], null],
  ['P-13', 'מתיחות בוקר', 'Morning stretches', 'גמישות', 'minutes_per_day', 'דקות', 'up', null, 12, 5, 2, 'V1', [], ['Q2','Q3'], null],
  ['P-14', 'יוגה / ניידות', 'Yoga / mobility', 'גמישות', 'minutes_per_session', 'דקות', 'up', null, 20, 10, 5, 'V1', [], ['Q1','Q2'], null],
  ['P-15', 'שתיית מים', 'Drinking water', 'תזונה', 'cups_per_day', 'כוסות', 'up', 12, 12, 5, 1, 'V3', [], ['Q1','Q3'], 'water_cups'],
  ['P-16', 'ארוחה מתוכננת עם חלבון', 'Planned protein meal', 'תזונה', 'meals_per_day', 'ארוחות', 'up', null, 20, 1, 1, 'V6', [], ['Q1','Q2'], null],
  ['P-17', 'שעות שינה', 'Hours of sleep', 'שינה', 'hours_per_night', 'שעות', 'up', 8.5, 20, 6.5, 0.5, 'V2', [], ['Q1','Q3'], 'sleep_bar'],
  ['P-18', 'שעת השכמה קבועה', 'Fixed wake-up time', 'שינה', 'days_per_week', 'ימים', 'up', 7, 16, 4, 1, 'V4', [], ['Q3','Q2'], null],
  ['P-19', 'הימנעות מסוכר / ג׳אנק', 'Avoiding sugar / junk food', 'הימנעות', 'clean_days_per_week', 'ימים', 'up', 7, 24, 3, 1, 'V4', [], ['Q7','Q4'], null],
  ['P-20', 'הימנעות מעישון / אלכוהול', 'Avoiding smoking / alcohol', 'הימנעות', 'clean_days_streak', 'ימים', 'up', null, 30, 3, 1, 'V4', [], ['Q7','Q4'], null],

  // ── 9.2 לימודי (A) ────────────────────────────────────────────────────────
  ['A-01', 'סשן פוקוס (פומודורו)', 'Focus session (pomodoro)', 'זמן מרוכז', 'sessions_per_day', 'סשנים', 'up', null, 16, 2, 1, 'V7', [], ['Q1','Q3'], null],
  ['A-02', 'שעות למידה', 'Study hours', 'זמן מרוכז', 'minutes_per_day', 'דקות', 'up', null, 24, 45, 15, 'V7', [], ['Q1','Q2','Q3'], null],
  ['A-03', 'פתרון תרגילים', 'Solving exercises', 'תרגול', 'exercises_per_day', 'תרגילים', 'up', null, 20, 5, 2, 'V8', [], ['Q1','Q2'], null],
  ['A-04', 'מבחן משנים קודמות', 'Past exam paper', 'תרגול', 'tests_per_week', 'מבחנים', 'up', null, 40, 1, 1, 'V1', ['V8'], ['Q1','Q5'], null],
  ['A-05', 'חזרה בכרטיסיות', 'Spaced repetition', 'שינון', 'cards_per_day', 'כרטיסים', 'up', null, 16, 20, 10, 'V8', [], ['Q1','Q3'], null],
  ['A-06', 'אוצר מילים בשפה זרה', 'Foreign language vocabulary', 'שינון', 'words_per_day', 'מילים', 'up', null, 16, 5, 5, 'V8', [], ['Q1','Q6'], null],
  ['A-07', 'קריאת ספר עיוני', 'Reading non-fiction', 'קריאה', 'pages_per_day', 'עמודים', 'up', null, 16, 10, 5, 'V1', [], ['Q1','Q3'], null],
  ['A-08', 'ספר ספרות בחודש', 'A novel a month', 'קריאה', 'books_per_month', 'ספרים', 'up', null, 20, 1, 1, 'V5', [], ['Q1','Q5'], null, 'month'],
  ['A-09', 'קריאת מאמר אקדמי', 'Reading an academic paper', 'קריאה', 'articles_per_week', 'מאמרים', 'up', null, 24, 1, 1, 'V5', [], ['Q1','Q2'], null],
  ['A-10', 'סיכום שיעור / פרק', 'Lesson / chapter summary', 'תוצרים', 'summaries_per_week', 'סיכומים', 'up', null, 24, 2, 1, 'V8', [], ['Q1','Q2'], null],
  ['A-11', 'נוכחות בשיעורים', 'Class attendance', 'משמעת', 'attendance_pct', 'אחוז', 'up', 100, 16, 70, 10, 'V6', [], ['Q2','Q4'], null],
  ['A-12', 'מסירת מטלות לפני הזמן', 'Submitting work early', 'משמעת', 'days_before_deadline', 'ימים', 'up', null, 20, 1, 1, 'V5', [], ['Q4','Q5'], null],
  ['A-13', 'תרגול כלי נגינה', 'Instrument practice', 'מיומנות', 'minutes_per_day', 'דקות', 'up', null, 20, 15, 5, 'V1', [], ['Q1','Q3'], null],
  ['A-14', 'תרגול קוד / commit יומי', 'Daily code commit', 'מיומנות', 'commit_days_per_week', 'ימים', 'up', 7, 24, 3, 1, 'V8', [], ['Q1','Q2'], null],
  ['A-15', 'קורס אונליין', 'Online course', 'מיומנות', 'lessons_per_week', 'שיעורים', 'up', null, 16, 3, 1, 'V1', [], ['Q1','Q5'], null],
  ['A-16', 'תרגול דיבור בשפה זרה', 'Speaking practice', 'מיומנות', 'minutes_per_day', 'דקות', 'up', null, 24, 5, 5, 'V1', ['V6'], ['Q1','Q6'], null],
  ['A-17', 'כתיבה אקדמית / מחקרית', 'Academic writing', 'תוצרים', 'words_per_day', 'מילים', 'up', null, 24, 200, 100, 'V8', [], ['Q1','Q3'], null],
  ['A-18', 'סקירת הערות בסוף היום', 'End-of-day notes review', 'משמעת', 'days_per_week', 'ימים', 'up', 7, 12, 3, 1, 'V5', [], ['Q2','Q3'], null],
  ['A-19', 'הימנעות מטלפון בזמן למידה', 'Phone-free study', 'הימנעות', 'clean_sessions_per_day', 'סשנים', 'up', null, 24, 1, 1, 'V7', [], ['Q7','Q4'], null],
  ['A-20', 'הצפרדע קודם', 'Eat the frog first', 'הימנעות', 'days_per_week', 'ימים', 'up', 7, 24, 3, 1, 'V5', [], ['Q4','Q3'], null],

  // ── 9.3 חברתי (S) ─────────────────────────────────────────────────────────
  ['S-01', 'שיחה עם הורים / סבים', 'Call parents / grandparents', 'קשרים קרובים', 'calls_per_week', 'שיחות', 'up', null, 16, 2, 1, 'V5', [], ['Q1','Q3'], null],
  ['S-02', 'שיחת עומק עם חבר', 'Deep conversation with a friend', 'קשרים קרובים', 'conversations_per_week', 'שיחות', 'up', null, 20, 1, 1, 'V5', ['V1'], ['Q1','Q2'], null],
  ['S-03', 'מפגש פנים אל פנים', 'Face-to-face meetup', 'קשרים קרובים', 'meetings_per_week', 'מפגשים', 'up', null, 24, 1, 1, 'V5', [], ['Q1','Q4'], null],
  ['S-04', 'חידוש קשר שנשכח', 'Reconnecting with someone', 'הרחבת מעגלים', 'people_per_week', 'אנשים', 'up', null, 20, 1, 1, 'V5', [], ['Q1','Q4'], null],
  ['S-05', 'הכרת אדם חדש', 'Meeting someone new', 'הרחבת מעגלים', 'people_per_week', 'אנשים', 'up', null, 30, 1, 1, 'V5', [], ['Q4','Q6'], null],
  ['S-06', 'פעילות קבוצתית / חוג', 'Group activity / class', 'הרחבת מעגלים', 'meetings_per_week', 'מפגשים', 'up', null, 24, 1, 1, 'V5', [], ['Q1','Q6'], null],
  ['S-07', 'יזימת מפגש קבוצתי', 'Organising a get-together', 'מנהיגות חברתית', 'initiatives_per_month', 'יזימות', 'up', null, 30, 1, 1, 'V5', [], ['Q1','Q4'], null, 'month'],
  ['S-08', 'התנדבות', 'Volunteering', 'נתינה', 'hours_per_week', 'שעות', 'up', null, 40, 1, 1, 'V6', [], ['Q1','Q6'], null],
  ['S-09', 'עזרה קונקרטית למישהו', 'Concretely helping someone', 'נתינה', 'times_per_week', 'פעמים', 'up', null, 20, 2, 1, 'V5', [], ['Q1'], null],
  ['S-10', 'מחמאה / הכרת תודה', 'A compliment / thank-you', 'תקשורת', 'times_per_day', 'פעמים', 'up', null, 10, 1, 1, 'V5', [], ['Q2','Q3'], null],
  ['S-11', 'הודעת הערכה', 'Appreciation message', 'תקשורת', 'messages_per_week', 'הודעות', 'up', null, 10, 2, 1, 'V5', [], ['Q2'], null],
  ['S-12', 'שיחה ללא טלפון', 'Phone-free conversation', 'תקשורת', 'conversations_per_day', 'שיחות', 'up', null, 16, 1, 1, 'V5', [], ['Q2','Q4'], null],
  ['S-13', 'דיבור מול קהל', 'Public speaking', 'תקשורת', 'times_per_month', 'פעמים', 'up', null, 36, 1, 1, 'V6', [], ['Q1','Q4'], null, 'month'],
  ['S-14', 'שיחה קשה / פתרון קונפליקט', 'A hard conversation', 'תקשורת', 'times_per_month', 'פעמים', 'up', null, 36, 1, 1, 'V5', [], ['Q4'], null, 'month'],
  ['S-15', 'ארוחה משפחתית ללא מסכים', 'Screen-free family meal', 'קשרים קרובים', 'meals_per_week', 'ארוחות', 'up', null, 20, 2, 1, 'V5', [], ['Q2','Q3'], null],
  ['S-16', 'זמן איכות עם בן/בת זוג', 'Quality time with a partner', 'קשרים קרובים', 'minutes_per_day', 'דקות', 'up', null, 20, 20, 10, 'V5', [], ['Q1','Q3'], null],
  ['S-17', 'זמן עם אחים / משפחה', 'Time with siblings / family', 'קשרים קרובים', 'times_per_week', 'פעמים', 'up', null, 16, 2, 1, 'V5', [], ['Q2'], null],
  ['S-18', 'מפגש קהילה / שכונה', 'Community meetup', 'הרחבת מעגלים', 'times_per_month', 'פעמים', 'up', null, 20, 1, 1, 'V5', [], ['Q1','Q6'], null, 'month'],
  ['S-19', 'הימנעות מרשתות חברתיות', 'Limiting social media', 'גבולות', 'minutes_per_day', 'דקות', 'down', null, 24, 90, 15, 'V7', [], ['Q7','Q5'], 'screen_time'],
  ['S-20', 'הימנעות מדיבור רע על אחרים', 'No gossip', 'גבולות', 'clean_days_per_week', 'ימים', 'up', 7, 20, 3, 1, 'V4', [], ['Q7','Q4'], null],

  // ── 9.4 אישי (I) ──────────────────────────────────────────────────────────
  ['I-01', 'מדיטציה', 'Meditation', 'מיינדפולנס', 'minutes_per_day', 'דקות', 'up', null, 16, 5, 2, 'V1', [], ['Q1','Q3'], null],
  ['I-02', 'יומן הכרת תודה', 'Gratitude journal', 'מיינדפולנס', 'days_per_week', 'ימים', 'up', 7, 12, 3, 1, 'V5', [], ['Q2','Q3'], null],
  ['I-03', 'כתיבה ביומן אישי', 'Personal journalling', 'מיינדפולנס', 'days_per_week', 'ימים', 'up', 7, 16, 3, 1, 'V5', [], ['Q2','Q3'], null],
  ['I-04', 'תרגול נשימות ברגעי לחץ', 'Breathing exercises', 'מיינדפולנס', 'times_per_day', 'פעמים', 'up', null, 12, 1, 1, 'V1', [], ['Q2','Q4'], null],
  ['I-05', 'תכנון היום בבוקר', 'Morning day-planning', 'סדר וארגון', 'days_per_week', 'ימים', 'up', 7, 16, 4, 1, 'V5', [], ['Q2','Q3'], null],
  ['I-06', 'סידור החדר / הבית', 'Tidying up', 'סדר וארגון', 'times_per_week', 'פעמים', 'up', null, 16, 2, 1, 'V6', [], ['Q2','Q6'], null],
  ['I-07', 'תיבת דואר / משימות נקייה', 'Inbox zero', 'סדר וארגון', 'days_per_week', 'ימים', 'up', 7, 16, 3, 1, 'V6', [], ['Q2','Q3'], null],
  ['I-08', 'רישום הוצאות', 'Expense tracking', 'כספים', 'days_per_week', 'ימים', 'up', 7, 16, 4, 1, 'V8', [], ['Q2','Q3'], null],
  ['I-09', 'חיסכון שבועי', 'Weekly saving', 'כספים', 'shekels_per_week', '₪', 'up', null, 24, 50, 25, 'V8', [], ['Q1','Q5'], 'savings_jar'],
  ['I-10', 'הימנעות מקנייה אימפולסיבית', 'No impulse buying', 'כספים', 'clean_days_per_week', 'ימים', 'up', 7, 20, 4, 1, 'V4', [], ['Q7','Q4'], null],
  ['I-11', 'תרגול תחביב מוזיקלי', 'Musical hobby practice', 'יצירה', 'minutes_per_day', 'דקות', 'up', null, 20, 15, 5, 'V1', [], ['Q1','Q3'], null],
  ['I-12', 'ציור / יצירה', 'Drawing / making', 'יצירה', 'times_per_week', 'פעמים', 'up', null, 20, 2, 1, 'V6', [], ['Q1','Q2'], null],
  ['I-13', 'כתיבה יוצרת', 'Creative writing', 'יצירה', 'words_per_day', 'מילים', 'up', null, 20, 200, 100, 'V8', [], ['Q1','Q3'], null],
  ['I-14', 'בישול ארוחה מאפס', 'Cooking from scratch', 'יצירה', 'meals_per_week', 'ארוחות', 'up', null, 20, 2, 1, 'V6', [], ['Q1','Q2'], null],
  ['I-15', 'ללא מסכים לפני השינה', 'No screens before bed', 'הרגלים', 'days_per_week', 'ימים', 'up', 7, 20, 3, 1, 'V4', [], ['Q3','Q7'], null],
  ['I-16', 'זמן מסך יומי', 'Daily screen time', 'הרגלים', 'minutes_per_day', 'דקות', 'down', null, 24, 180, 20, 'V7', [], ['Q7','Q5'], 'screen_time'],
  ['I-17', 'קימה בלי סנוז', 'Waking without snoozing', 'הרגלים', 'days_per_week', 'ימים', 'up', 7, 16, 3, 1, 'V4', [], ['Q3','Q4'], null],
  ['I-18', 'אור שמש / טבע בבוקר', 'Morning daylight', 'הרגלים', 'minutes_per_day', 'דקות', 'up', null, 16, 10, 5, 'V2', [], ['Q2','Q3'], null],
  ['I-19', 'למידת מיומנות חדשה', 'Learning a new skill', 'צמיחה', 'milestones_per_month', 'אבני דרך', 'up', null, 40, 1, 1, 'V8', [], ['Q1','Q5','Q6'], null, 'month'],
  ['I-20', 'כיבוי מכשירים בשעה קבועה', 'Devices off at a fixed time', 'הרגלים', 'days_per_week', 'ימים', 'up', 7, 20, 3, 1, 'V4', [], ['Q3','Q7'], null],
]

const CATEGORY_OF = { P: 'physical', A: 'academic', S: 'social', I: 'personal' }
const SORT_BASE = { P: 100, A: 200, S: 300, I: 400 }

/**
 * How many performances of a metric make up one week, for the purpose of the
 * baseline floor.
 *
 * Section 3.3 does this conversion explicitly — "L1 = 15/day → 105/week" —
 * because weekly_metrics.total_value is a weekly sum while level_1_value is
 * stated per performance. Comparing the two directly would floor a weekly
 * total at a daily number, which is a floor of practically zero: a beginner's
 * delta would go unsoftened and one extra rep would outscore everyone.
 *
 * Only per-day and per-night metrics scale. A metric already stated per week
 * or per month is its own floor, and a per-session metric has no fixed
 * weekly count (that is what Q2 asks the user), so it stays conservative.
 */
function weeklyFloor(metricKey, l1) {
  return /_per_(day|night)$/.test(metricKey) ? l1 * 7 : l1
}

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`)
const n = (v) => (v === null || v === undefined ? 'null' : String(v))

const rows = GOALS.map((g, i) => {
  const [code, titleHe, titleEn, sub, metricKey, metricUnit, dir, ceiling,
         bp, l1, step, vDefault, vExtra, questions, widget, window] = g

  const family = code[0]
  const index = Number(code.slice(2))
  const allowed = [vDefault, ...vExtra, ...ALTERNATIVES[vDefault]]
    .filter((v, idx, arr) => arr.indexOf(v) === idx)

  // Guided methods need timer/counter parameters; the rest carry none.
  let session = {}
  if (vDefault === 'V3') session = { sets: 3, reps: Math.round(l1 / 3), rest_seconds: 60 }
  else if (vDefault === 'V1' && metricKey.startsWith('minutes')) session = { sets: 1, work_seconds: l1 * 60 }
  else if (vDefault === 'V1' && metricKey.startsWith('seconds')) session = { sets: 3, work_seconds: Math.round(l1 / 3) }
  else if (vDefault === 'V7') session = { work_seconds: 25 * 60, rest_seconds: 5 * 60 }

  return `  (${[
    q(code.toLowerCase()), q(titleHe), q(titleEn),
    q(`נמדד ב${metricUnit} · ${dir === 'up' ? 'יותר זה טוב יותר' : 'פחות זה טוב יותר'}`),
    q(`Tracked as ${metricKey.replace(/_/g, ' ')} · ${dir === 'up' ? 'higher is better' : 'lower is better'}`),
    q(CATEGORY_OF[family]),
    q(code === 'I-19' ? 'long_term' : 'daily'),
    q(LEGACY_VERIFICATION[vDefault]),
    q(null),
    `'${JSON.stringify(session)}'::jsonb`,
    n(bp), n(SORT_BASE[family] + index),
    q(code), q(sub), q(metricKey), q(metricUnit), q(dir), n(ceiling),
    n(bp), n(l1), n(weeklyFloor(metricKey, l1)), n(step),
    `'${vDefault}'`,
    `array[${allowed.map((v) => `'${v}'`).join(',')}]::verification_code[]`,
    `'${JSON.stringify(questions)}'::jsonb`,
    q(widget), q(window ?? 'week'),
  ].join(', ')})`
})

const sql = `-- =============================================================================
-- The 80 structured goals of Pisga_Goals_Library_v1.md section 9.
--
-- GENERATED by scripts/generate-goals-seed.mjs — edit the goal table there and
-- re-run rather than editing this file, so the unit conventions documented in
-- that script stay applied uniformly across all 80 rows.
--
-- Re-runnable: \`on conflict (code)\` refreshes an existing goal in place, so a
-- price change or a reworded title is a re-run, never a migration.
-- =============================================================================

-- Section 3.3 states L1 per performance ("15/day") but floors the WEEKLY
-- baseline with it ("→ 105/week"). Storing only the per-performance figure
-- would have the engine floor a weekly total at a daily number — a floor of
-- effectively zero, which is exactly the beginner-noise problem the floor
-- exists to prevent. Both are stored: level_1_value for display, this for
-- the engine. See weeklyFloor() in the generator for the conversion.
alter table goals_library
  add column if not exists level_1_weekly_value numeric
    check (level_1_weekly_value is null or level_1_weekly_value > 0);

insert into goals_library
  (slug, title_he, title_en, description_he, description_en,
   category, goal_type, verification, suggested_frequency, session_config,
   points, sort_order,
   code, subcategory, metric_key, metric_unit, metric_direction, metric_ceiling,
   base_points, level_1_value, level_1_weekly_value, level_step,
   verification_default, verification_allowed, calibration_questions,
   custom_widget, measurement_window)
values
${rows.join(',\n')}
on conflict (code) do update set
  title_he             = excluded.title_he,
  title_en             = excluded.title_en,
  description_he       = excluded.description_he,
  description_en       = excluded.description_en,
  category             = excluded.category,
  goal_type            = excluded.goal_type,
  verification         = excluded.verification,
  session_config       = excluded.session_config,
  points               = excluded.points,
  sort_order           = excluded.sort_order,
  subcategory          = excluded.subcategory,
  metric_key           = excluded.metric_key,
  metric_unit          = excluded.metric_unit,
  metric_direction     = excluded.metric_direction,
  metric_ceiling       = excluded.metric_ceiling,
  base_points          = excluded.base_points,
  level_1_value        = excluded.level_1_value,
  level_1_weekly_value = excluded.level_1_weekly_value,
  level_step           = excluded.level_step,
  verification_default = excluded.verification_default,
  verification_allowed = excluded.verification_allowed,
  calibration_questions = excluded.calibration_questions,
  custom_widget        = excluded.custom_widget,
  measurement_window   = excluded.measurement_window;

-- The document defines exactly 20 goals per category. A seed that silently
-- lost or duplicated a row would surface as a wrong library, not an error.
do $$
declare v_total int; v_per_category int;
begin
  select count(*) into v_total from goals_library where code is not null;
  if v_total <> 80 then
    raise exception 'expected 80 structured goals, found %', v_total;
  end if;

  select count(*) into v_per_category from (
    select category from goals_library where code is not null
    group by category having count(*) = 20
  ) ok;
  if v_per_category <> 4 then
    raise exception 'expected 20 structured goals in each of the 4 categories';
  end if;
end $$;
`

writeFileSync('supabase/migrations/0011_seed_structured_goals.sql', sql)
console.log(`wrote ${GOALS.length} goals`)
