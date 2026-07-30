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
   - `supabase/migrations/0005_chat.sql` — שיחות, הודעות וחסימות
   - `supabase/migrations/0006_profile_features.sql` — אווטאר, קישורי הזמנה, מחיקת חשבון, ניהול קבוצה
   - `supabase/migrations/0007_push_notifications.sql` — **לפני ההרצה**, החליפו
     בקובץ את `<PROJECT_REF>` ו‑`<WEBHOOK_SECRET>` (ראו סעיף 6 למטה) בערכים האמיתיים
   - `supabase/migrations/0008_group_admins.sql` — כמה מנהלים בקבוצה, לא בעלים יחיד.
     **גם כאן** יש `<PROJECT_REF>`/`<WEBHOOK_SECRET>` להחליף (טריגר הצטרפות דרך קישור)
   - `supabase/migrations/0009_clear_goals_library.sql` — מרוקן את תוכן ספריית
     המטרות הזמני (0002)
   - `supabase/migrations/0010_structured_goals.sql` — סכימת המטרות המובנות:
     קטלוג האימות V0–V8, 14 השדות של המטרה בספרייה, מצב הרמה של המשתמש,
     `weekly_metrics` ו‑`level_changes`
   - `supabase/migrations/0011_seed_structured_goals.sql` — 80 המטרות המובנות
     (P‑01…I‑20). **נוצר אוטומטית** מ‑`scripts/generate-goals-seed.mjs`; לעדכון
     ערכו את הסקריפט והריצו אותו מחדש, לא את קובץ ה‑SQL
   - `supabase/migrations/0012_growth_engine.sql` — מנוע הצמיחה: חישוב הנקודות
     השבועיות, כיול, שינוי רמה עם צינון 72 שעות, המרה למטרה אישית וטבלת הצמיחה
   - `supabase/migrations/0013_goal_media.sql` — דלי אחסון פרטי להוכחת מדיה (V6)
   - `supabase/migrations/0014_verification_fallback.sql` — אימות באחת מהשיטות
     החלופיות של המטרה, כשמקדם האמון נגזר מהשיטה שבה באמת השתמשו
3. ב‑Authentication → Providers: הפעילו Email והפעילו Google (עם ה‑Client ID/Secret מ‑Google Cloud).
4. ב‑Authentication → URL Configuration: הוסיפו את `http://localhost:5173/auth/callback`
   ואת כתובת הפרודקשן ל‑Redirect URLs.
5. פרסו את ה‑Edge Function שמשלימה מחיקת חשבון (מוחקת את שורת `auth.users` עצמה,
   דבר שדורש את מפתח ה‑service role ולכן לא יכול לרוץ מהדפדפן):
   ```bash
   supabase functions deploy delete-account --project-ref <your-project-ref>
   ```
   `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` מוזרקים אוטומטית
   לכל Edge Function — אין secrets להגדיר ידנית. אימות ה‑JWT דלוק כברירת מחדל,
   כך שרק המשתמש המחובר יכול למחוק את עצמו.
6. **התראות Push** — כמה שלבים, כי זה הפיצ׳ר עם הכי הרבה חלקים נעים:

   a. **מפתחות VAPID** — זוג מפתחות לזיהוי השרת מול שירות ה‑Push של הדפדפן:
      ```bash
      npx web-push generate-vapid-keys
      ```
      את המפתח הציבורי שימו ב‑`VITE_VAPID_PUBLIC_KEY` (ב‑`.env.local`, ובכל
      פלטפורמת אחסון של הפרודקשן). את המפתח הפרטי **לעולם לא** בקוד — רק כ‑secret:
      ```bash
      supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... \
        VAPID_SUBJECT=mailto:you@example.com \
        WEBHOOK_SECRET=$(openssl rand -hex 32)
      ```
      את אותו `WEBHOOK_SECRET` צריך גם בתוך `0007_push_notifications.sql`
      (הטריגרים בודקים אותו לפני שהם סומכים על הבקשה).

   b. **פריסת הפונקציות**:
      ```bash
      supabase functions deploy notify-event --project-ref <your-project-ref>
      supabase functions deploy notify-forgotten-goals --project-ref <your-project-ref>
      ```

   c. **מילוי ה‑placeholders במיגרציה** — `<PROJECT_REF>` בכתובת ה‑URL של כל
      טריגר, ו‑`<WEBHOOK_SECRET>` בכותרת. אלה שלוש הפעולות (באדג׳, מטרה
      הושלמה, הודעה) שקוראות ל‑`notify-event` ישירות דרך trigger על הטבלה.

   d. **התזכורת היומית** ("כמעט שכחת") היא לא webhook על טבלה — היא ריצה
      מתוזמנת. הגדירו Cron Trigger מה‑Dashboard (Integrations → Cron) שקורא
      פעם ביום ל‑`notify-forgotten-goals`, עם הכותרת
      `x-webhook-secret: <WEBHOOK_SECRET>`. שימו לב: היא רצה בשעה קבועה
      ב‑UTC לכולם — אין עדיין אזור זמן פר‑משתמש (ראו `docs/NEXT.md`).

## בדיקות

```bash
npm run build                  # typecheck + build
npm test                       # 25 בדיקות יחידה למנוע הניקוד (src/lib/growth.ts)
./scripts/verify-sql.sh        # מיגרציות + 159 בדיקות RLS, באדג׳ים, נקודות, מנוע צמיחה והתראות על Postgres זמני
```

מנוע הניקוד קיים פעמיים בכוונה: `src/lib/growth.ts` הוא פונקציה טהורה שהמסכים
מציגים איתה תחזיות, ו‑`compute_weekly_metrics` ב‑0012 הוא הסמכות — `weekly_metrics`
מזין את טבלת הצמיחה ולכן אין ללקוח הרשאת כתיבה אליו. שתי המימושים נעולים על
אותה דוגמה מסעיף 3.3 של מסמך הספרייה (דני 10→20 מרוויח יותר מיוסי 50→60).

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
  lib/           supabase, api (שאילתות), categories, scoring, dates, quotes, push,
                 growth (מנוע הניקוד כפונקציה טהורה), structuredGoals (שכבת הנתונים)
  components/    ui, icons, GoalRow, BottomNav, AppShell
  pages/         Login, Onboarding, Home, CategoryScreen, GuidedSession,
                 Library, Achievements, Calendar, Friends, Chat, SharedGoal,
                 Profile ותת־המסכים שלו
  pages/goals/   15 המסכים המשותפים של המטרות המובנות: GoalCard (S1+S3+S7),
                 Calibrate (S2), GoalProgress (S4), GoalBuilder (S5),
                 WeeklySummary (S6), Verify (VS0–VS8 במסלול אחד)
  sw.ts          Service Worker בכתב יד (injectManifest) — push + notificationclick
supabase/
  migrations/    סכמה + seed
  tests/         harness + בדיקות RLS
  functions/     Edge Functions (service‑role, לא נגישות ללקוח):
                 delete-account, notify-event, notify-forgotten-goals, _shared
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

לכל מסך אמיתי בעיצוב יש שתי גרסאות, וכל מסך נבנה **פעם אחת** — הטוקנים מספקים את
שתיהן. לפני כל מסך חדש אני משווה את הליטרלים בזוג; עד היום זה הניב שלושה טוקנים בלבד
שבהם המצבים באמת נבדלים: `--color-on-cat`, `--pisga-tint-base` ו‑`--color-scrim`.


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

## צ׳אט

לא מופיע ב‑PRD — נוסף לפי החלטתך, עם הכללים האלה:

- שיחות 1:1, קבוצות בשם, ושיחה שנפתחת אוטומטית לכל אתגר משותף (טריגר על `goal_shares`).
- שולח יכול לערוך ולמחוק **רק** את ההודעות שלו. מחיקה מנקה את הטקסט עצמו, לא רק מסמנת דגל.
- אפשר לשתף מטרה **אישית שלך** בלבד לתוך שיחה. מטרות מהספרייה כבר גלויות לחברים.
- **חסימה חותכת הכול**: `are_friends()` מחזירה false לזוג חסום, כך שהחסימה מסירה גם את
  החברות ואת הראות ההדדית של ההתקדמות. חסימה שמשאירה את הצד השני צופה במטרות שלך
  אינה חסימה.
- הודעות זורמות ב‑Realtime ולא בפולינג; הטעינה הראשונית וה‑stream מתמזגים לפי `id`
  כדי שהודעה שהגיעה תוך כדי לא תיכנס פעמיים.

**נוכחות** (`usePresence`) היא Supabase Realtime Presence, והיא **opt‑out**: מתג בפרופיל
מפסיק לשדר אותך בלי לחסום ממך לראות אחרים. הערוץ מתנתק ב‑unmount וב‑`pagehide`,
כדי שסגירת טאב לא תשאיר "מחובר" תקוע.

## מה עדיין פתוח

מסומן בקוד ב‑`⚠ PROVISIONAL` ומרוכז כאן:

- **ערכי הנקודות** — המנגנון סגור (ערך נפרד לכל מטרה, ב‑`goals_library.points`),
  אבל המספרים עצמם הם הצעה שנעגנה ב‑"+40" שמופיע בעיצוב. לשינוי — `0004_goal_points.sql`.
- **סנכרון חיישן (V2)** — שש מטרות מוגדרות V2, ואין עדיין אינטגרציה ל‑Google Fit
  או ל‑HealthKit. המסך אומר זאת ומציע את השיטות החלופיות שהמטרה מתירה, עם מקדם
  האמון הנמוך יותר שלהן. **אין נפילה לקלט ידני בכוונה** — V2 הוא היחיד ששווה ×1.2,
  ומספר שמקלידים שנושא את המקדם הזה הוא הדרך הקלה ביותר לנפח את טבלת הצמיחה.
- **שלושה ייחוסי ציטוט שנויים במחלוקת** — מסומנים `disputed` ב‑`src/lib/quotes.ts`
  (אריסטו/ויל דוראנט, לינקולן, ושם המחבר של הציטוט הראשון).
- **סנכרון צעדים** — מטרות `sensor_sync` מציגות שהחיבור אינו קיים במקום לקבל דיווח עצמי.
- **אבני דרך בציר הזמן** — מחושבות כחמש נקודות זמן קבועות על ציר ההתחלה-יעד
  (ראו `fetchLongTermGoals` ב‑`src/lib/api.ts`), לא רשומות אמיתיות ב‑`goal_milestones`
  (הטבלה קיימת בסכמה, ריקה) — אין באפליקציה שום דרך למשתמש ליצור/לשם אבן דרך ידנית.
