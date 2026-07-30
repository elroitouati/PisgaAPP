-- =============================================================================
-- Structured goals + the growth scoring engine.
-- Implements section 11 of Pisga_Goals_Library_v1.md, plus the storage the
-- protections in section 10 need in order to be enforceable at all.
--
-- The organising idea of that document: a structured goal is DATA, not code.
-- Adding a goal must be an INSERT, never a new component. Everything below
-- exists to make that true — the 14 fields of section 2 live on
-- goals_library, the per-user level state lives on user_goals, and the
-- scoring engine reads/writes two new tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Verification catalogue (section 5) — V0–V8.
--
-- Supersedes the four-value `verification_method` enum from 0001, which
-- covered only what became V1, V2, V4 and V5. That enum is NOT dropped: the
-- existing screens still read `user_goals.verification`, and dropping it here
-- would break the app between this migration and the UI work. Both columns
-- are carried, `verification_code` is the one the engine uses, and the old
-- column is retired once nothing reads it.
-- -----------------------------------------------------------------------------

create type verification_code as enum (
  'V0',  -- self-check, no verification. PERSONAL GOALS ONLY (section 5.1)
  'V1',  -- guided timer            ×1.0
  'V2',  -- sensor sync             ×1.2
  'V3',  -- rep/set counter         ×1.0
  'V4',  -- avoidance check-in      ×1.0   no backfill (protection 7)
  'V5',  -- "tell what happened"    ×1.0   min 40 chars
  'V6',  -- media proof             ×1.1
  'V7',  -- focus timer             ×1.1   no backfill (protection 7)
  'V8'   -- output / quiz           ×1.0
);

/**
 * Trust multiplier per section 5. Kept in SQL rather than only in TypeScript
 * because the weekly points are computed server-side (see 0011) and must not
 * depend on a client-supplied number.
 */
create or replace function verification_trust_multiplier(p_code verification_code)
returns numeric
language sql
immutable
as $$
  select case p_code
    when 'V0' then 0.6
    when 'V2' then 1.2
    when 'V6' then 1.1
    when 'V7' then 1.1
    else 1.0
  end;
$$;

-- -----------------------------------------------------------------------------
-- goals_library — the 14 fields of section 2.
--
-- The table is empty as of 0009 (the placeholder content was cleared), so
-- every column below can be added without a backfill. They stay nullable at
-- the database level because `goals_library` is also the home of the four
-- legacy columns; the seed in 0011 fills all of them, and the "a structured
-- goal is fully specified" invariant is enforced by the CHECK at the end of
-- this block rather than by NOT NULL on each column.
-- -----------------------------------------------------------------------------

alter table goals_library
  add column code                  text unique,
  add column subcategory           text,
  add column metric_key            text,
  add column metric_unit           text,
  add column metric_direction      text check (metric_direction in ('up', 'down')),
  add column metric_ceiling        numeric check (metric_ceiling is null or metric_ceiling > 0),
  add column base_points           int     check (base_points is null or base_points > 0),
  add column level_1_value         numeric check (level_1_value is null or level_1_value > 0),
  add column level_step            numeric check (level_step is null or level_step > 0),
  add column verification_default  verification_code,
  add column verification_allowed  verification_code[],
  add column calibration_questions jsonb   not null default '[]'::jsonb,
  add column custom_widget         text,

  -- ⚠ Beyond section 11. Section 12 leaves open how the four "times per
  -- month" goals (S-07, S-13, S-14, I-19) compute Δ, and proposes a rolling
  -- 4-week window. That decision is unanswerable without somewhere to record
  -- which goals it applies to, so the column exists now and defaults to the
  -- weekly behaviour every other goal already has.
  add column measurement_window    text not null default 'week'
    check (measurement_window in ('week', 'month'));

-- Section 5: "a structured goal is always verified. V0 is not an alternative
-- for a structured goal." Enforced here rather than trusted to the seed.
alter table goals_library
  add constraint library_verification_is_never_v0
    check (verification_default is null or verification_default <> 'V0');

alter table goals_library
  add constraint library_default_is_an_allowed_verification
    check (
      verification_default is null
      or verification_allowed is null
      or verification_default = any (verification_allowed)
    );

alter table goals_library
  add constraint library_allowed_excludes_v0
    check (verification_allowed is null or not ('V0' = any (verification_allowed)));

-- Either a row is a fully specified structured goal, or it is not one at all.
-- A half-filled row would reach the scoring engine and produce silent zeroes.
alter table goals_library
  add constraint library_row_is_fully_specified
    check (
      num_nonnulls(code, metric_key, metric_unit, metric_direction,
                   base_points, level_1_value, level_step, verification_default)
        in (0, 8)
    );

create index on goals_library (subcategory);

-- -----------------------------------------------------------------------------
-- user_goals — the level state of one person on one goal.
-- -----------------------------------------------------------------------------

alter table user_goals
  -- The target the user is currently held to, in the goal's own metric unit.
  add column current_level_value   numeric check (current_level_value is null or current_level_value > 0),
  -- The highest level ever reached. Section 4.3: this never goes down — it is
  -- what makes "hard for me" a real cost and sandbagging pointless.
  add column personal_record_value numeric check (personal_record_value is null or personal_record_value > 0),
  -- Drives the 72-hour cooldown of protection 6.
  add column level_changed_at      timestamptz,
  -- Q2 — how many days a week the user intends to perform this.
  add column target_frequency      int check (target_frequency is null or target_frequency between 1 and 7),
  add column calibration_answers   jsonb not null default '{}'::jsonb,
  add column verification_code     verification_code,

  -- Section 5.1 — converting a structured goal into a personal one.
  add column converted_from_goal_id uuid references goals_library (id) on delete set null,
  add column converted_at           timestamptz,
  add column counts_for_ranking     boolean not null default true;

-- Section 4.1.1: the level may sit at or below the personal record, never above.
-- An "up" level change raises both together.
alter table user_goals
  add constraint level_never_exceeds_personal_record
    check (
      current_level_value is null
      or personal_record_value is null
      or current_level_value <= personal_record_value
    );

-- Section 5.1 + section 1: verification is what buys entry into the ranking.
-- A personal goal is out of the ranking; a V0 goal is by definition personal.
alter table user_goals
  add constraint v0_goals_are_personal_and_unranked
    check (verification_code is distinct from 'V0' or (is_custom and not counts_for_ranking));

alter table user_goals
  add constraint structured_goals_are_ranked
    check (is_custom or counts_for_ranking);

create index on user_goals (converted_from_goal_id) where converted_from_goal_id is not null;

/**
 * Protection 1 — at most 5 active structured goals per category.
 *
 * A trigger rather than a client-side check: without it the points system
 * becomes a game of "who added more goals", which is the opposite of what
 * the engine measures. Converting a goal to personal (section 5.1) frees a
 * slot, because the count is of structured goals only.
 */
create or replace function enforce_structured_goal_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  if new.is_custom or not new.active then
    return new;
  end if;

  select count(*) into v_count
  from user_goals
  where user_id = new.user_id
    and category = new.category
    and active
    and not is_custom
    and id <> new.id;

  if v_count >= 5 then
    raise exception 'you already have 5 active structured goals in this category';
  end if;

  return new;
end;
$$;

create trigger user_goals_structured_limit
  before insert or update of active, is_custom, category on user_goals
  for each row execute function enforce_structured_goal_limit();

-- -----------------------------------------------------------------------------
-- weekly_metrics — the heart of the improvement engine.
--
-- One row per goal per week. This is both the output of the scoring engine
-- and its input: the baseline B of section 3.2 is the highest total_value in
-- the previous four rows, so the table reads its own history.
--
-- No client write policy, by design. Points that a client could INSERT are
-- points a client could forge, and this table feeds the friends leaderboard.
-- Writes happen only through the SECURITY DEFINER function in 0011, exactly
-- as user_badges has worked since 0003.
-- -----------------------------------------------------------------------------

create table weekly_metrics (
  id                 uuid primary key default gen_random_uuid(),
  user_goal_id       uuid not null references user_goals (id) on delete cascade,
  -- Sunday-start, via week_start() from 0003 — the Israeli calendar week the
  -- badge criteria already use. Two week definitions in one product would
  -- eventually disagree.
  week_start         date not null,

  total_value        numeric not null default 0 check (total_value >= 0),
  baseline_value     numeric          check (baseline_value is null or baseline_value >= 0),
  -- Signed: negative is a real result and is displayed. Protection 3 caps the
  -- positive side at 1.0 (100%); a "×5 in one week" reading is a measurement
  -- error or an exploit, not growth.
  delta_pct          numeric          check (delta_pct is null or delta_pct <= 1.0),
  -- Section 4.1.1, the "hard for me" penalty: current level ÷ personal record,
  -- floored at 0.6 so performing small always beats not performing.
  level_multiplier   numeric not null default 1.0
                       check (level_multiplier between 0.6 and 1.0),
  -- False for weeks the goal spent as a personal goal (section 5.1 rule 3):
  -- those weeks are outside the baseline window entirely, in either direction.
  counted_for_ranking boolean not null default true,

  -- Protection 4: no negative points and nothing is ever deducted. The penalty
  -- works only by shrinking future earnings, never by taking back what was
  -- earned — so every one of these is non-negative by constraint, not by
  -- convention.
  execution_points    int not null default 0 check (execution_points >= 0),
  -- Protection 2 caps improvement at 100 per category per week. A single goal
  -- can reach BP×3 = 120 before that cap, so the ceiling is asserted here to
  -- make it impossible for an uncapped value to be stored at all.
  improvement_points  int not null default 0 check (improvement_points between 0 and 100),
  maintenance_points  int not null default 0 check (maintenance_points >= 0),
  level_bonus_points  int not null default 0 check (level_bonus_points >= 0),
  total_points        int not null default 0 check (total_points >= 0),

  computed_at        timestamptz not null default now(),

  constraint weekly_metrics_one_row_per_goal_week unique (user_goal_id, week_start)
);

-- The baseline lookup ("highest total_value in the previous 4 weeks") is the
-- engine's hottest query and drives this index's column order.
create index on weekly_metrics (user_goal_id, week_start desc);

alter table weekly_metrics enable row level security;

-- Friends can read these: the growth leaderboard in design 12c ranks friends
-- by weekly points. Same visibility rule goal_completions has used since 0001.
create policy "you and your friends read your weekly metrics"
  on weekly_metrics for select to authenticated
  using (can_view_user_goal(user_goal_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- level_changes — the audit log behind protections 3 and 6.
--
-- Every "easy for me" / "hard for me" press lands here. It is what makes the
-- 72-hour cooldown checkable and what proves a level-up bonus was paid for a
-- genuine personal record rather than for the fifth lap of a down-up cycle.
-- Append-only from the client's perspective: no write policy, same reasoning
-- as weekly_metrics.
-- -----------------------------------------------------------------------------

create table level_changes (
  id                  uuid primary key default gen_random_uuid(),
  user_goal_id        uuid not null references user_goals (id) on delete cascade,
  direction           text not null check (direction in ('up', 'down')),
  from_value          numeric not null check (from_value > 0),
  to_value            numeric not null check (to_value > 0),
  -- Section 4.1: the level-up bonus is paid only on a NEW personal record, so
  -- that down-then-up cycling cannot be farmed.
  was_personal_record boolean not null default false,
  -- Section 4.2: a drop the app itself proposed after two misses keeps the
  -- streak. The points penalty still applies, and the UI has to say so.
  was_system_suggested boolean not null default false,
  changed_at          timestamptz not null default now(),

  constraint level_change_actually_changes check (from_value <> to_value),
  constraint level_change_direction_matches_values
    check ((direction = 'up') = (to_value > from_value))
);

create index on level_changes (user_goal_id, changed_at desc);

alter table level_changes enable row level security;

create policy "you and your friends read your level changes"
  on level_changes for select to authenticated
  using (can_view_user_goal(user_goal_id, auth.uid()));

-- -----------------------------------------------------------------------------
-- goal_completions — one performance, in the goal's own metric.
--
-- The existing table records THAT a goal was done and the streak; the engine
-- also needs HOW MUCH, because total_value for the week is the sum of these
-- and Δ is measured on it. Nullable: a completion recorded before this
-- migration, or on a goal with no numeric metric, has no value to report.
-- -----------------------------------------------------------------------------

alter table goal_completions
  add column metric_value numeric check (metric_value is null or metric_value >= 0),
  -- The trust multiplier that applied at the moment of completion. Stored
  -- rather than looked up, so that changing a goal's verification method
  -- later cannot silently re-price completions already earned.
  add column trust_multiplier numeric not null default 1.0
    check (trust_multiplier between 0.6 and 1.3);
