// Finishes what request_account_deletion() (0006_profile_features.sql) cannot
// do from the browser: remove the auth.users row itself. That needs the
// service-role key, which never reaches client code, so it lives here.
//
// Deleting auth.users cascades to profiles (`on delete cascade`), and every
// table that references profiles — user_goals, friendships, blocks, messages,
// conversation_members, user_badges, invite_codes, account_deletion_requests,
// onboarding_answers — cascades from there in turn. So this function does not
// re-delete any of that itself; the RPC's manual wipe is defense-in-depth for
// the gap between "requested" and this call succeeding, not the primary path.
//
// Deploy: supabase functions deploy delete-account
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically into every Edge Function's environment — nothing to set by
// hand. JWT verification is on by default for a new function, which is
// exactly what this needs: only the signed-in owner may delete their own
// account, never someone else's.

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing authorization' }), { status: 401 })
  }

  // Scoped to the caller's own JWT, used only to answer "who is asking" —
  // never to read or write any table.
  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error: userError,
  } = await callerClient.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'invalid session' }), { status: 401 })
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id)
  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), { status: 500 })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
