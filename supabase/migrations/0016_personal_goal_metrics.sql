-- =============================================================================
-- Give a from-scratch personal goal (S5 / GoalBuilder) somewhere to keep the
-- metric it was built with.
--
-- GoalBuilder already asks for a metric unit and a level step (section 8:
-- "what happens on hard for me") and sends verification_code,
-- current_level_value and personal_record_value on creation — but
-- user_goals had no columns for the unit or the step themselves, only
-- goals_library does. The result: a goal built this way (no library_id, no
-- converted_from_goal_id) reached S1/VS with `goal.library` permanently
-- null, and both screens require it to render — an infinite spinner, never
-- an error, because nothing ever throws. This is what "created a personal
-- goal, opened it, it just loads forever" was.
--
-- Named with a `personal_` prefix rather than reusing goals_library's own
-- names (metric_unit, level_step, base_points, metric_direction) on purpose:
-- three existing functions in 0012 do `select ug.*, g.level_step, ...` (and
-- the same for base_points, metric_direction) to read the library's value
-- through a left join. Verified empirically against a throwaway Postgres
-- that when a SELECT's output list names the same column twice, a `record`
-- variable resolves it to the FIRST occurrence — so reusing those names on
-- user_goals would have made `ug.*`'s copy (null, for every already-existing
-- structured goal) shadow the library's real value everywhere those
-- functions run, silently breaking change_goal_level and
-- record_structured_completion for every goal that already worked.
-- =============================================================================

alter table user_goals
  add column personal_metric_unit      text,
  add column personal_metric_direction text
    check (personal_metric_direction is null or personal_metric_direction in ('up', 'down')),
  add column personal_level_step       numeric check (personal_level_step is null or personal_level_step > 0),
  -- Personal goals earn bonus points, not ranked ones (section 1) — this is
  -- what that bonus is computed from. Zero, not null: a library-backed goal
  -- reads goals_library.base_points instead and never touches this column.
  add column personal_base_points      int not null default 0 check (personal_base_points >= 0);

comment on column user_goals.personal_metric_unit is
  'Only meaningful when library_id and converted_from_goal_id are both null — '
  'a from-scratch personal goal (S5). A library-backed goal reads the unit '
  'from goals_library instead.';
