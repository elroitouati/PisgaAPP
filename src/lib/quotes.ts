/**
 * ⚠ PROVISIONAL CONTENT — PRD 6.8 asks for a daily line "from famous people",
 * and PRD 13 leaves the source open (a fixed list vs. an external feed).
 *
 * These lines ship WITHOUT attribution on purpose. Most circulating
 * motivational quotes are misattributed, and printing a name we cannot stand
 * behind would put a false claim in front of every user every morning. The
 * first entry is the line the design itself shows. Once the source is decided,
 * replace this list — the `he`/`en` shape is all the home screen depends on,
 * and an `author` field can be added when there is a verified one to add.
 */
export const DAILY_QUOTES = [
  {
    he: 'הצעד הקטן של היום הוא ההרגל של מחר.',
    en: 'Today’s small step is tomorrow’s habit.',
  },
  {
    he: 'מסע של אלף מיל מתחיל בצעד אחד.',
    en: 'A journey of a thousand miles begins with a single step.',
  },
  {
    he: 'לא חשוב כמה לאט אתה מתקדם, כל עוד אינך עוצר.',
    en: 'It does not matter how slowly you go, as long as you do not stop.',
  },
  {
    he: 'עקביות מנצחת עוצמה.',
    en: 'Consistency beats intensity.',
  },
  {
    he: 'מה שקל לעשות, קל גם לא לעשות. תבחר בכל זאת.',
    en: 'What is easy to do is also easy not to do. Choose it anyway.',
  },
  {
    he: 'אתה לא צריך להיות מצוין כדי להתחיל, אבל צריך להתחיל כדי להיות מצוין.',
    en: 'You do not have to be great to start, but you have to start to be great.',
  },
  {
    he: 'ההרגלים שלך היום הם מי שתהיה בעוד שנה.',
    en: 'Your habits today are who you will be a year from now.',
  },
] as const
