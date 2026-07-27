-- =============================================================================
-- Pisga — initial schema
-- Mirrors PRD section 11 ("מבנה נתונים מוצע").
--
-- Two deliberate deviations from the PRD table list, both forced by Supabase
-- rather than by product decisions:
--   * The PRD's `users` table is named `profiles` here. `auth.users` is owned
--     by Supabase Auth and cannot be extended directly, so the public-facing
--     row lives in `profiles` and shares its primary key with `auth.users.id`.
--   * Enum values are English identifiers (physical/academic/social/personal,
--     …) rather than the Hebrew labels used in the PRD prose. Hebrew is the
--     display layer's job (src/i18n) so the data stays language-neutral once
--     English is switched on.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- PRD 3: גופני / לימודי / חברתי / אישי
create type goal_category as enum ('physical', 'academic', 'social', 'personal');

-- PRD 4: יומית קבועה / תאריך יעד קצר / ארוכת טווח
create type goal_type as enum ('daily', 'deadline', 'long_term');

-- PRD 5: the four verification methods, one per goal.
create type verification_method as enum (
  'guided_session',      -- ביצוע מודרך: work timer → rest timer → repeat
  'sensor_sync',         -- סנכרון חיישן/API: Google Fit / HealthKit
  'daily_checkin',       -- צ'ק-אין יומי מבוסס אמון (מטרות הימנעות)
  'checkbox_reflection'  -- checkbox + הערת רפלקציה חובה
);

create type friendship_status as enum ('pending', 'accepted');
create type share_status as enum ('pending', 'accepted', 'declined');
create type app_language as enum ('he', 'en');
create type app_theme as enum ('light', 'dark', 'system');

-- -----------------------------------------------------------------------------
-- profiles  (PRD: users)
-- -----------------------------------------------------------------------------

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text        not null,
  display_name text,
  avatar_url   text,
  language     app_language not null default 'he',
  theme        app_theme    not null default 'system',
  -- Set once the opening questionnaire is finished or skipped (PRD 6.2).
  onboarded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- onboarding_answers  (PRD 6.2)
-- -----------------------------------------------------------------------------

create table onboarding_answers (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  question_key text not null,
  answer_value jsonb not null,
  answered_at  timestamptz not null default now(),
  -- Re-answering a question overwrites it, so the questionnaire stays editable.
  unique (user_id, question_key)
);

create index on onboarding_answers (user_id);

-- -----------------------------------------------------------------------------
-- goals_library  (PRD 6.3) — system-authored catalogue, read-only to clients
-- -----------------------------------------------------------------------------

create table goals_library (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  title_he            text not null,
  title_en            text not null,
  description_he      text,
  description_en      text,
  category            goal_category       not null,
  goal_type           goal_type           not null,
  verification        verification_method not null,
  -- Free-text hint shown in the library ("כל יום", "3 פעמים בשבוע"…).
  suggested_frequency text,
  -- Parameters the verification method needs at run time. Not in the PRD's
  -- field list, but a guided session is unimplementable without them:
  --   guided_session → { "sets": 3, "work_seconds": 60, "rest_seconds": 30 }
  --   sensor_sync    → { "metric": "steps", "target": 10000 }
  session_config      jsonb not null default '{}'::jsonb,
  sort_order          int  not null default 0,
  active              boolean not null default true,
  created_at          timestamptz not null default now()
);

create index on goals_library (category) where active;

-- -----------------------------------------------------------------------------
-- user_goals  (PRD 6.4/6.5)
-- -----------------------------------------------------------------------------

create table user_goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  -- Null for a user-authored goal; set when adopted from the library.
  library_id    uuid references goals_library (id) on delete set null,
  is_custom     boolean not null default false,
  title         text not null,
  description   text,
  category      goal_category       not null,
  goal_type     goal_type           not null,
  verification  verification_method not null,
  session_config jsonb not null default '{}'::jsonb,
  target_date   date,
  active        boolean not null default true,
  added_at      timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- PRD 3.1: the structured/personal split is what decides whether a goal
  -- counts toward points and ranking, so the two must never disagree.
  constraint custom_goals_have_no_library_row
    check ((is_custom and library_id is null) or (not is_custom and library_id is not null)),

  -- PRD 4: only a deadline or long-term goal carries a target date.
  constraint target_date_matches_goal_type
    check (goal_type <> 'daily' or target_date is null)
);

create index on user_goals (user_id) where active;

-- A library goal is adopted at most once per user. Scoped to non-null
-- library_id so a user can still hold any number of custom goals.
create unique index user_goals_one_adoption_per_library_goal
  on user_goals (user_id, library_id)
  where library_id is not null;

-- -----------------------------------------------------------------------------
-- goal_completions  (PRD 6.5)
-- -----------------------------------------------------------------------------

create table goal_completions (
  id              uuid primary key default gen_random_uuid(),
  user_goal_id    uuid not null references user_goals (id) on delete cascade,
  completed_date  date not null default current_date,
  -- Streak length as of this completion. Denormalised per the PRD so history
  -- and badge evaluation do not have to replay every prior row.
  current_streak  int  not null default 1,
  reflection_note text,
  created_at      timestamptz not null default now(),
  -- A goal counts once per day, which is also what makes streaks well-defined.
  unique (user_goal_id, completed_date)
);

create index on goal_completions (user_goal_id, completed_date desc);

-- -----------------------------------------------------------------------------
-- goal_milestones  (PRD 4 — long-term goals)
-- -----------------------------------------------------------------------------

create table goal_milestones (
  id             uuid primary key default gen_random_uuid(),
  user_goal_id   uuid not null references user_goals (id) on delete cascade,
  milestone_date date not null,
  description    text not null,
  completed      boolean not null default false,
  completed_at   timestamptz,
  sort_order     int not null default 0
);

create index on goal_milestones (user_goal_id, milestone_date);

-- -----------------------------------------------------------------------------
-- goal_shares  (PRD 6.4 — sharing a personal goal with a friend)
-- -----------------------------------------------------------------------------

create table goal_shares (
  id                  uuid primary key default gen_random_uuid(),
  user_goal_id        uuid not null references user_goals (id) on delete cascade,
  shared_with_user_id uuid not null references profiles (id) on delete cascade,
  status              share_status not null default 'pending',
  created_at          timestamptz not null default now(),
  unique (user_goal_id, shared_with_user_id)
);

create index on goal_shares (shared_with_user_id);

-- -----------------------------------------------------------------------------
-- badges / user_badges  (PRD 6.6)
--
-- NOTE: `criteria` is intentionally left unseeded. PRD section 13 lists the
-- exact award criteria per badge as an open question, so the awarding logic is
-- not implemented yet — only the storage it will need.
-- -----------------------------------------------------------------------------

create table badges (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title_he       text not null,
  title_en       text not null,
  description_he text,
  description_en text,
  icon_url       text,
  criteria       jsonb not null default '{}'::jsonb,
  sort_order     int not null default 0
);

create table user_badges (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references profiles (id) on delete cascade,
  badge_id  uuid not null references badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (user_id, badge_id)
);

create index on user_badges (user_id);

-- -----------------------------------------------------------------------------
-- friendships  (PRD 6.7)
-- -----------------------------------------------------------------------------

create table friendships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references profiles (id) on delete cascade,
  friend_id    uuid not null references profiles (id) on delete cascade,
  status       friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_friendship check (user_id <> friend_id),
  unique (user_id, friend_id)
);

create index on friendships (friend_id) where status = 'accepted';

-- =============================================================================
-- Helpers
-- =============================================================================

-- SECURITY DEFINER so the friendship lookup inside a friendships policy does
-- not re-enter that same policy.
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a))
  );
$$;

-- `user_goals` and `goal_shares` each need to consult the other to decide
-- visibility, which makes a pair of plain policies recurse. These SECURITY
-- DEFINER lookups break the cycle: they read the other table with RLS off, so
-- no policy re-enters itself. They answer only yes/no about a caller-supplied
-- id, so they leak nothing a policy would not already allow.
create or replace function owns_user_goal(p_goal_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_goals g where g.id = p_goal_id and g.user_id = p_user
  );
$$;

create or replace function is_goal_shared_with(p_goal_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from goal_shares s
    where s.user_goal_id = p_goal_id
      and s.shared_with_user_id = p_user
      and s.status = 'accepted'
  );
$$;

-- Owner or accepted friend — the read rule for anything hanging off a goal.
create or replace function can_view_user_goal(p_goal_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_goals g
    where g.id = p_goal_id
      and (g.user_id = p_user or are_friends(p_user, g.user_id))
  );
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger user_goals_set_updated_at
  before update on user_goals
  for each row execute function set_updated_at();

-- Every auth.users row gets a matching profile, including Google sign-ups
-- (where the display name and avatar arrive in raw_user_meta_data).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- record_goal_completion
--
-- Marking a goal done and computing its streak has to happen together: doing
-- it client-side lets a stale read write a wrong streak. `completed_date`
-- defaults to today but is a parameter so a late check-in can be backdated.
-- -----------------------------------------------------------------------------
create or replace function record_goal_completion(
  p_user_goal_id uuid,
  p_reflection_note text default null,
  p_completed_date date default current_date
)
returns goal_completions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_verification verification_method;
  v_previous_streak int;
  v_streak int;
  v_row goal_completions;
begin
  -- RLS on user_goals restricts this to goals the caller owns.
  select verification into v_verification
  from user_goals
  where id = p_user_goal_id and active;

  if not found then
    raise exception 'goal not found or inactive';
  end if;

  -- PRD 5: a reflection note is mandatory for this verification method — that
  -- requirement is what makes the checkbox mean anything.
  if v_verification = 'checkbox_reflection'
     and coalesce(btrim(p_reflection_note), '') = '' then
    raise exception 'reflection note is required for this goal';
  end if;

  select current_streak into v_previous_streak
  from goal_completions
  where user_goal_id = p_user_goal_id
    and completed_date = p_completed_date - 1;

  v_streak := coalesce(v_previous_streak, 0) + 1;

  insert into goal_completions (user_goal_id, completed_date, current_streak, reflection_note)
  values (p_user_goal_id, p_completed_date, v_streak, nullif(btrim(p_reflection_note), ''))
  on conflict (user_goal_id, completed_date)
  do update set reflection_note = excluded.reflection_note
  returning * into v_row;

  return v_row;
end;
$$;

-- =============================================================================
-- Row Level Security
--
-- Visibility model, from PRD 6.7: a user always sees their own rows, and an
-- accepted friend may read goals, completions and badges for progress
-- comparison. Nobody can write to anyone else's rows.
-- =============================================================================

alter table profiles            enable row level security;
alter table onboarding_answers  enable row level security;
alter table goals_library       enable row level security;
alter table user_goals          enable row level security;
alter table goal_completions    enable row level security;
alter table goal_milestones     enable row level security;
alter table goal_shares         enable row level security;
alter table badges              enable row level security;
alter table user_badges         enable row level security;
alter table friendships         enable row level security;

-- profiles ---------------------------------------------------------------
create policy "profiles are readable by self and friends"
  on profiles for select to authenticated
  using (id = auth.uid() or are_friends(auth.uid(), id));

create policy "users update their own profile"
  on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- onboarding_answers -----------------------------------------------------
create policy "users manage their own onboarding answers"
  on onboarding_answers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- goals_library ----------------------------------------------------------
create policy "the goal library is readable by any signed-in user"
  on goals_library for select to authenticated
  using (active);

-- user_goals -------------------------------------------------------------
create policy "users read their own goals, friends' goals, and shared goals"
  on user_goals for select to authenticated
  using (
    user_id = auth.uid()
    or are_friends(auth.uid(), user_id)
    or is_goal_shared_with(id, auth.uid())
  );

create policy "users insert their own goals"
  on user_goals for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update their own goals"
  on user_goals for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users delete their own goals"
  on user_goals for delete to authenticated
  using (user_id = auth.uid());

-- goal_completions -------------------------------------------------------
create policy "completions follow the visibility of their goal"
  on goal_completions for select to authenticated
  using (can_view_user_goal(user_goal_id, auth.uid()));

create policy "users write completions only for their own goals"
  on goal_completions for insert to authenticated
  with check (owns_user_goal(user_goal_id, auth.uid()));

create policy "users update completions only for their own goals"
  on goal_completions for update to authenticated
  using (owns_user_goal(user_goal_id, auth.uid()))
  with check (owns_user_goal(user_goal_id, auth.uid()));

create policy "users delete completions only for their own goals"
  on goal_completions for delete to authenticated
  using (owns_user_goal(user_goal_id, auth.uid()));

-- goal_milestones --------------------------------------------------------
create policy "milestones follow the visibility of their goal"
  on goal_milestones for select to authenticated
  using (can_view_user_goal(user_goal_id, auth.uid()));

create policy "users manage milestones only on their own goals"
  on goal_milestones for all to authenticated
  using (owns_user_goal(user_goal_id, auth.uid()))
  with check (owns_user_goal(user_goal_id, auth.uid()));

-- goal_shares ------------------------------------------------------------
create policy "shares are visible to the goal owner and the recipient"
  on goal_shares for select to authenticated
  using (shared_with_user_id = auth.uid() or owns_user_goal(user_goal_id, auth.uid()));

create policy "only the goal owner creates a share"
  on goal_shares for insert to authenticated
  with check (owns_user_goal(user_goal_id, auth.uid()));

-- The recipient accepts or declines; the owner can revoke.
create policy "recipient or owner updates a share"
  on goal_shares for update to authenticated
  using (shared_with_user_id = auth.uid() or owns_user_goal(user_goal_id, auth.uid()))
  with check (shared_with_user_id = auth.uid() or owns_user_goal(user_goal_id, auth.uid()));

create policy "the goal owner removes a share"
  on goal_shares for delete to authenticated
  using (owns_user_goal(user_goal_id, auth.uid()));

-- badges -----------------------------------------------------------------
create policy "the badge catalogue is readable by any signed-in user"
  on badges for select to authenticated using (true);

create policy "earned badges are readable by self and friends"
  on user_badges for select to authenticated
  using (user_id = auth.uid() or are_friends(auth.uid(), user_id));

-- No insert policy on user_badges: badges are awarded server-side once the
-- criteria in PRD section 13 are settled. Clients must never grant their own.

-- friendships ------------------------------------------------------------
create policy "users see friendships they are part of"
  on friendships for select to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());

create policy "users send their own friend requests"
  on friendships for insert to authenticated
  with check (user_id = auth.uid());

create policy "the addressee responds to a friend request"
  on friendships for update to authenticated
  using (friend_id = auth.uid()) with check (friend_id = auth.uid());

create policy "either side removes a friendship"
  on friendships for delete to authenticated
  using (user_id = auth.uid() or friend_id = auth.uid());
