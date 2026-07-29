// The one scheduled (not event-driven) trigger: "you usually mark this goal,
// and haven't today." Meant to run once a day via a Supabase Cron Trigger —
// see README for the exact schedule() call.
//
// ⚠ Runs at one fixed UTC time for everyone. goals_missed_today() has no
// per-user timezone to work with (profiles carries none today), so "end of
// day" here is an approximation tuned for the app's primary audience, not a
// per-user local evening. Documented as a known simplification in
// docs/NEXT.md — worth revisiting if the audience spreads across timezones.
//
// Deploy: supabase functions deploy notify-forgotten-goals
// Same secrets as notify-event (VAPID_*, WEBHOOK_SECRET), reused here rather
// than duplicated.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { checkWebhookSecret, sendPushToUser } from '../_shared/push.ts'

const COPY = {
  he: {
    title: 'לא לשכוח היום',
    one: (goal: string) => `עדיין לא סימנת "${goal}"`,
    many: (n: number) => `יש לך ${n} מטרות שעוד לא סימנת היום`,
  },
  en: {
    title: "Don't forget today",
    one: (goal: string) => `You haven't marked "${goal}" yet`,
    many: (n: number) => `You still have ${n} goals to mark today`,
  },
} as const

Deno.serve(async (req) => {
  if (!checkWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'invalid webhook secret' }), { status: 401 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: missed, error } = await admin.rpc('goals_missed_today')
  if (error || !missed || missed.length === 0) {
    return new Response(JSON.stringify({ ok: true, notified: 0 }), { status: 200 })
  }

  const byUser = new Map<string, string[]>()
  for (const row of missed as { user_id: string; title: string }[]) {
    const titles = byUser.get(row.user_id) ?? []
    titles.push(row.title)
    byUser.set(row.user_id, titles)
  }

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, language')
    .in('id', [...byUser.keys()])

  await Promise.all(
    (profiles ?? []).map((profile: { id: string; language: string }) => {
      const lang = profile.language === 'en' ? 'en' : 'he'
      const titles = byUser.get(profile.id) ?? []
      const body = titles.length === 1 ? COPY[lang].one(titles[0]) : COPY[lang].many(titles.length)
      return sendPushToUser(admin, profile.id, { title: COPY[lang].title, body, url: '/' })
    }),
  )

  return new Response(JSON.stringify({ ok: true, notified: byUser.size }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
