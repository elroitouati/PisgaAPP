// Shared by every notify-* function: sends one payload to every subscription
// a user has on file. Not exposed as its own Edge Function — imported by the
// functions that decide *when* to notify.

import webpush from 'npm:web-push@3'
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:support@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

export type PushPayload = { title: string; body?: string; url?: string }

/**
 * A subscription the push service reports as gone (404/410 — uninstalled,
 * permission revoked) is deleted so it stops being retried forever; any
 * other failure is logged and otherwise ignored, since one dead browser must
 * never block a notification going out to the rest of a user's devices.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subscriptions || subscriptions.length === 0) return

  await Promise.all(
    subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        )
      } catch (caught) {
        const status = (caught as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        } else {
          console.error('push send failed', sub.endpoint, caught)
        }
      }
    }),
  )
}

/** Every notify-* function needs the caller to prove it's the DB trigger. */
export function checkWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('WEBHOOK_SECRET')
  return Boolean(expected) && req.headers.get('x-webhook-secret') === expected
}
