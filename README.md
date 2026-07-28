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
3. ב‑Authentication → Providers: הפעילו Email והפעילו Google (עם ה‑Client ID/Secret מ‑Google Cloud).
4. ב‑Authentication → URL Configuration: הוסיפו את `http://localhost:5173/auth/callback`
   ואת כתובת הפרודקשן ל‑Redirect URLs.

## בדיקות

```bash
npm run build                  # typecheck + build
./scripts/verify-sql.sh        # מיגרציות + 27 בדיקות RLS על Postgres זמני
```

`verify-sql.sh` דורש Postgres מקומי; העבירו לו `PGHOST`/`PGPORT`/`PGUSER`.
הוא בונה מסד נתונים חד־פעמי, מדמה את סכמת `auth` של Supabase
(`supabase/tests/harness.sql`), מריץ את המיגרציות ואז את `supabase/tests/rls.sql`.

## מבנה

```
src/
  i18n/          מילון he/en + ספק שפה (מחליף גם את כיוון הדף)
  providers/     Auth, Profile, Theme
  hooks/         useGoals (מעקב יומי), useGuidedSession (טיימר), useAsync
  lib/           supabase, api (שאילתות), categories, scoring, dates, quotes
  components/    ui, icons, GoalRow, BottomNav, AppShell
  pages/         Login, Onboarding, Home, CategoryScreen, GuidedSession, Library, Profile
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

## מה עדיין פתוח

מסומן בקוד ב‑`⚠ PROVISIONAL` ומרוכז כאן:

- **קריטריונים לבאדג'ים** — הטבלאות קיימות, לוגיקת ההענקה לא. אין לקליינט הרשאת כתיבה
  ל‑`user_badges` בכוונה, כדי שהענקה תתבצע רק בצד השרת (PRD 13).
- **נוסחת הנקודות** — לא מוגדרת ב‑PRD. `src/lib/scoring.ts` מחזיק טבלת משקלים זמנית
  לפי שיטת האימות. מה שכן סגור ומיושם: רק מטרות מובנות צוברות נקודות (PRD 3.1).
- **תוכן ספריית המטרות** — 21 מטרות כהצעה ראשונה (PRD 13).
- **מקור הציטוט היומי** — רשימה קבועה ב‑`src/lib/quotes.ts`, ללא ייחוס לשמות (PRD 13).
- **סנכרון צעדים** — מטרות `sensor_sync` מציגות שהחיבור אינו קיים במקום לקבל דיווח עצמי.
