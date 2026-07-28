-- =============================================================================
-- Badges (PRD 6.6) — catalogue and awarding logic.
--
-- The eight criteria below were supplied by the product owner and close the
-- open question PRD section 13 left. Awarding runs entirely server-side:
-- `user_badges` has no client insert policy, so the only path to a badge is
-- through evaluate_badges() running as the definer.
--
-- Badges are permanent. Undoing a completion does not revoke one — an
-- achievement that blinks out because a mis-tap was corrected would be worse
-- than one that is slightly generous.
-- =============================================================================

-- A deadline or long-term goal needs an explicit "finished" marker: its
-- goal_completions rows record progress on a given day and cannot distinguish
-- "worked on it" from "reached the end".
alter table user_goals add column completed_at timestamptz;

alter table badges add column icon text not null default 'summit';
alter table badges add column accent goal_category;

-- Sunday-start week, matching the Israeli calendar the app is written for.
-- date_trunc('week') is ISO (Monday), so it cannot be used here.
create or replace function week_start(d date)
returns date
language sql
immutable
as $$
  select d - extract(dow from d)::int;
$$;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------

insert into badges (slug, title_he, title_en, description_he, description_en, icon, accent, sort_order)
values
  ('first-step',
   'הצעד הראשון בדרך', 'The first step',
   'השלמת המטרה הראשונה שלך.',
   'You completed your very first goal.',
   -- Every disc in the handoff carries a category tint; a neutral one reads as
   -- disabled next to them, so the opening badge borrows the physical accent.
   'summit', 'physical', 10),

  ('week-on-summit',
   'שבוע על הפסגה', 'A week on the summit',
   'רצף של 7 ימים רצופים במטרה אחת.',
   'A 7-day streak on a single goal.',
   'check', 'physical', 20),

  ('unstoppable',
   'בלתי עצור', 'Unstoppable',
   'רצף של 30 ימים רצופים במטרה אחת.',
   'A 30-day streak on a single goal.',
   'flame', 'personal', 30),

  ('balanced-climber',
   'מטפס מאוזן', 'Balanced climber',
   'מטרה אחת לפחות בכל אחת מארבע הקטגוריות, באותו שבוע.',
   'At least one goal in each of the four categories, in the same week.',
   'target', 'academic', 40),

  ('mileage-50',
   'קילומטראז׳ 50', '50 kilometres in',
   '50 סימוני ״בוצע״ מצטברים בכל המטרות יחד.',
   '50 completions across all your goals.',
   'activity', 'physical', 50),

  ('progress-machine',
   'מכונת התקדמות', 'Progress machine',
   '200 סימוני ״בוצע״ מצטברים בכל המטרות יחד.',
   '200 completions across all your goals.',
   'activity', 'academic', 60),

  ('reached-the-summit',
   'הגעתי לפסגה', 'I reached the summit',
   'השלמת מטרה ארוכת טווח מתחילתה ועד סופה.',
   'You saw a long-term goal all the way through.',
   'summit', 'personal', 70),

  ('not-alone',
   'לא לבד בטיפוס', 'Not climbing alone',
   'שיתפת מטרה אישית עם חבר בפעם הראשונה.',
   'You shared a personal goal with a friend for the first time.',
   'friends', 'social', 80)

on conflict (slug) do update set
  title_he       = excluded.title_he,
  title_en       = excluded.title_en,
  description_he = excluded.description_he,
  description_en = excluded.description_en,
  icon           = excluded.icon,
  accent         = excluded.accent,
  sort_order     = excluded.sort_order;

-- -----------------------------------------------------------------------------
-- evaluate_badges
--
-- Re-checks every criterion for one user and inserts whatever is newly earned.
-- Written as a single idempotent pass rather than per-badge triggers: it is
-- cheap at this data size, and it means a criterion added later is picked up
-- for existing users on their next completion instead of needing a backfill.
-- -----------------------------------------------------------------------------
create or replace function evaluate_badges(p_user_id uuid)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_completions int;
  v_best_streak int;
  v_earned text[];
begin
  select count(*), coalesce(max(c.current_streak), 0)
    into v_total_completions, v_best_streak
  from goal_completions c
  join user_goals g on g.id = c.user_goal_id
  where g.user_id = p_user_id;

  select array_agg(slug) into v_earned from (
    select 'first-step' as slug where v_total_completions >= 1
    union all
    select 'week-on-summit' where v_best_streak >= 7
    union all
    select 'unstoppable' where v_best_streak >= 30
    union all
    select 'mileage-50' where v_total_completions >= 50
    union all
    select 'progress-machine' where v_total_completions >= 200
    union all
    -- All four categories touched inside one Sunday-start week.
    select 'balanced-climber' where exists (
      select 1
      from goal_completions c
      join user_goals g on g.id = c.user_goal_id
      where g.user_id = p_user_id
      group by week_start(c.completed_date)
      having count(distinct g.category) = 4
    )
    union all
    select 'reached-the-summit' where exists (
      select 1 from user_goals g
      where g.user_id = p_user_id
        and g.goal_type = 'long_term'
        and g.completed_at is not null
    )
    union all
    select 'not-alone' where exists (
      select 1
      from goal_shares s
      join user_goals g on g.id = s.user_goal_id
      where g.user_id = p_user_id and g.is_custom
    )
  ) earned;

  if v_earned is null then
    return;
  end if;

  return query
  insert into user_badges (user_id, badge_id)
  select p_user_id, b.id
  from badges b
  where b.slug = any(v_earned)
  on conflict (user_id, badge_id) do nothing
  returning (select slug from badges where id = badge_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Wire evaluation into the events that can earn a badge
-- -----------------------------------------------------------------------------

-- Recording a completion can satisfy five of the eight criteria.
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
  v_user_id uuid;
  v_previous_streak int;
  v_streak int;
  v_row goal_completions;
begin
  select verification, user_id into v_verification, v_user_id
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

  perform evaluate_badges(v_user_id);

  return v_row;
end;
$$;

/**
 * Marks a deadline or long-term goal finished. Daily goals are excluded on
 * purpose: they have no end, only streaks.
 */
create or replace function finish_goal(p_user_goal_id uuid)
returns user_goals
language plpgsql
security invoker
set search_path = public
as $$
declare v_row user_goals;
begin
  update user_goals
  set completed_at = coalesce(completed_at, now())
  where id = p_user_goal_id
    and goal_type in ('deadline', 'long_term')
  returning * into v_row;

  if not found then
    raise exception 'goal not found, not owned by you, or not an ending goal';
  end if;

  perform evaluate_badges(v_row.user_id);

  return v_row;
end;
$$;

-- Sharing is the one criterion no completion can trigger.
create or replace function on_goal_shared()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_owner uuid;
begin
  select user_id into v_owner from user_goals where id = new.user_goal_id;
  if v_owner is not null then
    perform evaluate_badges(v_owner);
  end if;
  return new;
end;
$$;

create trigger goal_shares_award_badges
  after insert on goal_shares
  for each row execute function on_goal_shared();
