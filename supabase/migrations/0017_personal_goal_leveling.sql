-- =============================================================================
-- Let "hard for me / easy for me" work on a from-scratch personal goal —
-- and, found while testing that, fix the same button for EVERY existing
-- down-direction structured goal, which has never worked at all.
--
-- Two independent bugs in change_goal_level:
--
-- 1. It reads level_step / metric_direction / level_1_value through a left
--    join to goals_library. For a goal with no library_id and no
--    converted_from_goal_id (built in S5), that join finds nothing, so
--    `g.level_step` comes back null and the function's own guard —
--    "if v_goal.level_step is null ... raise 'this goal has no level to
--    change'" — fires on every attempt.
--
-- 2. The direction-reversal guard, `(p_direction = 'up') <> (v_to >
--    v_from)`, assumes an "up" (better) press always raises the raw
--    number. That is only true for an up-direction metric. For a
--    down-direction one (screen time, avoidance streaks — S-19, I-16, and
--    now any personal down-direction goal too), pressing "easy for me"
--    correctly LOWERS the number, which this guard then reads as the
--    clamp having reversed the move and refuses with "this goal is
--    already at its opening level" — verified against a throwaway
--    Postgres: a completely ordinary, nowhere-near-any-limit press on
--    S-19 fails this way every single time.
--
-- 3. Fixing (2) alone still isn't enough. level_changes carries the same
--    assumption as a table-level CHECK: `(direction = 'up') = (to_value >
--    from_value)`. That constraint has no way to know the metric's own
--    direction — the table doesn't store it — so it rejects the correct,
--    intended row for a down-direction goal exactly as often as the old
--    guard did. Between (2) and (3), a level change on any down-direction
--    goal — in either direction, "easy" or "hard" — has never been able
--    to complete: it fails the app-level guard, and if that guard were
--    simply removed it would fail the database CHECK instead. Fixed by
--    giving level_changes a metric_direction column (0017 backfills any
--    existing rows) and rewriting the constraint against it.
--
-- All three bugs are pre-existing and unrelated to personal goals — found
-- only because testing (1) required a down-direction fixture to exercise
-- change_goal_level at all, which is what surfaced (2) and then (3).
-- =============================================================================

-- Bug 3. The table has no way to validate direction-vs-values without
-- knowing the metric's own direction, so it now records it. Backfilled from
-- the same library-or-personal lookup the function itself uses; every
-- existing row is a level change that DID complete, meaning it was for an
-- up-direction goal (the only kind that could ever pass the old constraint),
-- so 'up' is the correct backfill default, not a guess standing in for
-- unknown data.
alter table level_changes
  add column metric_direction text check (metric_direction in ('up', 'down'));

update level_changes lc
set metric_direction = coalesce(g.metric_direction, ug.personal_metric_direction, 'up')
from user_goals ug
left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
where lc.user_goal_id = ug.id and lc.metric_direction is null;

alter table level_changes
  alter column metric_direction set not null;

alter table level_changes
  drop constraint level_change_direction_matches_values;

alter table level_changes
  add constraint level_change_direction_matches_values
    check ((direction = 'up') = ((to_value > from_value) = (metric_direction = 'up')));

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
  v_goal            record;
  v_step            numeric;
  v_direction       text;
  v_floor           numeric;
  v_from            numeric;
  v_to              numeric;
  v_wants_increase  boolean;
  v_is_record       boolean := false;
  v_row             user_goals;
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

  -- The library's value when there is one, else the goal's own — never both
  -- null for a genuinely levelled goal, whichever kind it is.
  v_step      := coalesce(v_goal.level_step, v_goal.personal_level_step);
  v_direction := coalesce(v_goal.metric_direction, v_goal.personal_metric_direction, 'up');

  if v_step is null or v_goal.current_level_value is null then
    raise exception 'this goal has no level to change';
  end if;

  -- Protection 6. A system-suggested drop after two misses (section 4.2) is
  -- still a level change and still waits its turn.
  if v_goal.level_changed_at is not null
     and v_goal.level_changed_at > now() - interval '72 hours' then
    raise exception 'you can change this level again 72 hours after the last change';
  end if;

  v_from := v_goal.current_level_value;

  -- "Up" means a better level, which for a `down` goal is a smaller number —
  -- so whether this press raises or lowers the raw value depends on both
  -- p_direction AND the metric's own direction. v_wants_increase is that
  -- combined answer, used again below in the reversal guard: the earlier
  -- version of that guard checked `p_direction = 'up'` on its own, which is
  -- only ever correct for an up-direction metric. See the migration header —
  -- that mismatch made every "easy for me" press on a down-direction goal
  -- fail, always, everywhere it was pointed at a goal that wasn't already
  -- sitting at a clamp.
  v_wants_increase := (p_direction = 'up') = (v_direction = 'up');
  if v_wants_increase then
    v_to := v_from + v_step;
  else
    v_to := v_from - v_step;
  end if;

  if v_direction = 'up' then
    -- Section 4.1: a drop never goes below the library's opening level. A
    -- from-scratch personal goal has no such value on record, so one level
    -- step stands in for it — enough that repeatedly pressing "harder"
    -- can't walk an up-direction goal down to a meaningless zero.
    v_floor := coalesce(v_goal.level_1_value, v_step);
    v_to := greatest(v_to, v_floor);
    v_is_record := v_to > v_goal.personal_record_value;
  else
    -- For a library-backed down goal, level_1_value is the beginner's
    -- (worst, highest) value and acts as a CEILING — the level can improve
    -- downward but never rise back above where it started. A from-scratch
    -- personal down goal has no such reference, so the guard that actually
    -- applies is different in kind, not just in value: a floor, since there
    -- is no ceiling to speak of and "-2 hours of screen time" is not a
    -- value, just an unclamped subtraction. One level step, not zero —
    -- user_goals.current_level_value has a > 0 check, so zero is not a
    -- level a from-scratch goal is allowed to land on either.
    if v_goal.level_1_value is not null then
      v_to := least(v_to, v_goal.level_1_value);
    else
      v_to := greatest(v_to, v_step);
    end if;
    v_is_record := v_to < v_goal.personal_record_value;
  end if;

  -- The clamp above can not only stop the move but reverse it, if the level
  -- somehow already sits past it. Checked against v_wants_increase — the
  -- direction the raw value was actually supposed to move in — not against
  -- p_direction alone, which is the fix described in the migration header.
  if v_to = v_from or v_wants_increase <> (v_to > v_from) then
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
    was_personal_record, was_system_suggested, metric_direction
  )
  values (p_user_goal_id, p_direction, v_from, v_to, v_is_record, p_system_suggested, v_direction);

  perform compute_weekly_metrics(p_user_goal_id, week_start(current_date));

  return v_row;
end;
$$;
