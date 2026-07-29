-- =============================================================================
-- Push notifications (docs/NEXT.md section 1) — automatic only, no user
-- toggles. Four triggers: badge earned, goal completed, forgot-a-goal
-- end-of-day reminder, friend message.
--
-- This migration wires the database side: where subscriptions live, and the
-- triggers that call out to an Edge Function when something notification-
-- worthy happens. The Edge Functions themselves (supabase/functions/) hold
-- the "what does the notification say" and "how is it actually sent" logic —
-- kept out of SQL so the copy/behavior can be iterated without a migration.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Subscriptions — one row per browser/device a user has granted permission on.
-- A person can have several (phone + desktop); sending fans out to all of
-- theirs and lets any that have gone stale (uninstalled, permission revoked)
-- fail individually without blocking the others.
-- -----------------------------------------------------------------------------

create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "users manage only their own push subscriptions"
  on push_subscriptions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- Reminder query — used by a scheduled Edge Function, not by any client.
--
-- "Forgot a goal" means: a daily goal with an active streak (completed
-- yesterday, streak >= 3 — an established habit, not a goal tried once) that
-- has no completion yet today. Revoked from anon/authenticated below since it
-- reads every user's data; only the scheduled job's service-role key may
-- call it.
-- -----------------------------------------------------------------------------

create or replace function goals_missed_today()
returns table (user_id uuid, user_goal_id uuid, title text)
language sql
stable
security definer
set search_path = public
as $$
  select g.user_id, g.id, g.title
  from user_goals g
  join goal_completions c
    on c.user_goal_id = g.id and c.completed_date = current_date - 1
  where g.active
    and g.goal_type = 'daily'
    and c.current_streak >= 3
    and not exists (
      select 1 from goal_completions c2
      where c2.user_goal_id = g.id and c2.completed_date = current_date
    );
$$;

revoke execute on function goals_missed_today() from public, anon, authenticated;
grant execute on function goals_missed_today() to service_role;

-- -----------------------------------------------------------------------------
-- Message recipients — centralizes the same "not a blocked pair" rule the
-- rest of chat already enforces (can_post_in_conversation), so a blocked
-- person is never notified about the block's other side and vice versa.
-- -----------------------------------------------------------------------------

create or replace function notification_recipients_for_message(p_message_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id
  from messages msg
  join conversation_members m on m.conversation_id = msg.conversation_id
  where msg.id = p_message_id
    and m.user_id <> msg.sender_id
    and not is_blocked_pair(m.user_id, msg.sender_id);
$$;

revoke execute on function notification_recipients_for_message(uuid) from public, anon, authenticated;
grant execute on function notification_recipients_for_message(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Webhook triggers — fire supabase_functions.http_request, the same trigger
-- function the Dashboard's "Database Webhooks" UI generates, so this can be
-- edited by hand or regenerated there. It POSTs a payload shaped like
-- { type, table, schema, record, old_record } to the given URL.
--
-- ⚠ Fill in <PROJECT_REF> and <WEBHOOK_SECRET> before running this migration
-- against a real project (see README "הקמת Supabase"). The secret is checked
-- by notify-event itself, so a request without it is rejected — this is the
-- only thing standing between the endpoint and the open internet, since a
-- database trigger has no user session to authenticate with.
-- -----------------------------------------------------------------------------

create trigger notify_on_badge_earned
  after insert on user_badges
  for each row execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.functions.supabase.co/notify-event',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

create trigger notify_on_goal_completed
  after update on user_goals
  for each row
  when (new.completed_at is not null and old.completed_at is null)
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.functions.supabase.co/notify-event',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );

create trigger notify_on_message
  after insert on messages
  for each row
  when (new.deleted_at is null)
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.functions.supabase.co/notify-event',
    'POST',
    '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}',
    '{}',
    '5000'
  );
