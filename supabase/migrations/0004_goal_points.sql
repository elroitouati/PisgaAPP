-- =============================================================================
-- Points per goal (PRD 6.7 / design 5a, 5b).
--
-- The scoring rule is "a separate value per goal", so the value lives on the
-- library row rather than being derived from the verification method.
--
-- PRD 3.1 is enforced here rather than trusted to the client: user_goals.points
-- is copied from the library at adoption and forced to 0 for a custom goal, so
-- a personal goal can never contribute to ranking no matter what the client
-- sends. Copying rather than joining also means re-pricing a library goal later
-- does not silently rewrite everyone's past totals.
-- =============================================================================

alter table goals_library add column points int not null default 20
  constraint library_points_non_negative check (points >= 0);

alter table user_goals add column points int not null default 0
  constraint goal_points_non_negative check (points >= 0);

-- A custom goal is worth nothing toward the shared score, by definition.
alter table user_goals add constraint custom_goals_score_zero
  check (not is_custom or points = 0);

-- -----------------------------------------------------------------------------
-- Values, anchored to the design: a strength session shows "+40 נק'", so 40 is
-- a solid 30-minute effort and everything else is scaled against it. Adjust
-- freely — this table is the single source of truth for what a goal is worth.
-- -----------------------------------------------------------------------------
update goals_library set points = v.points
from (values
  -- גופני
  ('pushups-60',          35),
  ('steps-10k',           30),
  ('strength-30min',      40),
  ('morning-stretch',     15),
  ('water-8-cups',        10),
  ('run-10k',            100),   -- long-term: one award, at the summit
  -- לימודי
  ('reading-20min',       25),
  ('language-15min',      20),
  ('finish-a-book',       60),   -- deadline goal, awarded once
  ('online-lecture',      25),
  ('instrument-20min',    25),
  -- חברתי
  ('call-parents',        15),
  ('reconnect-friend',    20),
  ('help-someone',        25),
  ('organise-meetup',     50),   -- deadline goal, awarded once
  ('gratitude-message',   10),
  -- אישי
  ('meditation-10min',    20),
  ('journaling',          15),
  ('no-smoking',          30),
  ('no-social-after-22',  25),
  ('fixed-wake-time',     20)
) as v(slug, points)
where goals_library.slug = v.slug;

-- Existing adopted goals inherit their library value.
update user_goals g
set points = l.points
from goals_library l
where g.library_id = l.id and not g.is_custom;

-- -----------------------------------------------------------------------------
-- Adoption copies the price across. A trigger rather than client code: the
-- client must not be able to name its own score.
-- -----------------------------------------------------------------------------
create or replace function set_goal_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_custom then
    new.points := 0;
  else
    select points into new.points from goals_library where id = new.library_id;
    new.points := coalesce(new.points, 0);
  end if;
  return new;
end;
$$;

create trigger user_goals_set_points
  before insert on user_goals
  for each row execute function set_goal_points();

-- -----------------------------------------------------------------------------
-- Lifetime score. Daily goals score on every completion; a deadline or
-- long-term goal is a single achievement, so it scores once when it is
-- finished rather than on each day of progress toward it.
-- -----------------------------------------------------------------------------
create or replace function total_points(p_user_id uuid)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(
    case
      when g.goal_type = 'daily' then g.points * (
        select count(*) from goal_completions c where c.user_goal_id = g.id
      )
      when g.completed_at is not null then g.points
      else 0
    end
  ), 0)::int
  from user_goals g
  where g.user_id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- Points earned this calendar month, optionally within one category — the
-- figure the category screen labels "נק' החודש". Only daily completions count
-- toward a month; an ending goal counts in the month it was finished.
-- -----------------------------------------------------------------------------
create or replace function points_this_month(p_user_id uuid, p_category goal_category default null)
returns int
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(
    case
      when g.goal_type = 'daily' then g.points * (
        select count(*)
        from goal_completions c
        where c.user_goal_id = g.id
          and c.completed_date >= date_trunc('month', current_date)::date
          and c.completed_date <  (date_trunc('month', current_date) + interval '1 month')::date
      )
      when g.completed_at >= date_trunc('month', current_date) then g.points
      else 0
    end
  ), 0)::int
  from user_goals g
  where g.user_id = p_user_id
    and (p_category is null or g.category = p_category);
$$;
