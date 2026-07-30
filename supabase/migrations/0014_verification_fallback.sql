-- =============================================================================
-- Completing a goal with one of its OTHER allowed verification methods.
--
-- Six of the 80 goals default to V2 (sensor sync), and this app has no sensor
-- integration yet. Section 2 already anticipates that: every goal carries a
-- `verification_allowed` list, and P-08's is {V2, V1, V6}. Without a way to
-- use the alternatives, those six goals cannot be completed at all.
--
-- The reason this needs a migration rather than a screen is the trust
-- multiplier. V2 is the only ×1.2 method in section 5, precisely because a
-- sensor reading is the one number a user cannot type. If the client picked
-- the fallback while the server kept resolving trust from the goal's stored
-- verification_code, a timer would quietly earn the sensor's multiplier —
-- which is the single easiest way to inflate the leaderboard.
--
-- So the method used is now an argument, it is validated against the goal's
-- own allowed list, and the multiplier is derived from what was actually used.
-- =============================================================================

-- Adding a defaulted parameter creates an OVERLOAD, not a replacement, and
-- Postgres then refuses every call that omits it as ambiguous. The old
-- signature has to go first.
drop function if exists record_structured_completion(uuid, numeric, text, date, boolean);

create or replace function record_structured_completion(
  p_user_goal_id uuid,
  p_metric_value numeric,
  p_reflection_note text default null,
  p_completed_date date default current_date,
  p_composite boolean default false,
  -- Null keeps the previous behaviour: the goal's own method.
  p_verification verification_code default null
)
returns goal_completions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_goal   record;
  v_used   verification_code;
  v_trust  numeric;
  v_streak int;
  v_prev   int;
  v_row    goal_completions;
begin
  select ug.*, g.metric_direction, g.verification_allowed
    into v_goal
  from user_goals ug
  left join goals_library g on g.id = coalesce(ug.library_id, ug.converted_from_goal_id)
  where ug.id = p_user_goal_id and ug.user_id = auth.uid() and ug.active;

  if not found then
    raise exception 'goal not found or inactive';
  end if;

  v_used := coalesce(p_verification, v_goal.verification_code);

  -- A fallback is only a fallback if the goal's own library row offers it.
  -- A personal goal has no library row and therefore no alternatives: its
  -- method is whatever it was built with.
  if p_verification is not null and p_verification is distinct from v_goal.verification_code then
    --
    -- V0 needs no separate guard here: 0010's library_allowed_excludes_v0
    -- keeps it out of every verification_allowed list, so this same check
    -- refuses it. Section 5.1 is the reason — a ranked goal reaches V0 through
    -- the S7 conversion, never through a per-completion choice.
    if v_goal.verification_allowed is null
       or not (p_verification = any (v_goal.verification_allowed)) then
      raise exception 'this goal does not allow %', p_verification;
    end if;
  end if;

  -- Protection 7. Keyed on the method actually used: a check-in filled in on
  -- Tuesday for Monday is worthless whichever goal it belongs to.
  if v_used in ('V4', 'V7') and p_completed_date <> current_date then
    raise exception 'this goal cannot be filled in retroactively';
  end if;

  -- Section 5: V5 stays light on purpose — 40 characters, not 200. The moment
  -- logging feels like homework is the moment people stop logging.
  if v_used = 'V5' and length(coalesce(btrim(p_reflection_note), '')) < 40 then
    raise exception 'tell us what happened — at least 40 characters';
  end if;

  v_trust := verification_trust_multiplier(v_used);
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

comment on function record_structured_completion is
  'Records one completion of a structured goal. p_verification lets the user '
  'fall back to another method from the goal''s verification_allowed list; the '
  'trust multiplier follows the method actually used, never the goal''s default.';
