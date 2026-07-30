-- =============================================================================
-- V2 — reading the metric from the phone's own health store.
--
-- Apple Health (HealthKit) on iPhone, Health Connect on Android — which is
-- also where Samsung Health writes its data, so one Android integration
-- covers Samsung, Fitbit and the rest rather than one per vendor.
--
-- THE PROBLEM THIS FILE EXISTS TO SOLVE.
--
-- Neither platform has a cloud API. Health data lives on the device and only
-- a native app that the user granted permission to can read it. That means
-- the number necessarily travels CLIENT → SERVER, which is exactly the shape
-- 0014 refused to accept for V2: a typed-in number wearing the ×1.2 sensor
-- multiplier is the cheapest way there is to inflate the growth table.
--
-- Three layers make the client an acceptable courier:
--
--   1. Manually-entered samples are refused. Both platforms record, per
--      sample, whether a human typed it — HealthKit's wasUserEntered,
--      Health Connect's recording method. Someone opening Health and typing
--      20,000 steps must not out-earn someone who walked.
--   2. Every completion keeps its provenance: which store, which device.
--      Without it there is nothing to audit after the fact.
--   3. The write is service-role only, behind an Edge Function that verifies
--      an App Attest / Play Integrity token. A ×1.2 write that `authenticated`
--      could make directly would defeat layers 1 and 2 in one curl.
--
-- Layers 1 and 2 are here. Layer 3 is here as the permission boundary; the
-- attestation check itself belongs to the Edge Function, which is the only
-- place a platform token can be verified.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Where a completion's number came from
-- -----------------------------------------------------------------------------

create type metric_source as enum (
  'manual',        -- the VS screens: a counter, a timer, a check-in
  'apple_health',  -- HealthKit, iOS
  'health_connect' -- Health Connect, Android (incl. Samsung Health)
);

alter table goal_completions
  add column source metric_source not null default 'manual',
  -- Free text on purpose: the platforms report device names we do not control
  -- ("iPhone 15 Pro", "Galaxy Watch6"), and an enum would go stale.
  add column source_device text;

comment on column goal_completions.source is
  'Where metric_value came from. Anything other than manual was read from the '
  'phone''s health store by the native app and is subject to 0015''s checks.';

-- -----------------------------------------------------------------------------
-- Which health store a user has connected
--
-- Deliberately NOT a token table. HealthKit and Health Connect have no OAuth
-- and no refresh tokens — permission is granted on the device, to the app, and
-- never leaves it. All the server can know is that a device said it is
-- connected, which is what this row is.
-- -----------------------------------------------------------------------------

create table health_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  source        metric_source not null,
  device_name   text,
  -- What the user allowed on the device: steps, distance, sleep. Recorded so
  -- a screen can say "sleep is not shared" instead of silently showing zero.
  granted_types text[] not null default '{}',
  connected_at  timestamptz not null default now(),
  last_synced_at timestamptz,
  -- One row per store per user; reconnecting updates it.
  unique (user_id, source),
  constraint health_source_is_not_manual check (source <> 'manual')
);

create index on health_sources (user_id);

alter table health_sources enable row level security;

-- The user may see and remove their own connection. They may NOT insert or
-- update one: "connected" is asserted by the native app through the ingest
-- function, not claimed by the browser.
create policy "users read their own health sources"
  on health_sources for select to authenticated
  using (user_id = auth.uid());

create policy "users disconnect their own health sources"
  on health_sources for delete to authenticated
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- The ingest path
-- -----------------------------------------------------------------------------

/**
 * Records a completion from a phone's health store, on behalf of a user.
 *
 * The sibling of record_structured_completion, which is `security invoker` and
 * keys off auth.uid(). This one cannot: it runs inside an Edge Function after
 * the device attestation has been checked, so the caller is the service role
 * and the user is an argument.
 *
 * p_was_user_entered is the honesty flag from the platform. It is a required
 * argument rather than a defaulted one so that a caller cannot omit it and get
 * the benefit of the doubt.
 */
create or replace function record_health_completion(
  p_user_id          uuid,
  p_user_goal_id     uuid,
  p_metric_value     numeric,
  p_source           metric_source,
  p_was_user_entered boolean,
  p_completed_date   date default current_date,
  p_source_device    text default null
)
returns goal_completions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal   record;
  v_trust  numeric;
  v_streak int;
  v_prev   int;
  v_row    goal_completions;
begin
  if p_source = 'manual' then
    raise exception 'record_health_completion is for device data; use record_structured_completion';
  end if;

  -- Layer 1. A number a human typed into Apple Health is a self-report that
  -- took a detour — it is not what V2 is worth ×1.2 for.
  if p_was_user_entered then
    raise exception 'this reading was entered by hand and cannot verify a sensor goal';
  end if;

  if p_metric_value is null or p_metric_value < 0 then
    raise exception 'a health reading cannot be negative';
  end if;

  select ug.*, g.verification_allowed
    into v_goal
  from user_goals ug
  left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.id = p_user_goal_id and ug.user_id = p_user_id and ug.active;

  if not found then
    raise exception 'goal not found or inactive';
  end if;

  -- The goal has to actually accept sensor verification. Reading someone's
  -- step count is no reason to score a goal that is measured another way.
  if v_goal.verification_code is distinct from 'V2'
     and (v_goal.verification_allowed is null
          or not ('V2' = any (v_goal.verification_allowed))) then
    raise exception 'this goal does not allow sensor verification';
  end if;

  -- The user must have connected this store. Without the row there is no
  -- record that permission was ever granted on the device.
  if not exists (
    select 1 from health_sources
    where user_id = p_user_id and source = p_source
  ) then
    raise exception 'no % connection for this user', p_source;
  end if;

  v_trust := verification_trust_multiplier('V2');

  select current_streak into v_prev
  from goal_completions
  where user_goal_id = p_user_goal_id and completed_date = p_completed_date - 1;
  v_streak := coalesce(v_prev, 0) + 1;

  -- A sensor legitimately reports yesterday — that is the point of a sensor,
  -- and protection 7 restricts backfill for V4/V7 only. Re-running a day is
  -- normal too: the step count climbs all day.
  insert into goal_completions (
    user_goal_id, completed_date, current_streak,
    metric_value, trust_multiplier, source, source_device
  )
  values (
    p_user_goal_id, p_completed_date, v_streak,
    p_metric_value, v_trust, p_source, p_source_device
  )
  on conflict (user_goal_id, completed_date) do update set
    metric_value     = excluded.metric_value,
    trust_multiplier = excluded.trust_multiplier,
    source           = excluded.source,
    source_device    = excluded.source_device
  returning * into v_row;

  update health_sources
     set last_synced_at = now()
   where user_id = p_user_id and source = p_source;

  perform evaluate_badges(p_user_id);
  perform compute_weekly_metrics(p_user_goal_id, week_start(p_completed_date));

  return v_row;
end;
$$;

-- Layer 3. The whole design rests on this line: if `authenticated` could call
-- this, the browser would be able to mint ×1.2 completions with
-- p_was_user_entered => false and every check above would be theatre.
revoke execute on function record_health_completion(uuid, uuid, numeric, metric_source, boolean, date, text)
  from public, anon, authenticated;
grant execute on function record_health_completion(uuid, uuid, numeric, metric_source, boolean, date, text)
  to service_role;

/**
 * Registers (or refreshes) a user's connection to a health store.
 *
 * Also service-role only, and for the same reason: the client asserting
 * "I am connected to Apple Health" is precisely the claim that has to be
 * backed by a real permission grant on a real device.
 */
create or replace function connect_health_source(
  p_user_id       uuid,
  p_source        metric_source,
  p_granted_types text[],
  p_device_name   text default null
)
returns health_sources
language plpgsql
security definer
set search_path = public
as $$
declare v_row health_sources;
begin
  if p_source = 'manual' then
    raise exception 'manual is not a health source';
  end if;

  insert into health_sources (user_id, source, device_name, granted_types)
  values (p_user_id, p_source, p_device_name, coalesce(p_granted_types, '{}'))
  on conflict (user_id, source) do update set
    device_name   = excluded.device_name,
    granted_types = excluded.granted_types,
    connected_at  = now()
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function connect_health_source(uuid, metric_source, text[], text)
  from public, anon, authenticated;
grant execute on function connect_health_source(uuid, metric_source, text[], text)
  to service_role;

-- -----------------------------------------------------------------------------
-- Which of the user's goals a given health metric feeds
--
-- The native layer reads step counts and distances; it has no idea which of
-- the user's goals those belong to. This resolves it server-side, so the
-- mapping lives with the library rather than being duplicated in Swift and
-- in Kotlin.
-- -----------------------------------------------------------------------------

-- Readable by the signed-in user for their own goals only — the app needs to
-- know what to ask the phone for, and this leaks nothing they cannot already
-- select from user_goals.
--
-- `code` is returned because metric_key alone is ambiguous: P-07 (running) and
-- P-09 (cycling) are both km_per_week, and the phone reports those as
-- different workout types. The client needs to know which is which.
create or replace function my_health_goals()
returns table (
  user_goal_id uuid,
  code         text,
  metric_key   text,
  metric_unit  text,
  goal_title   text
)
language sql
stable
security invoker
set search_path = public
as $$
  select ug.id, g.code, g.metric_key, g.metric_unit, ug.title
  from user_goals ug
  join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.user_id = auth.uid()
    and ug.active
    and ('V2' = any (g.verification_allowed) or ug.verification_code = 'V2');
$$;
