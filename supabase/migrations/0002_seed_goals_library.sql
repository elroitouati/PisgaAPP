-- =============================================================================
-- Pisga — initial goal library content (PRD 6.3, work-order step 2)
--
-- ⚠ PROPOSAL, PENDING REVIEW. PRD section 13 lists the final library content
-- as an open question. The 20 goals below cover the four categories and pair
-- each goal with the verification method PRD section 5 prescribes for its
-- shape; the wording, the split, and the session numbers (sets, durations,
-- step targets) are a first draft meant to be edited, not a settled spec.
--
-- Re-runnable: `on conflict (slug)` refreshes an existing row in place.
-- =============================================================================

insert into goals_library
  (slug, title_he, title_en, description_he, description_en,
   category, goal_type, verification, suggested_frequency, session_config, sort_order)
values
  -- --------------------------------------------------------------- גופני ----
  ('pushups-60',
   '60 שכיבות סמיכה', '60 push-ups',
   'שלושה סטים של 20 חזרות, עם מנוחה קצרה בין הסטים.',
   'Three sets of 20 reps with a short rest between sets.',
   'physical', 'daily', 'guided_session', 'כל יום',
   '{"sets": 3, "reps": 20, "work_seconds": 60, "rest_seconds": 45}', 10),

  ('steps-10k',
   '10,000 צעדים ביום', '10,000 steps a day',
   'נמדד אוטומטית מנתוני הבריאות של המכשיר.',
   'Measured automatically from your device health data.',
   'physical', 'daily', 'sensor_sync', 'כל יום',
   '{"metric": "steps", "target": 10000}', 20),

  ('strength-30min',
   'אימון כוח 30 דקות', '30-minute strength workout',
   'אימון מלווה בטיימר, עם מנוחות מובנות.',
   'A timer-guided workout with built-in rest periods.',
   'physical', 'daily', 'guided_session', '3 פעמים בשבוע',
   '{"sets": 6, "work_seconds": 240, "rest_seconds": 60}', 30),

  ('morning-stretch',
   'מתיחות בוקר 10 דקות', '10-minute morning stretch',
   'רצף מתיחות קצר לפתיחת היום.',
   'A short stretching sequence to open the day.',
   'physical', 'daily', 'guided_session', 'כל יום',
   '{"sets": 1, "work_seconds": 600, "rest_seconds": 0}', 40),

  ('water-8-cups',
   'שתיית 8 כוסות מים', 'Drink 8 glasses of water',
   'סימון בסוף היום עם הערה קצרה.',
   'Check in at the end of the day with a short note.',
   'physical', 'daily', 'checkbox_reflection', 'כל יום',
   '{}', 50),

  ('run-10k',
   'לרוץ 10 ק"מ ברצף', 'Run 10 km non-stop',
   'מטרה ארוכת טווח, עם אבני דרך לאורך הדרך.',
   'A long-term goal with milestones along the way.',
   'physical', 'long_term', 'sensor_sync', 'עד סוף השנה',
   '{"metric": "distance_km", "target": 10}', 60),

  -- -------------------------------------------------------------- לימודי ----
  ('reading-20min',
   'קריאה 20 דקות', 'Read for 20 minutes',
   'טיימר קריאה רציף.',
   'A continuous reading timer.',
   'academic', 'daily', 'guided_session', 'כל יום',
   '{"sets": 1, "work_seconds": 1200, "rest_seconds": 0}', 110),

  ('language-15min',
   'לימוד שפה 15 דקות', 'Study a language for 15 minutes',
   'תרגול יומי קצר של שפה חדשה.',
   'A short daily practice session in a new language.',
   'academic', 'daily', 'guided_session', 'כל יום',
   '{"sets": 1, "work_seconds": 900, "rest_seconds": 0}', 120),

  ('finish-a-book',
   'לסיים ספר', 'Finish a book',
   'בחרו ספר וקבעו תאריך יעד לסיומו.',
   'Pick a book and set a target date to finish it.',
   'academic', 'deadline', 'checkbox_reflection', 'תוך שבועיים',
   '{}', 130),

  ('online-lecture',
   'צפייה בהרצאה או שיעור מקוון', 'Watch a lecture or online class',
   'סימון בתוספת משפט על מה שנלמד.',
   'Check in with a sentence about what you learned.',
   'academic', 'daily', 'checkbox_reflection', '3 פעמים בשבוע',
   '{}', 140),

  ('instrument-20min',
   'תרגול נגינה 20 דקות', 'Practise an instrument for 20 minutes',
   'תרגול מלווה בטיימר.',
   'A timer-guided practice session.',
   'academic', 'daily', 'guided_session', 'כל יום',
   '{"sets": 1, "work_seconds": 1200, "rest_seconds": 0}', 150),

  -- -------------------------------------------------------------- חברתי -----
  ('call-parents',
   'להתקשר להורים', 'Call your parents',
   'סימון בתוספת הערה קצרה על השיחה.',
   'Check in with a short note about the call.',
   'social', 'daily', 'checkbox_reflection', 'כל יום',
   '{}', 210),

  ('reconnect-friend',
   'לחדש קשר עם חבר', 'Reconnect with a friend',
   'ליצור קשר עם מישהו שלא דיברתם איתו מזמן.',
   'Reach out to someone you have not spoken to in a while.',
   'social', 'daily', 'checkbox_reflection', 'פעם בשבוע',
   '{}', 220),

  ('help-someone',
   'לעזור למישהו', 'Help someone out',
   'מעשה קטן של עזרה, ומשפט על מה שנעשה.',
   'A small act of help, plus a sentence about it.',
   'social', 'daily', 'checkbox_reflection', 'פעם בשבוע',
   '{}', 230),

  ('organise-meetup',
   'לארגן מפגש חברתי', 'Organise a get-together',
   'לקבוע ולארגן מפגש עד תאריך היעד.',
   'Plan and host a meetup by the target date.',
   'social', 'deadline', 'checkbox_reflection', 'תוך חודש',
   '{}', 240),

  ('gratitude-message',
   'לשלוח הודעת תודה', 'Send a thank-you message',
   'להודות למישהו על משהו קונקרטי.',
   'Thank someone for something specific.',
   'social', 'daily', 'checkbox_reflection', 'פעם בשבוע',
   '{}', 250),

  -- --------------------------------------------------------------- אישי -----
  ('meditation-10min',
   'מדיטציה 10 דקות', '10-minute meditation',
   'ישיבה שקטה מלווה בטיימר.',
   'A timer-guided quiet sitting.',
   'personal', 'daily', 'guided_session', 'כל יום',
   '{"sets": 1, "work_seconds": 600, "rest_seconds": 0}', 310),

  ('journaling',
   'כתיבת יומן', 'Journalling',
   'כמה שורות על היום שעבר.',
   'A few lines about the day behind you.',
   'personal', 'daily', 'checkbox_reflection', 'כל יום',
   '{}', 320),

  ('no-smoking',
   'לא לעשן', 'No smoking',
   'צ׳ק-אין יומי בסוף היום.',
   'A daily end-of-day check-in.',
   'personal', 'daily', 'daily_checkin', 'כל יום',
   '{}', 330),

  ('no-social-after-22',
   'בלי רשתות חברתיות אחרי 22:00', 'No social media after 10pm',
   'צ׳ק-אין יומי בסוף היום.',
   'A daily end-of-day check-in.',
   'personal', 'daily', 'daily_checkin', 'כל יום',
   '{}', 340),

  ('fixed-wake-time',
   'לקום בשעה קבועה', 'Wake up at a fixed time',
   'צ׳ק-אין יומי על עמידה בשעת הקימה.',
   'A daily check-in on hitting your wake-up time.',
   'personal', 'daily', 'daily_checkin', 'כל יום',
   '{}', 350)

on conflict (slug) do update set
  title_he            = excluded.title_he,
  title_en            = excluded.title_en,
  description_he      = excluded.description_he,
  description_en      = excluded.description_en,
  category            = excluded.category,
  goal_type           = excluded.goal_type,
  verification        = excluded.verification,
  suggested_frequency = excluded.suggested_frequency,
  session_config      = excluded.session_config,
  sort_order          = excluded.sort_order,
  active              = true;
