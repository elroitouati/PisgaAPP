# פסגה — Pisga

אפליקציית שיפור עצמי ומוטיבציה יומיומית. React + Vite + Tailwind + Supabase, בנויה כ‑PWA,
עברית RTL כברירת מחדל עם מעבר לאנגלית.

## הפעלה מקומית

```bash
npm install
cp .env.example .env.local     # מלאו את פרטי פרויקט ה־Supabase שלכם
npm run dev
```

בלי משתני הסביבה האפליקציה מציגה מסך "חסרה הגדרת Supabase" במקום ליפול.

## הקמת Supabase

1. צרו פרויקט חדש ב‑[supabase.com](https://supabase.com) והעתיקו את ה‑Project URL ואת ה‑anon key
   אל `.env.local`. **רק** מפתח ה‑anon נכנס לקובץ — מפתח ה‑service role לעולם לא, הוא מגיע לדפדפן.
2. הריצו את המיגרציות לפי הסדר, מתוך ה‑SQL Editor:
   - `supabase/migrations/0001_initial_schema.sql` — טבלאות, enums, RLS, פונקציות
   - `supabase/migrations/0002_seed_goals_library.sql` — תוכן ספריית המטרות
   - `supabase/migrations/0003_badges.sql` — באדג׳ים ולוגיקת ההענקה
   - `supabase/migrations/0004_goal_points.sql` — ערכי נקודות וחישוב הניקוד
3. ב‑Authentication → Providers: הפעילו Email והפעילו Google (עם ה‑Client ID/Secret מ‑Google Cloud).
4. ב‑Authentication → URL Configuration: הוסיפו את `http://localhost:5173/auth/callback`
   ואת כתובת הפרודקשן ל‑Redirect URLs.

## בדיקות

```bash
npm run build                  # typecheck + build
./scripts/verify-sql.sh        # מיגרציות + 50 בדיקות RLS, באדג׳ים ונקודות על Postgres זמני
```

`verify-sql.sh` דורש Postgres מקומי; העבירו לו `PGHOST`/`PGPORT`/`PGUSER`.
הוא בונה מסד נתונים חד־פעמי, מדמה את סכמת `auth` של Supabase
(`supabase/tests/harness.sql`), מריץ את המיגרציות ואז את `supabase/tests/rls.sql`.

## מבנה

```
src/
  i18n/          מילון he/en + ספק שפה (מחליף גם את כיוון הדף)
  providers/     Auth, Profile, Theme
  hooks/         useGoals (מעקב יומי), useGuidedSession (טיימר), useBadges,
                 usePoints, useAsync
  lib/           supabase, api (שאילתות), categories, scoring, dates, quotes
  components/    ui, icons, GoalRow, BottomNav, AppShell
  pages/         Login, Onboarding, Home, CategoryScreen, GuidedSession,
                 Library, Achievements, Calendar, Friends, Profile
supabase/
  migrations/    סכמה + seed
  tests/         harness + בדיקות RLS
design/
  unpacked/      ה‑HTML של העיצוב כפי שחולץ מה‑bundle
  screens/       כל מסך בעיצוב כקובץ נפרד, לעיון מול הקוד
  unpack.mjs     מחלץ מחדש מ‑.dc.html
scripts/
  generate-icons.mjs   מייצר את אייקוני ה‑PWA
  verify-sql.sh        מריץ את בדיקות ה‑SQL
```

## מערכת העיצוב

כל הצבעים עוברים דרך טוקנים סמנטיים ב‑`src/index.css`, שנלקחו מקובץ העיצוב
(`design/unpacked/design.html`). החלפת פלטה היא שינוי בקובץ אחד.
הגופן Heebo מאוחסן מקומית ב‑`public/fonts` כדי שהאפליקציה תשמור על הטיפוגרפיה גם במצב לא מקוון.

### בהיר מול כהה

שתי הפלטות נלקחו מהעיצוב: הבהירה מסבב 5, הכהה מסבבים 2‑4. המצב נקבע לפי
`data-theme` על ה‑`<html>` ומוחל לפני הציור הראשון (סקריפט קצר ב‑`index.html`),
כדי שלא יהיה הבזק של המצב הלא נכון בטעינה. `light / dark / לפי המכשיר` נשמרים
ב‑localStorage, ובמצב "לפי המכשיר" האפליקציה ממשיכה לעקוב אחרי ההעדפה בזמן אמת.

שני מקומות שבהם המצב הכהה אינו רק היפוך של הבהיר, ולכן יש להם טוקן ייעודי:

- **`--color-on-cat`** — טקסט ואייקונים על מילוי בצבע קטגוריה. בבהיר לבן, בכהה צבע
  הרקע של הדף. צבעי הקטגוריה בכהה בהירים (oklch ~0.75), ולבן עליהם כמעט בלתי קריא.
- **`--pisga-tint-base`** — הבסיס שאליו מערבבים גוון קטגוריה. בבהיר לבן, בכהה
  צבע הכרטיס ולא שחור; ערבוב לשחור מכהה את האריח הרבה מעבר למה שהעיצוב מראה.

הלוגו המלא מתחלף בין `pisga-light.webp` (יום) ל‑`pisga-dark.webp` (שקיעה) לפי המצב.

## באדג'ים

שמונה הקריטריונים סגורים ומיושמים ב‑`supabase/migrations/0003_badges.sql`.
ההענקה רצה כולה בצד השרת — ל‑`user_badges` אין policy של הכנסה לקליינט, כך שהדרך היחידה
לבאדג' היא דרך `evaluate_badges()`. באדג' שהוענק אינו נשלל בביטול סימון.

הגדרת "שבוע" ב'מטפס מאוזן' היא ראשון–שבת (לא ISO), לפי הלוח הישראלי.
מטרה ארוכת טווח נחשבת שהושלמה כשמסמנים אותה דרך `finish_goal()` — שדה `completed_at`
נוסף במיוחד כדי להבחין בין "עבדתי על זה היום" לבין "סיימתי".

## מה עדיין פתוח

מסומן בקוד ב‑`⚠ PROVISIONAL` ומרוכז כאן:

- **ערכי הנקודות** — המנגנון סגור (ערך נפרד לכל מטרה, ב‑`goals_library.points`),
  אבל המספרים עצמם הם הצעה שנעגנה ב‑"+40" שמופיע בעיצוב. לשינוי — `0004_goal_points.sql`.
- **תוכן ספריית המטרות** — 21 מטרות כהצעה ראשונה (PRD 13).
- **שלושה ייחוסי ציטוט שנויים במחלוקת** — מסומנים `disputed` ב‑`src/lib/quotes.ts`
  (אריסטו/ויל דוראנט, לינקולן, ושם המחבר של הציטוט הראשון).
- **סנכרון צעדים** — מטרות `sensor_sync` מציגות שהחיבור אינו קיים במקום לקבל דיווח עצמי.
- **צ׳אט בין חברים (מסך 4c)** — מופיע בעיצוב אך לא ב‑PRD. פיצ׳ר חדש שדורש טבלאות
  ומדיניות משלו; לא נבנה.
- **אתגרים משותפים ומסך 4b** — התשתית (`goal_shares`) והבאדג׳ קיימים, המסכים לא.
- **ציר הזמן בלוח השנה** — PRD 6.5 מבקש גם מטרות עם תאריך יעד ואבני דרך;
  העיצוב מצייר רק את רשת ההשלמות היומיות, אז זה מה שנבנה.
