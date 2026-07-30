-- =============================================================================
-- The growth scoring engine, server-side (section 3).
--
-- src/lib/growth.ts implements the same formula as a pure function, and is
-- unit-tested against the worked example in section 3.3. This file is the
-- authority: weekly_metrics has no client write policy, so the numbers that
-- reach the friends leaderboard are the ones computed here. Both are tested
-- against that same example — one so the maths is provable, one so it cannot
-- be forged.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Fix from 0010: the personal-record ceiling is direction-dependent.
--
-- For a `down` goal a better level is a SMALLER number, so a screen-time
-- record of 120 minutes with a current level of 180 is a legitimate state
-- that `current <= record` rejects. Replaced with a trigger that can read the
-- goal's direction, which a CHECK constraint cannot.
-- -----------------------------------------------------------------------------

alter table user_goals drop constraint level_never_exceeds_personal_record;

create or replace function enforce_level_within_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_direction text;
begin
  if new.current_level_value is null or new.personal_record_value is null then
    return new;
  end if;

  select metric_direction into v_direction
  from goals_library
  where id = coalesce(new.library_id, new.converted_from_goal_id);

  -- A personal goal with no library row behind it has no direction to check.
  if v_direction is null then
    return new;
  end if;

  if v_direction = 'up' and new.current_level_value > new.personal_record_value then
    raise exception 'the current level cannot exceed the personal record';
  end if;
  if v_direction = 'down' and new.current_level_value < new.personal_record_value then
    raise exception 'the current level cannot be better than the personal record';
  end if;

  return new;
end;
$$;

create trigger user_goals_level_within_record
  before insert or update of current_level_value, personal_record_value on user_goals
  for each row execute function enforce_level_within_record();

-- -----------------------------------------------------------------------------
-- Engine primitives — one per concept in section 3.2, so each can be tested
-- and read on its own.
-- -----------------------------------------------------------------------------

/** Section 3.4 — the single global dial. */
create or replace function points_scale()
returns numeric language sql immutable as $$ select 1.0::numeric $$;

/**
 * Section 4.1.1 — the "hard for me" penalty as a ratio against the user's own
 * record. Inverted for a `down` goal, where a better level is a smaller
 * number; see the trigger above for why this cannot be a single expression.
 */
create or replace function growth_level_multiplier(
  p_current numeric, p_record numeric, p_direction text
)
returns numeric
language sql
immutable
as $$
  select case
    when p_record is null or p_current is null or p_record <= 0 or p_current <= 0 then 1.0
    else greatest(0.6, least(1.0,
      case when p_direction = 'down' then p_record / p_current else p_current / p_record end
    ))
  end;
$$;

/**
 * Section 3.2b — the baseline: the peak of the last four RANKED weeks,
 * floored at the goal's opening level.
 *
 * `counted_for_ranking` is what excludes weeks the goal spent as a personal
 * goal (section 5.1 rule 3) — those weeks are outside the window in either
 * direction, so converting cannot be used to launder a weak or a strong week.
 */
create or replace function growth_baseline(p_user_goal_id uuid, p_week_start date)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    -- The WEEKLY floor, not the per-performance level: section 3.3 converts
    -- "L1 = 15/day" into a 105/week baseline before comparing. Flooring a
    -- weekly total with a daily number would be no floor at all.
    coalesce((select coalesce(g.level_1_weekly_value, g.level_1_value)
              from user_goals ug
              left join goals_library g
                on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
              where ug.id = p_user_goal_id), 0),
    coalesce((select max(m.total_value)
              from weekly_metrics m
              where m.user_goal_id = p_user_goal_id
                and m.counted_for_ranking
                and m.week_start < p_week_start
                and m.week_start >= p_week_start - interval '4 weeks'), 0)
  );
$$;

/**
 * Section 3.2 — computes and stores one goal's week.
 *
 * SECURITY DEFINER and the only writer of weekly_metrics. Idempotent: it can
 * be re-run for the same week as more completions land, and recomputes from
 * the completions rather than accumulating.
 */
create or replace function compute_weekly_metrics(p_user_goal_id uuid, p_week_start date)
returns weekly_metrics
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal        record;
  v_bp          numeric;
  v_direction   text;
  v_multiplier  numeric;
  v_baseline    numeric;
  v_total       numeric;
  v_delta       numeric;
  v_execution   numeric;
  v_improvement numeric;
  v_maintenance numeric;
  v_bonus       numeric;
  v_age_weeks   int;
  v_row         weekly_metrics;
begin
  select ug.*, g.base_points, g.metric_direction, g.level_1_value
    into v_goal
  from user_goals ug
  left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.id = p_user_goal_id;

  if not found then
    raise exception 'goal not found';
  end if;

  v_bp        := coalesce(v_goal.base_points, 0);
  v_direction := coalesce(v_goal.metric_direction, 'up');
  v_multiplier := growth_level_multiplier(
    v_goal.current_level_value, v_goal.personal_record_value, v_direction);

  select coalesce(sum(c.metric_value), 0)
    into v_total
  from goal_completions c
  where c.user_goal_id = p_user_goal_id
    and week_start(c.completed_date) = p_week_start;

  v_baseline := growth_baseline(p_user_goal_id, p_week_start);

  -- Section 10.3: capped on the positive side only. A negative delta is a
  -- real result the progress screen shows; it simply scores zero.
  if v_baseline > 0 then
    v_delta := least(1.0, case
      when v_direction = 'down' then (v_baseline - v_total) / v_baseline
      else (v_total - v_baseline) / v_baseline
    end);
  else
    v_delta := 0;
  end if;

  -- (a) Execution — the trust multiplier is the one recorded at completion
  -- time, so re-pricing a goal's verification later cannot re-price history.
  select coalesce(sum(v_bp * c.trust_multiplier * v_multiplier), 0)
    into v_execution
  from goal_completions c
  where c.user_goal_id = p_user_goal_id
    and week_start(c.completed_date) = p_week_start;

  -- (b) Improvement — section 10.8 withholds it for the goal's first two
  -- weeks, when there is nothing real to measure against.
  v_age_weeks := greatest(0, (p_week_start - week_start(v_goal.added_at::date)) / 7);
  if v_delta > 0 and v_age_weeks >= 2 then
    v_improvement := v_bp * 3 * v_delta;
  else
    v_improvement := 0;
  end if;

  -- (c) Maintenance — denied at a reduced multiplier, which is the second
  -- half of the "hard for me" penalty rather than an oversight (section 3.2c).
  if v_delta <= 0 and v_total >= 0.95 * v_baseline and v_multiplier = 1.0 then
    v_maintenance := v_bp * 0.3;
  else
    v_maintenance := 0;
  end if;

  -- (d) Level-up bonus — only for a level change this week that set a new
  -- personal record, so down-then-up cycling cannot be farmed (section 4.3).
  select coalesce(sum(v_bp * 0.5), 0)
    into v_bonus
  from level_changes lc
  where lc.user_goal_id = p_user_goal_id
    and lc.was_personal_record
    and week_start(lc.changed_at::date) = p_week_start;

  insert into weekly_metrics (
    user_goal_id, week_start, total_value, baseline_value, delta_pct,
    level_multiplier, counted_for_ranking,
    execution_points, improvement_points, maintenance_points,
    level_bonus_points, total_points, computed_at
  )
  values (
    p_user_goal_id, p_week_start, v_total, v_baseline, v_delta,
    v_multiplier, v_goal.counts_for_ranking,
    round(v_execution * points_scale()),
    -- Section 10.2's category ceiling is applied by the caller across the
    -- category's goals; this per-row clamp is the backstop that keeps an
    -- uncapped value from ever reaching the table.
    least(100, round(v_improvement * points_scale())),
    round(v_maintenance * points_scale()),
    round(v_bonus * points_scale()),
    round(v_execution * points_scale())
      + least(100, round(v_improvement * points_scale()))
      + round(v_maintenance * points_scale())
      + round(v_bonus * points_scale()),
    now()
  )
  on conflict (user_goal_id, week_start) do update set
    total_value        = excluded.total_value,
    baseline_value     = excluded.baseline_value,
    delta_pct          = excluded.delta_pct,
    level_multiplier   = excluded.level_multiplier,
    counted_for_ranking = excluded.counted_for_ranking,
    execution_points   = excluded.execution_points,
    improvement_points = excluded.improvement_points,
    maintenance_points = excluded.maintenance_points,
    level_bonus_points = excluded.level_bonus_points,
    total_points       = excluded.total_points,
    computed_at        = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Adoption and calibration (S2, section 6)
-- -----------------------------------------------------------------------------

/**
 * Section 6 — turns the calibration answers into an opening level and adds
 * the goal.
 *
 * The 0.6 coefficient is a product decision, not a training one: a user who
 * finishes their first session comes back, and a user who breaks in the
 * second set disappears. `p_level_1_value` lets the caller pass the computed
 * level so the same rule can live in one place on the client (the S2 screen
 * has to preview it), while the floor at the library's L1 is enforced here.
 */
create or replace function adopt_structured_goal(
  p_library_id uuid,
  p_level_1_value numeric,
  p_target_frequency int default null,
  p_calibration_answers jsonb default '{}'::jsonb,
  p_verification verification_code default null
)
returns user_goals
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_lib  goals_library;
  v_code verification_code;
  v_level numeric;
  v_row  user_goals;
begin
  select * into v_lib from goals_library where id = p_library_id and active;
  if not found then
    raise exception 'that goal is not in the library';
  end if;
  if v_lib.code is null then
    raise exception 'that library row is not a structured goal';
  end if;

  v_code := coalesce(p_verification, v_lib.verification_default);
  if not (v_code = any (v_lib.verification_allowed)) then
    raise exception 'that verification method is not allowed for this goal';
  end if;

  -- Never open below the library's floor: L1 is also the baseline floor, and
  -- a level beneath it would make the first weeks unscoreable.
  v_level := greatest(coalesce(p_level_1_value, v_lib.level_1_value), v_lib.level_1_value);

  insert into user_goals (
    user_id, library_id, is_custom, title, description, category, goal_type,
    verification, verification_code, session_config,
    current_level_value, personal_record_value, target_frequency,
    calibration_answers, counts_for_ranking
  )
  values (
    auth.uid(), v_lib.id, false, v_lib.title_he, v_lib.description_he,
    v_lib.category, v_lib.goal_type, v_lib.verification, v_code, v_lib.session_config,
    v_level, v_level, p_target_frequency, p_calibration_answers, true
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Level changes (S3, section 4)
-- -----------------------------------------------------------------------------

/**
 * Section 4 — "easy for me" / "hard for me".
 *
 * Everything that makes this a real mechanism rather than a slider lives
 * here: the 72-hour cooldown (protection 6), the personal record that never
 * falls (section 4.3), the L1 floor, and the bonus that is paid only for a
 * genuinely new record so cycling cannot be farmed.
 */
create or replace function change_goal_level(
  p_user_goal_id uuid,
  p_direction text,
  p_system_suggested boolean default false
)
returns user_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal  record;
  v_step  numeric;
  v_from  numeric;
  v_to    numeric;
  v_is_record boolean := false;
  v_row   user_goals;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'direction must be up or down';
  end if;

  select ug.*, g.level_step, g.level_1_value, g.metric_direction
    into v_goal
  from user_goals ug
  left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.id = p_user_goal_id and ug.user_id = auth.uid();

  if not found then
    raise exception 'goal not found or not owned by you';
  end if;
  if v_goal.level_step is null or v_goal.current_level_value is null then
    raise exception 'this goal has no level to change';
  end if;

  -- Protection 6. A system-suggested drop after two misses (section 4.2) is
  -- still a level change and still waits its turn.
  if v_goal.level_changed_at is not null
     and v_goal.level_changed_at > now() - interval '72 hours' then
    raise exception 'you can change this level again 72 hours after the last change';
  end if;

  v_step := v_goal.level_step;
  v_from := v_goal.current_level_value;

  -- "Up" means a better level, which for a `down` goal is a smaller number.
  if (p_direction = 'up') = (coalesce(v_goal.metric_direction, 'up') = 'up') then
    v_to := v_from + v_step;
  else
    v_to := v_from - v_step;
  end if;

  -- Section 4.1: a drop never goes below the library's opening level.
  if coalesce(v_goal.metric_direction, 'up') = 'up' then
    v_to := greatest(v_to, v_goal.level_1_value);
    v_is_record := v_to > v_goal.personal_record_value;
  else
    v_to := least(v_to, v_goal.level_1_value);
    v_is_record := v_to < v_goal.personal_record_value;
  end if;

  -- The L1 clamp above can not only stop the move but reverse it, if the level
  -- somehow sits below the library floor. Checking equality alone would let a
  -- "down" press be written as a level rise.
  if v_to = v_from or (p_direction = 'up') <> (v_to > v_from) then
    raise exception 'this goal is already at its opening level';
  end if;

  update user_goals
  set current_level_value  = v_to,
      -- Section 4.3: the record never falls. That is what keeps the penalty
      -- real and makes sandbagging pointless.
      personal_record_value = case when v_is_record then v_to else personal_record_value end,
      level_changed_at     = now(),
      updated_at           = now()
  where id = p_user_goal_id
  returning * into v_row;

  insert into level_changes (
    user_goal_id, direction, from_value, to_value,
    was_personal_record, was_system_suggested
  )
  values (p_user_goal_id, p_direction, v_from, v_to, v_is_record, p_system_suggested);

  perform compute_weekly_metrics(p_user_goal_id, week_start(current_date));

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Completions (the VS screens)
-- -----------------------------------------------------------------------------

/**
 * Records one verified performance and re-scores the week.
 *
 * The trust multiplier is resolved here rather than accepted from the client,
 * and stored on the row so a later change to the goal's verification method
 * cannot re-price completions already earned. Protection 7 — V4 and V7 have
 * no backfill — is enforced here too: an avoidance goal that can be ticked a
 * week late is worthless.
 */
create or replace function record_structured_completion(
  p_user_goal_id uuid,
  p_metric_value numeric,
  p_reflection_note text default null,
  p_completed_date date default current_date,
  p_composite boolean default false
)
returns goal_completions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_goal   record;
  v_trust  numeric;
  v_streak int;
  v_prev   int;
  v_row    goal_completions;
begin
  select ug.*, g.metric_direction
    into v_goal
  from user_goals ug
  left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.id = p_user_goal_id and ug.user_id = auth.uid() and ug.active;

  if not found then
    raise exception 'goal not found or inactive';
  end if;

  -- Protection 7.
  if v_goal.verification_code in ('V4', 'V7') and p_completed_date <> current_date then
    raise exception 'this goal cannot be filled in retroactively';
  end if;

  -- Section 5: V5 stays light on purpose — 40 characters, not 200. The moment
  -- logging feels like homework is the moment people stop logging.
  if v_goal.verification_code = 'V5' and length(coalesce(btrim(p_reflection_note), '')) < 40 then
    raise exception 'tell us what happened — at least 40 characters';
  end if;

  v_trust := verification_trust_multiplier(v_goal.verification_code);
  -- Section 5: a composite (e.g. timer + photo) is the higher of the two plus
  -- 0.1, capped at 1.3.
  if p_composite then
    v_trust := least(1.3, v_trust + 0.1);
  end if;

  select current_streak into v_prev
  from goal_completions
  where user_goal_id = p_user_goal_id and completed_date = p_completed_date - 1;
  v_streak := coalesce(v_prev, 0) + 1;

  insert into goal_completions (
    user_goal_id, completed_date, current_streak, reflection_note,
    metric_value, trust_multiplier
  )
  values (
    p_user_goal_id, p_completed_date, v_streak, nullif(btrim(p_reflection_note), ''),
    p_metric_value, v_trust
  )
  on conflict (user_goal_id, completed_date) do update set
    reflection_note  = excluded.reflection_note,
    metric_value     = excluded.metric_value,
    trust_multiplier = excluded.trust_multiplier
  returning * into v_row;

  perform evaluate_badges(v_goal.user_id);
  perform compute_weekly_metrics(p_user_goal_id, week_start(p_completed_date));

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Conversion to and from a personal goal (S7, section 5.1)
-- -----------------------------------------------------------------------------

/**
 * Section 5.1 — "no verification" does not switch a field off, it moves the
 * goal into the personal economy. Verification is what buys entry to the
 * ranking, so a goal without it cannot stay ranked.
 *
 * Kept: the name, the metric, the level, the personal record, the history and
 * the streak. Lost: the ranking.
 */
create or replace function convert_goal_to_personal(p_user_goal_id uuid)
returns user_goals
language plpgsql
security definer
set search_path = public
as $$
declare v_row user_goals;
begin
  update user_goals
  set is_custom              = true,
      converted_from_goal_id = coalesce(converted_from_goal_id, library_id),
      library_id             = null,
      verification_code      = 'V0',
      counts_for_ranking     = false,
      converted_at           = now(),
      points                 = 0,
      updated_at             = now()
  where id = p_user_goal_id and user_id = auth.uid() and not is_custom
  returning * into v_row;

  if not found then
    raise exception 'goal not found, not owned by you, or already personal';
  end if;

  -- The week in progress stops counting from now, rather than retroactively:
  -- what was earned is never taken back (protection 4).
  update weekly_metrics
  set counted_for_ranking = false
  where user_goal_id = p_user_goal_id and week_start = week_start(current_date);

  return v_row;
end;
$$;

/**
 * Section 5.1 rule 2 — coming back, behind a 7-day cooldown so that a weak
 * week cannot be spent in personal mode and a strong one back in the ranking.
 * Rule 4: the personal record comes back with the user, not a clean slate.
 */
create or replace function convert_goal_to_structured(p_user_goal_id uuid)
returns user_goals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal user_goals;
  v_lib  goals_library;
  v_row  user_goals;
begin
  select * into v_goal from user_goals
  where id = p_user_goal_id and user_id = auth.uid() and is_custom;
  if not found then
    raise exception 'goal not found, not owned by you, or already structured';
  end if;
  if v_goal.converted_from_goal_id is null then
    raise exception 'this goal was never a structured goal';
  end if;
  if v_goal.converted_at is not null and v_goal.converted_at > now() - interval '7 days' then
    raise exception 'you can return this goal to the ranking 7 days after converting it';
  end if;

  select * into v_lib from goals_library where id = v_goal.converted_from_goal_id;
  if not found or not v_lib.active then
    raise exception 'the original library goal is no longer available';
  end if;

  update user_goals
  set is_custom              = false,
      library_id             = v_goal.converted_from_goal_id,
      converted_from_goal_id = null,
      verification_code      = v_lib.verification_default,
      verification           = v_lib.verification,
      counts_for_ranking     = true,
      converted_at           = null,
      updated_at             = now()
  where id = p_user_goal_id
  returning * into v_row;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reads for the progress and summary screens (S4, S6)
-- -----------------------------------------------------------------------------

/**
 * Section 3.5 — the growth table. Ranks the caller and their accepted friends
 * by improvement plus level-up bonuses, NOT by volume: this is the table in
 * which a beginner can beat a veteran, and it is the primary one on purpose.
 */
create or replace function growth_leaderboard(p_week_start date default null)
returns table (user_id uuid, display_name text, growth_points bigint, total_points bigint)
language sql
stable
security definer
set search_path = public
as $$
  with week as (select coalesce(p_week_start, week_start(current_date)) as w),
  people as (
    select auth.uid() as id
    union
    select case when f.user_id = auth.uid() then f.friend_id else f.user_id end
    from friendships f
    where f.status = 'accepted' and auth.uid() in (f.user_id, f.friend_id)
  )
  select p.id,
         pr.display_name,
         coalesce(sum(m.improvement_points + m.level_bonus_points), 0)::bigint,
         coalesce(sum(m.total_points), 0)::bigint
  from people p
  join profiles pr on pr.id = p.id
  left join user_goals ug on ug.user_id = p.id
  left join weekly_metrics m
    on m.user_goal_id = ug.id
   and m.week_start = (select w from week)
   and m.counted_for_ranking
  group by p.id, pr.display_name
  order by 3 desc, 4 desc;
$$;
