// The V2 ingest endpoint: readings from Apple Health / Health Connect, taken
// by the native app on the user's device, written with the ×1.2 sensor trust.
//
// Why a function and not a direct RPC: record_health_completion and
// connect_health_source are service-role only (0015). If the browser could
// call them, it could mint ×1.2 completions with was_user_entered => false and
// every check in that migration would be decoration. The service-role key
// lives only here.
//
// ⚠ BEFORE PRODUCTION — DEVICE ATTESTATION IS NOT IMPLEMENTED.
//
// A valid user JWT proves who is asking. It does NOT prove the request came
// from our app on a real phone rather than from curl. For a ×1.2 multiplier
// that is not enough, and closing it needs App Attest (iOS) and Play Integrity
// (Android): the app sends a platform-signed token, and this function verifies
// it against Apple's / Google's roots before accepting anything.
//
// That verification cannot be written blind — it needs a real app ID, a real
// team ID, Apple's attestation root certificate and a Google Cloud project,
// none of which exist yet. So the hook is marked here rather than faked, and
// the honest current state is: this endpoint trusts a JWT. Everything else in
// the chain (hand-entered samples refused, provenance recorded, goal must
// allow V2) is real and enforced in 0015.
//
// Deploy: supabase functions deploy health-sync

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Reading = {
  userGoalId: string
  value: number
  manual: boolean
  sourceDevice: string | null
}

type Body = {
  source: 'apple_health' | 'health_connect'
  connect?: boolean
  grantedTypes?: string[]
  completedDate?: string
  readings?: Reading[]
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing authorization' }), { status: 401 })
  }

  // Only to answer "who is asking" — never to read or write a table.
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

  // ── Device attestation goes here. See the header note. ────────────────────
  // const attestation = req.headers.get('X-Device-Attestation')
  // if (!(await verifyAttestation(attestation, body.source))) return 403

  let body: Body
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 })
  }

  if (body.source !== 'apple_health' && body.source !== 'health_connect') {
    return new Response(JSON.stringify({ error: 'unknown health source' }), { status: 400 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (body.connect) {
    const { error } = await admin.rpc('connect_health_source', {
      p_user_id: user.id,
      p_source: body.source,
      p_granted_types: body.grantedTypes ?? [],
      p_device_name: null,
    })
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    }
    return new Response(JSON.stringify({ connected: true }), { status: 200 })
  }

  const readings = body.readings ?? []
  if (readings.length === 0) {
    return new Response(JSON.stringify({ written: 0 }), { status: 200 })
  }

  const results: { userGoalId: string; ok: boolean; error?: string }[] = []

  for (const reading of readings) {
    // `manual` is required, not defaulted: a payload that omits it is a bug or
    // an attempt, and either way it must not become "not hand-entered".
    if (typeof reading.manual !== 'boolean' || typeof reading.value !== 'number') {
      results.push({ userGoalId: reading.userGoalId, ok: false, error: 'incomplete reading' })
      continue
    }

    const { error } = await admin.rpc('record_health_completion', {
      p_user_id: user.id,
      p_user_goal_id: reading.userGoalId,
      p_metric_value: reading.value,
      p_source: body.source,
      p_was_user_entered: reading.manual,
      p_completed_date: body.completedDate ?? null,
      p_source_device: reading.sourceDevice,
    })

    results.push({
      userGoalId: reading.userGoalId,
      ok: !error,
      error: error?.message,
    })
  }

  return new Response(
    JSON.stringify({ written: results.filter((r) => r.ok).length, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
