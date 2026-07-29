// Single entry point for the event-driven triggers wired in
// 0007_push_notifications.sql (notify_on_badge_earned, notify_on_goal_completed,
// notify_on_message) and 0008_group_admins.sql (the invite-link join,
// called directly from redeem_invite() rather than via a table trigger — see
// that migration for why). Each POSTs { table, record } — this branches on
// `table` and decides who gets notified with what, in the recipient's own
// language.
//
// Deploy: supabase functions deploy notify-event
// Secrets to set (supabase secrets set ...): VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT (a mailto: URL), WEBHOOK_SECRET (must
// match the secret baked into the trigger definitions in the migration).

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { checkWebhookSecret, sendPushToUser, type PushPayload } from '../_shared/push.ts'

type Lang = 'he' | 'en'

const COPY: Record<Lang, {
  badge: (title: string) => PushPayload
  goal: (title: string) => PushPayload
  message: (sender: string, preview: string | null) => PushPayload
  friendJoined: (name: string) => PushPayload
}> = {
  he: {
    badge: (title) => ({ title: 'באדג׳ חדש!', body: `זכית ב"${title}"`, url: '/achievements' }),
    goal: (title) => ({ title: 'מטרה הושלמה', body: `סיימת את "${title}"`, url: '/profile/goals' }),
    message: (sender, preview) => ({ title: sender, body: preview ?? 'שלח/ה לך הודעה' }),
    friendJoined: (name) => ({
      title: 'חבר חדש!',
      body: `${name} הצטרף/ה דרך הקישור שלך`,
      url: '/friends',
    }),
  },
  en: {
    badge: (title) => ({ title: 'New badge!', body: `You earned "${title}"`, url: '/achievements' }),
    goal: (title) => ({ title: 'Goal completed', body: `You finished "${title}"`, url: '/profile/goals' }),
    message: (sender, preview) => ({ title: sender, body: preview ?? 'sent you a message' }),
    friendJoined: (name) => ({
      title: 'New friend!',
      body: `${name} joined through your link`,
      url: '/friends',
    }),
  },
}

type WebhookBody = {
  table: string
  record: Record<string, unknown>
}

Deno.serve(async (req) => {
  if (!checkWebhookSecret(req)) {
    return new Response(JSON.stringify({ error: 'invalid webhook secret' }), { status: 401 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { table, record }: WebhookBody = await req.json()

  if (table === 'user_badges') {
    const { user_id: userId, badge_id: badgeId } = record as { user_id: string; badge_id: string }
    const [{ data: profile }, { data: badge }] = await Promise.all([
      admin.from('profiles').select('language').eq('id', userId).single(),
      admin.from('badges').select('title_he, title_en').eq('id', badgeId).single(),
    ])
    if (profile && badge) {
      const lang: Lang = profile.language === 'en' ? 'en' : 'he'
      const title = lang === 'he' ? badge.title_he : badge.title_en
      await sendPushToUser(admin, userId, COPY[lang].badge(title))
    }
  } else if (table === 'user_goals') {
    const { user_id: userId, title } = record as { user_id: string; title: string }
    const { data: profile } = await admin.from('profiles').select('language').eq('id', userId).single()
    if (profile) {
      const lang: Lang = profile.language === 'en' ? 'en' : 'he'
      await sendPushToUser(admin, userId, COPY[lang].goal(title))
    }
  } else if (table === 'messages') {
    const { id: messageId, sender_id: senderId, body, conversation_id: conversationId } = record as {
      id: string
      sender_id: string
      body: string | null
      conversation_id: string
    }
    const [{ data: recipients }, { data: sender }] = await Promise.all([
      admin.rpc('notification_recipients_for_message', { p_message_id: messageId }),
      admin.from('profiles').select('display_name').eq('id', senderId).single(),
    ])
    if (recipients && sender) {
      const senderName = sender.display_name ?? 'Pisga'
      const preview = body ? body.slice(0, 120) : null
      // PostgREST's exact shape for a `returns setof uuid` RPC (plain scalars
      // vs. one-key objects) isn't worth pinning down by hand — normalize
      // either way rather than guess.
      const recipientIds = (recipients as unknown[]).map((row) =>
        typeof row === 'string' ? row : Object.values(row as Record<string, string>)[0],
      )
      const profiles = await admin.from('profiles').select('id, language').in('id', recipientIds)
      for (const recipient of profiles.data ?? []) {
        const lang: Lang = recipient.language === 'en' ? 'en' : 'he'
        await sendPushToUser(admin, recipient.id, {
          ...COPY[lang].message(senderName, preview),
          url: `/chat/${conversationId}`,
        })
      }
    }
  } else if (table === 'friendships') {
    const { owner_id: ownerId, joiner_id: joinerId } = record as {
      owner_id: string
      joiner_id: string
    }
    const [{ data: owner }, { data: joiner }] = await Promise.all([
      admin.from('profiles').select('language').eq('id', ownerId).single(),
      admin.from('profiles').select('display_name').eq('id', joinerId).single(),
    ])
    if (owner && joiner) {
      const lang: Lang = owner.language === 'en' ? 'en' : 'he'
      await sendPushToUser(admin, ownerId, COPY[lang].friendJoined(joiner.display_name ?? 'Pisga'))
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
