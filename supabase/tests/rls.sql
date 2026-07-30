-- =============================================================================
-- RLS and business-rule tests. Run via scripts/verify-sql.sh.
-- Every check raises an exception on failure, so ON_ERROR_STOP turns any
-- regression into a non-zero exit.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function assert(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', label;
  end if;
  raise notice 'ok: %', label;
end;
$$;

-- Runs `sql` as the given user and asserts it is rejected by RLS or a
-- constraint. Without this, a silently-permissive policy would look like a pass.
create or replace function assert_denied(actor uuid, sql text, label text)
returns void language plpgsql as $$
begin
  begin
    execute format('set local role authenticated');
    execute format('set local request.jwt.claim.sub = %L', actor);
    execute sql;
  exception when others then
    reset role;
    raise notice 'ok: % (rejected: %)', label, sqlerrm;
    return;
  end;
  reset role;
  raise exception 'FAILED: % — the statement was allowed', label;
end;
$$;

-- An UPDATE or DELETE blocked by a USING clause is not an error — RLS simply
-- filters the row out, so the statement succeeds and touches nothing. Asserting
-- "it raised" would therefore fail on a perfectly secure policy; the property
-- that actually matters is that no row changed.
create or replace function assert_no_rows_affected(actor uuid, sql text, label text)
returns void language plpgsql as $$
declare n int;
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', actor);
  execute sql;
  get diagnostics n = row_count;
  reset role;
  if n <> 0 then
    raise exception 'FAILED: % — % row(s) changed', label, n;
  end if;
  raise notice 'ok: % (0 rows affected)', label;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fixtures: alice and bob are friends, mallory is a stranger.
-- -----------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com',   '{"full_name": "Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com',     '{"full_name": "Bob"}'),
  ('33333333-3333-3333-3333-333333333333', 'mallory@example.com', '{"full_name": "Mallory"}');

-- handle_new_user should have produced a profile for each.
select assert(
  (select count(*) from profiles) = 3,
  'the auth.users trigger creates one profile per user'
);
select assert(
  (select display_name from profiles where email = 'alice@example.com') = 'Alice',
  'the profile trigger picks up the display name from provider metadata'
);

insert into friendships (user_id, friend_id, status)
values ('11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222', 'accepted');

-- goals_library holds real product content, not test fixtures — as of 0009
-- it starts empty, pending the real structured-goal library. These two rows
-- are this test file's own, so it stays correct regardless of what (if
-- anything) product content seeds later.
insert into goals_library (slug, title_he, title_en, category, goal_type, verification, points, sort_order)
values
  ('pushups-60', 'שכיבות סמיכה', 'Push-ups', 'physical', 'daily', 'guided_session', 10, 1),
  ('water-8-cups', 'שתיית מים', 'Drink water', 'physical', 'daily', 'checkbox_reflection', 5, 2);

-- Alice adopts a library goal and also writes a custom one.
insert into user_goals (id, user_id, library_id, is_custom, title, category, goal_type, verification)
select 'aaaa0001-0000-0000-0000-000000000001',
       '11111111-1111-1111-1111-111111111111',
       id, false, title_he, category, goal_type, verification
from goals_library where slug = 'pushups-60';

insert into user_goals (id, user_id, is_custom, title, category, goal_type, verification)
values
  ('aaaa0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   true, 'לתרגל גיטרה', 'personal', 'daily', 'checkbox_reflection'),
  ('aaaa0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   true, 'להתקשר לסבתא', 'social', 'daily', 'checkbox_reflection');

select assert(
  (select count(*) from user_goals
   where user_id = '11111111-1111-1111-1111-111111111111' and is_custom) = 2,
  'a user can hold many custom goals (the adoption index is library-scoped)'
);

-- -----------------------------------------------------------------------------
-- Constraints
-- -----------------------------------------------------------------------------

do $$
begin
  begin
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type, verification)
    select '11111111-1111-1111-1111-111111111111', id, false, title_he, category, goal_type, verification
    from goals_library where slug = 'pushups-60';
    raise exception 'FAILED: the same library goal was adopted twice';
  exception when unique_violation then
    raise notice 'ok: a library goal cannot be adopted twice by the same user';
  end;
end $$;

do $$
begin
  begin
    insert into user_goals (user_id, is_custom, title, category, goal_type, verification)
    values ('11111111-1111-1111-1111-111111111111', true, 'bad', 'personal', 'daily', 'checkbox_reflection');
    -- reached only if the target_date check is wrong
  exception when check_violation then
    raise exception 'FAILED: a daily goal without a target date was rejected';
  end;
  raise notice 'ok: a daily goal may omit target_date';

  begin
    insert into user_goals (user_id, is_custom, title, category, goal_type, verification, target_date)
    values ('11111111-1111-1111-1111-111111111111', true, 'bad2', 'personal', 'daily', 'checkbox_reflection', current_date);
    raise exception 'FAILED: a daily goal was allowed to carry a target date';
  exception when check_violation then
    raise notice 'ok: a daily goal cannot carry a target date';
  end;

  begin
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type, verification)
    values ('11111111-1111-1111-1111-111111111111', null, false, 'bad3', 'personal', 'daily', 'checkbox_reflection');
    raise exception 'FAILED: a non-custom goal was allowed without a library row';
  exception when check_violation then
    raise notice 'ok: a non-custom goal must reference the library';
  end;
end $$;

-- The 'bad' probe above is a legitimate row that stayed behind (only the two
-- rejected inserts rolled back). Drop it so the later visibility counts still
-- describe the three fixture goals.
delete from user_goals where title = 'bad';

-- -----------------------------------------------------------------------------
-- record_goal_completion: streaks and the mandatory reflection note
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

select record_goal_completion('aaaa0001-0000-0000-0000-000000000001', null, current_date - 2);
select record_goal_completion('aaaa0001-0000-0000-0000-000000000001', null, current_date - 1);
select record_goal_completion('aaaa0001-0000-0000-0000-000000000001', null, current_date);

reset role; reset request.jwt.claim.sub;

select assert(
  (select current_streak from goal_completions
   where user_goal_id = 'aaaa0001-0000-0000-0000-000000000001'
     and completed_date = current_date) = 3,
  'three consecutive days build a streak of 3'
);

-- A gap resets the streak rather than continuing it.
set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select record_goal_completion('aaaa0001-0000-0000-0000-000000000001', null, current_date + 2);
reset role; reset request.jwt.claim.sub;

select assert(
  (select current_streak from goal_completions
   where user_goal_id = 'aaaa0001-0000-0000-0000-000000000001'
     and completed_date = current_date + 2) = 1,
  'a missed day resets the streak to 1'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select record_goal_completion('aaaa0002-0000-0000-0000-000000000002', null)$$,
  'a checkbox_reflection goal rejects an empty reflection note'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select record_goal_completion('aaaa0002-0000-0000-0000-000000000002', '   ')$$,
  'a whitespace-only reflection note is rejected too'
);

set role authenticated;
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select record_goal_completion('aaaa0002-0000-0000-0000-000000000002', 'תרגלתי 20 דקות');
reset role; reset request.jwt.claim.sub;

select assert(
  (select reflection_note from goal_completions
   where user_goal_id = 'aaaa0002-0000-0000-0000-000000000002') = 'תרגלתי 20 דקות',
  'a completion with a reflection note is stored'
);

-- -----------------------------------------------------------------------------
-- Read visibility
-- -----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
create temp table bob_sees as
  select count(*) as goals from user_goals where user_id = '11111111-1111-1111-1111-111111111111';
reset role; reset request.jwt.claim.sub;

select assert((select goals from bob_sees) = 3, 'an accepted friend can read all of a user''s goals');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
create temp table mallory_sees as
  select
    (select count(*) from user_goals where user_id = '11111111-1111-1111-1111-111111111111') as goals,
    (select count(*) from goal_completions) as completions,
    (select count(*) from profiles where id = '11111111-1111-1111-1111-111111111111') as profiles,
    (select count(*) from goals_library) as library;
reset role; reset request.jwt.claim.sub;

select assert((select goals from mallory_sees) = 0, 'a stranger cannot read another user''s goals');
select assert((select completions from mallory_sees) = 0, 'a stranger cannot read another user''s completions');
select assert((select profiles from mallory_sees) = 0, 'a stranger cannot read another user''s profile');
select assert((select library from mallory_sees) > 0, 'the goal library is readable by any signed-in user');

-- -----------------------------------------------------------------------------
-- Write isolation
-- -----------------------------------------------------------------------------

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$insert into goal_completions (user_goal_id) values ('aaaa0001-0000-0000-0000-000000000001')$$,
  'a stranger cannot log a completion on another user''s goal'
);

select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$insert into goal_completions (user_goal_id) values ('aaaa0001-0000-0000-0000-000000000001')$$,
  'even a friend cannot log a completion on another user''s goal'
);

select assert_no_rows_affected(
  '22222222-2222-2222-2222-222222222222',
  $$update user_goals set title = 'hijacked' where id = 'aaaa0001-0000-0000-0000-000000000001'$$,
  'a friend cannot edit another user''s goal'
);

select assert_no_rows_affected(
  '22222222-2222-2222-2222-222222222222',
  $$delete from user_goals where id = 'aaaa0001-0000-0000-0000-000000000001'$$,
  'a friend cannot delete another user''s goal'
);

select assert(
  (select title from user_goals where id = 'aaaa0001-0000-0000-0000-000000000001')
    is distinct from 'hijacked',
  'the goal survived the hijack attempts unchanged'
);

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$insert into user_goals (user_id, is_custom, title, category, goal_type, verification)
    values ('11111111-1111-1111-1111-111111111111', true, 'planted', 'personal', 'daily', 'daily_checkin')$$,
  'a user cannot create a goal owned by someone else'
);

select assert_no_rows_affected(
  '33333333-3333-3333-3333-333333333333',
  $$update profiles set display_name = 'hijacked' where id = '11111111-1111-1111-1111-111111111111'$$,
  'a user cannot edit another user''s profile'
);

select assert(
  (select display_name from profiles where id = '11111111-1111-1111-1111-111111111111') = 'Alice',
  'the profile survived the hijack attempt unchanged'
);

-- PRD 6.6: badges are awarded server-side, never granted by the client.
select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$insert into user_badges (user_id, badge_id) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid())$$,
  'a user cannot award themselves a badge'
);

-- A pending friend request grants nothing until it is accepted.
insert into friendships (user_id, friend_id, status)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111', 'pending');

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
create temp table mallory_pending as
  select count(*) as goals from user_goals where user_id = '11111111-1111-1111-1111-111111111111';
reset role; reset request.jwt.claim.sub;

select assert((select goals from mallory_pending) = 0,
  'a pending friend request does not grant read access');

-- -----------------------------------------------------------------------------
-- Badges (0003) — every criterion, plus the rule that only the server awards.
-- -----------------------------------------------------------------------------

-- Alice already has completions from the streak tests above.
select assert(
  exists (
    select 1 from user_badges ub
    join badges b on b.id = ub.badge_id
    where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'first-step'
  ),
  'the first completion awards "the first step"'
);

select assert(
  not exists (
    select 1 from user_badges ub
    join badges b on b.id = ub.badge_id
    where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'week-on-summit'
  ),
  'a 3-day streak does not yet award the 7-day badge'
);

-- Push one goal past 30 consecutive days, which also carries the account past
-- the 50-completion mark (46 here plus the 5 recorded earlier).
do $$
declare d date;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  for d in select generate_series(current_date - 45, current_date, interval '1 day')::date loop
    -- This fixture goal is checkbox_reflection, so every day needs a note.
    perform record_goal_completion('aaaa0003-0000-0000-0000-000000000003', 'דיברנו', d);
  end loop;
  reset role;
end $$;

select assert(
  (select max(current_streak) from goal_completions
   where user_goal_id = 'aaaa0003-0000-0000-0000-000000000003') = 46,
  '46 consecutive days build a streak of 46'
);

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'week-on-summit'),
  'a 7-day streak awards "a week on the summit"'
);

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'unstoppable'),
  'a 30-day streak awards "unstoppable"'
);

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'mileage-50'),
  '50 cumulative completions award the mileage badge'
);

select assert(
  not exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
              where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'progress-machine'),
  'under 200 completions does not award "progress machine"'
);

-- balanced-climber: alice has physical + personal + social goals completed, but
-- academic is missing, so the badge must stay locked.
select assert(
  not exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
              where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'balanced-climber'),
  'three categories in a week is not enough for "balanced climber"'
);

insert into user_goals (id, user_id, is_custom, title, category, goal_type, verification)
values ('aaaa0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        true, 'ללמוד משהו', 'academic', 'daily', 'daily_checkin');

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  -- Same week as the physical/social/personal completions recorded above.
  perform record_goal_completion('aaaa0004-0000-0000-0000-000000000004', null, current_date);
  reset role;
end $$;

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'balanced-climber'),
  'all four categories in one week awards "balanced climber"'
);

-- reached-the-summit: only a finished long-term goal counts.
insert into user_goals (id, user_id, is_custom, title, category, goal_type, verification, target_date)
values ('aaaa0005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
        true, 'לרוץ 10 ק"מ', 'physical', 'long_term', 'checkbox_reflection', current_date + 90);

select assert(
  not exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
              where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'reached-the-summit'),
  'merely having a long-term goal does not award the summit badge'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform finish_goal('aaaa0005-0000-0000-0000-000000000005');
  reset role;
end $$;

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'reached-the-summit'),
  'finishing a long-term goal awards "I reached the summit"'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select finish_goal('aaaa0001-0000-0000-0000-000000000001')$$,
  'a daily goal cannot be "finished" — it only has streaks'
);

-- not-alone: sharing a personal goal with a friend.
select assert(
  not exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
              where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'not-alone'),
  'the sharing badge is locked before any goal is shared'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into goal_shares (user_goal_id, shared_with_user_id)
  values ('aaaa0002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222');
  reset role;
end $$;

select assert(
  exists (select 1 from user_badges ub join badges b on b.id = ub.badge_id
          where ub.user_id = '11111111-1111-1111-1111-111111111111' and b.slug = 'not-alone'),
  'sharing a personal goal awards "not climbing alone"'
);

-- Badges are per-user: none of alice's activity leaks to bob.
select assert(
  (select count(*) from user_badges where user_id = '22222222-2222-2222-2222-222222222222') = 0,
  'a friend earns nothing from your activity'
);

-- Awarding is idempotent — a second pass must not duplicate anything.
do $$
declare before_count int; after_count int;
begin
  select count(*) into before_count from user_badges
  where user_id = '11111111-1111-1111-1111-111111111111';
  perform evaluate_badges('11111111-1111-1111-1111-111111111111');
  select count(*) into after_count from user_badges
  where user_id = '11111111-1111-1111-1111-111111111111';
  if before_count <> after_count then
    raise exception 'FAILED: re-evaluating badges duplicated rows (% → %)', before_count, after_count;
  end if;
  raise notice 'ok: re-evaluating badges awards nothing twice';
end $$;

-- -----------------------------------------------------------------------------
-- Points (0004)
-- -----------------------------------------------------------------------------

select assert(
  (select points from user_goals where id = 'aaaa0001-0000-0000-0000-000000000001')
    = (select points from goals_library where slug = 'pushups-60'),
  'adopting a library goal copies its points across'
);

select assert(
  (select count(*) from user_goals where is_custom and points <> 0) = 0,
  'a custom goal is always worth zero (PRD 3.1)'
);

-- The trigger overwrites whatever the client sent, so a forged score cannot land.
insert into user_goals (id, user_id, library_id, is_custom, title, category, goal_type, verification, points)
select 'aaaa0006-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222',
       id, false, title_he, category, goal_type, verification, 9999
from goals_library where slug = 'water-8-cups';

select assert(
  (select points from user_goals where id = 'aaaa0006-0000-0000-0000-000000000006')
    = (select points from goals_library where slug = 'water-8-cups'),
  'a client-supplied points value is overwritten by the library price'
);

do $$
begin
  begin
    insert into user_goals (user_id, is_custom, title, category, goal_type, verification, points)
    values ('22222222-2222-2222-2222-222222222222', true, 'forged', 'personal', 'daily', 'daily_checkin', 500);
    -- The trigger zeroes it before the constraint sees it, so this must land at 0.
  exception when check_violation then
    raise exception 'FAILED: a custom goal with points was rejected instead of zeroed';
  end;
  if (select points from user_goals where title = 'forged') <> 0 then
    raise exception 'FAILED: a custom goal kept a non-zero score';
  end if;
  raise notice 'ok: a custom goal submitted with points is forced to zero';
end $$;

-- Bob completes his one daily goal twice: score = 2 x the goal's value.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform record_goal_completion('aaaa0006-0000-0000-0000-000000000006', 'שתיתי', current_date - 1);
  perform record_goal_completion('aaaa0006-0000-0000-0000-000000000006', 'שתיתי', current_date);
  reset role;
end $$;

select assert(
  total_points('22222222-2222-2222-2222-222222222222')
    = 2 * (select points from goals_library where slug = 'water-8-cups'),
  'a daily goal scores once per completion'
);

select assert(
  points_this_month('22222222-2222-2222-2222-222222222222', 'academic') = 0,
  'scoping points to a category the user has nothing in returns zero'
);

-- An unfinished long-term goal scores nothing; finishing it scores once.
select assert(
  (select points from user_goals where id = 'aaaa0005-0000-0000-0000-000000000005') = 0,
  'a custom long-term goal is still worth zero'
);

-- -----------------------------------------------------------------------------
-- Chat (0005)
-- -----------------------------------------------------------------------------

-- Alice opens a thread with bob (a friend); mallory is not a friend.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform open_direct_conversation('22222222-2222-2222-2222-222222222222');
  reset role;
end $$;

select assert(
  (select count(*) from conversations where kind = 'direct') = 1,
  'opening a direct conversation creates one thread'
);
select assert(
  (select count(*) from conversation_members) = 2,
  'both participants are added to a direct thread'
);

-- Find-or-create: a second call must reuse the thread, not open another.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform open_direct_conversation('11111111-1111-1111-1111-111111111111');
  reset role;
end $$;

select assert(
  (select count(*) from conversations where kind = 'direct') = 1,
  'the same pair never gets a second thread, from either side'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select open_direct_conversation('33333333-3333-3333-3333-333333333333')$$,
  'you cannot open a thread with someone who is not a friend'
);

-- Messaging
do $$
declare v_conv uuid;
begin
  select id into v_conv from conversations where kind = 'direct';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform send_message(v_conv, 'בוקר טוב!');
  reset role;
end $$;

select assert(
  (select body from messages) = 'בוקר טוב!',
  'a member can post a message'
);

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select send_message((select id from conversations where kind = 'direct'), 'עוקף')$$,
  'a non-member cannot post into a conversation'
);

set role authenticated;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
create temp table mallory_msgs as select count(*) as n from messages;
reset role; reset request.jwt.claim.sub;

select assert((select n from mallory_msgs) = 0, 'a non-member cannot read the messages either');

-- Editing and deleting are the sender's alone.
select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select edit_message((select id from messages limit 1), 'נערך בידי מישהו אחר')$$,
  'a member cannot edit someone else''s message'
);
select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select delete_message((select id from messages limit 1))$$,
  'a member cannot delete someone else''s message'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform edit_message((select id from messages limit 1), 'בוקר אור!');
  reset role;
end $$;

select assert(
  (select body from messages) = 'בוקר אור!' and (select edited_at from messages) is not null,
  'the sender can edit their own message and it is marked edited'
);

-- Sharing a goal: only your own, and only a personal one.
select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select send_message((select id from conversations where kind='direct'), null,
      'aaaa0001-0000-0000-0000-000000000001')$$,
  'a library goal cannot be shared into a chat'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform send_message((select id from conversations where kind='direct'), null,
                       'aaaa0002-0000-0000-0000-000000000002');
  reset role;
end $$;

select assert(
  (select count(*) from messages where shared_goal_id is not null) = 1,
  'a personal goal can be shared into a chat'
);

-- Deleting clears the text rather than only flagging it.
do $$
declare v_id uuid;
begin
  select id into v_id from messages where body = 'בוקר אור!';
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform delete_message(v_id);
  reset role;
  if (select body from messages where id = v_id) is not null then
    raise exception 'FAILED: a deleted message kept its text';
  end if;
  raise notice 'ok: deleting a message clears its body, not just a flag';
end $$;

-- Blocking cuts the chat and the progress visibility together.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform block_user('22222222-2222-2222-2222-222222222222');
  reset role;
end $$;

select assert(
  not are_friends('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),
  'blocking ends the friendship'
);

set role authenticated;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
create temp table bob_after_block as
  select count(*) as goals from user_goals where user_id = '11111111-1111-1111-1111-111111111111';
reset role; reset request.jwt.claim.sub;

select assert(
  (select goals from bob_after_block) = 0,
  'a blocked user can no longer see your goals'
);

select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select send_message((select id from conversations where kind='direct'), 'עדיין כאן?')$$,
  'a blocked user cannot post in the shared thread'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select block_user('11111111-1111-1111-1111-111111111111')$$,
  'you cannot block yourself'
);

-- -----------------------------------------------------------------------------
-- Invite links (0006)
-- -----------------------------------------------------------------------------

do $$
declare v_token text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select token into v_token from my_invite_code();
  perform set_config('request.jwt.claim.sub', '', true);
  reset role;
  perform set_config('pisga.test_token', v_token, false);
end $$;

select assert(
  (select count(*) from invite_codes where owner_id = '33333333-3333-3333-3333-333333333333') = 1,
  'a first call to my_invite_code creates exactly one code'
);

do $$
declare v_second text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select token into v_second from my_invite_code();
  reset role;
  if v_second <> current_setting('pisga.test_token') then
    raise exception 'FAILED: calling my_invite_code twice returned two different codes';
  end if;
  raise notice 'ok: calling my_invite_code again returns the same active code';
end $$;

-- Bob (no prior history with mallory — alice already has an unrelated pending
-- row with her from an earlier test) redeems mallory's link and becomes a
-- friend immediately — no request, no approval step.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform redeem_invite(current_setting('pisga.test_token'));
  reset role;
end $$;

select assert(
  are_friends('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'),
  'redeeming an invite link makes the two users friends immediately'
);

-- Idempotent: redeeming the same link again must not error or duplicate the row.
do $$
declare v_count int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform redeem_invite(current_setting('pisga.test_token'));
  reset role;
  select count(*) into v_count from friendships
  where (user_id = '22222222-2222-2222-2222-222222222222' and friend_id = '33333333-3333-3333-3333-333333333333')
     or (friend_id = '22222222-2222-2222-2222-222222222222' and user_id = '33333333-3333-3333-3333-333333333333');
  if v_count <> 1 then
    raise exception 'FAILED: redeeming the same invite twice created % rows', v_count;
  end if;
  raise notice 'ok: redeeming the same invite link twice is a no-op, not a duplicate';
end $$;

select assert(
  (select count(*) from net.http_post_log
   where body @> '{"table": "friendships"}'::jsonb) = 1,
  'redeeming an invite link notifies the owner exactly once, not again on the idempotent re-redeem'
);

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select redeem_invite(current_setting('pisga.test_token'))$$,
  'you cannot redeem your own invite link'
);

-- Regenerating kills the old code — it must stop working immediately.
do $$
declare v_old text := current_setting('pisga.test_token');
declare v_new text;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select token into v_new from regenerate_invite_code();
  reset role;
  if v_new = v_old then
    raise exception 'FAILED: regenerate_invite_code returned the same token';
  end if;
  perform set_config('pisga.test_token', v_new, false);
end $$;

select assert(
  (select count(*) from invite_codes
   where owner_id = '33333333-3333-3333-3333-333333333333' and revoked_at is null) = 1,
  'regenerating leaves exactly one active code for the owner'
);

select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select redeem_invite((select token from invite_codes
      where owner_id = '33333333-3333-3333-3333-333333333333' and revoked_at is not null))$$,
  'a revoked invite link no longer works'
);

-- invite_preview has to work before sign-in, so it is exercised as anon, not authenticated.
do $$
declare v_name text; v_revoked text;
begin
  set local role anon;
  select display_name into v_name from invite_preview(current_setting('pisga.test_token'));
  reset role;
  if v_name is distinct from 'Mallory' then
    raise exception 'FAILED: invite_preview did not return the owner''s name to an anonymous caller';
  end if;
  raise notice 'ok: invite_preview shows the inviter''s name to a signed-out visitor';

  select token into v_revoked from invite_codes
    where owner_id = '33333333-3333-3333-3333-333333333333' and revoked_at is not null;
  set local role anon;
  if exists (select 1 from invite_preview(v_revoked)) then
    reset role;
    raise exception 'FAILED: invite_preview returned a row for a revoked token';
  end if;
  reset role;
  raise notice 'ok: invite_preview returns nothing for a revoked token';
end $$;

-- -----------------------------------------------------------------------------
-- Avatar storage (0006)
-- -----------------------------------------------------------------------------

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$insert into storage.objects (bucket_id, name, owner)
    values ('avatars', '22222222-2222-2222-2222-222222222222/photo.png', '11111111-1111-1111-1111-111111111111')$$,
  'a user cannot upload into another user''s avatar folder'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into storage.objects (bucket_id, name, owner)
  values ('avatars', '11111111-1111-1111-1111-111111111111/photo.png', '11111111-1111-1111-1111-111111111111');
  reset role;
end $$;

select assert(
  (select count(*) from storage.objects where bucket_id = 'avatars') = 1,
  'a user can upload into their own avatar folder'
);

-- -----------------------------------------------------------------------------
-- Group management (0006)
-- -----------------------------------------------------------------------------

-- By this point alice blocked bob (chat tests) and bob+mallory are friends
-- (the invite tests above), so bob — not alice — is the one with two
-- available friends. A 4th fixture user, dave, gives bob someone to add
-- after the group already exists, exercising add_group_member separately
-- from group creation.
insert into auth.users (id, email, raw_user_meta_data) values
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com', '{"full_name": "Dave"}');
insert into friendships (user_id, friend_id, status)
values ('22222222-2222-2222-2222-222222222222',
        '44444444-4444-4444-4444-444444444444', 'accepted');

do $$
declare v_group uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select id into v_group from create_group_conversation(
    'קבוצת בדיקה',
    array['33333333-3333-3333-3333-333333333333'::uuid]
  );
  reset role;
  perform set_config('pisga.test_group', v_group::text, false);
end $$;

-- Default: any member can post, not just the owner (bob).
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform send_message(current_setting('pisga.test_group')::uuid, 'שלום ממלורי');
  reset role;
end $$;

select assert(
  (select count(*) from messages where conversation_id = current_setting('pisga.test_group')::uuid) = 1,
  'by default any group member can post'
);

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select set_group_posting_mode(current_setting('pisga.test_group')::uuid, false)$$,
  'a non-owner cannot switch the group to owner-only'
);

-- Owner (bob) switches the group to broadcast-only.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform set_group_posting_mode(current_setting('pisga.test_group')::uuid, false);
  reset role;
end $$;

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select send_message(current_setting('pisga.test_group')::uuid, 'עדיין מדבר?')$$,
  'once switched to owner-only, a member can no longer post'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform send_message(current_setting('pisga.test_group')::uuid, 'הודעה מהמנהל');
  reset role;
end $$;

select assert(
  (select count(*) from messages where conversation_id = current_setting('pisga.test_group')::uuid) = 2,
  'the owner can still post in owner-only mode'
);

-- Adding a member.
select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select add_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444')$$,
  'a non-owner cannot add a member'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform add_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444');
  reset role;
end $$;

select assert(
  (select count(*) from conversation_members where conversation_id = current_setting('pisga.test_group')::uuid) = 3,
  'the owner can add a member'
);

-- Removing a member: owner-only, and never the owner themself.
select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select remove_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444')$$,
  'a non-owner cannot remove a member'
);

select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select remove_group_member(current_setting('pisga.test_group')::uuid, '22222222-2222-2222-2222-222222222222')$$,
  'the owner cannot remove themself through remove_group_member'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform remove_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444');
  reset role;
end $$;

select assert(
  (select count(*) from conversation_members where conversation_id = current_setting('pisga.test_group')::uuid) = 2,
  'the owner can remove a member'
);

-- -----------------------------------------------------------------------------
-- Multiple admins (0008) — group is currently {bob: admin, mallory: member}.
-- -----------------------------------------------------------------------------

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform add_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444');
  reset role;
end $$;

select assert_denied(
  '33333333-3333-3333-3333-333333333333',
  $$select promote_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444')$$,
  'a non-admin cannot promote another member to admin'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform promote_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444');
  reset role;
end $$;

select assert(
  (select is_admin from conversation_members
   where conversation_id = current_setting('pisga.test_group')::uuid
     and user_id = '44444444-4444-4444-4444-444444444444'),
  'an admin can promote a regular member to admin'
);

-- Group is now {bob: admin, mallory: member, dave: admin}.
select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select remove_group_member(current_setting('pisga.test_group')::uuid, '44444444-4444-4444-4444-444444444444')$$,
  'an admin cannot be removed directly, even by another admin'
);

-- Bob (admin) leaves — allowed, since dave is still an admin.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform leave_group_conversation(current_setting('pisga.test_group')::uuid);
  reset role;
end $$;

select assert(
  not exists (
    select 1 from conversation_members
    where conversation_id = current_setting('pisga.test_group')::uuid
      and user_id = '22222222-2222-2222-2222-222222222222'
  ),
  'an admin can leave when another admin remains'
);

-- Group is now {mallory: member, dave: admin} — dave is the sole admin, and
-- mallory is still there, so dave leaving would orphan the group.
select assert_denied(
  '44444444-4444-4444-4444-444444444444',
  $$select leave_group_conversation(current_setting('pisga.test_group')::uuid)$$,
  'the sole admin cannot leave while another member remains'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  perform promote_group_member(current_setting('pisga.test_group')::uuid, '33333333-3333-3333-3333-333333333333');
  perform leave_group_conversation(current_setting('pisga.test_group')::uuid);
  reset role;
end $$;

select assert(
  not exists (
    select 1 from conversation_members
    where conversation_id = current_setting('pisga.test_group')::uuid
      and user_id = '44444444-4444-4444-4444-444444444444'
  ),
  'the sole admin can leave once another member is promoted first'
);

-- Group is now {mallory: admin} alone — leaving is fine with nobody left to orphan.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform leave_group_conversation(current_setting('pisga.test_group')::uuid);
  reset role;
end $$;

select assert(
  (select count(*) from conversation_members where conversation_id = current_setting('pisga.test_group')::uuid) = 0,
  'the last member of a group can always leave'
);

-- -----------------------------------------------------------------------------
-- Account deletion (0006)
-- -----------------------------------------------------------------------------

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform request_account_deletion();
  reset role;
end $$;

select assert(
  (select count(*) from account_deletion_requests where user_id = '22222222-2222-2222-2222-222222222222') = 1,
  'requesting account deletion records the request'
);

select assert(
  (select count(*) from user_goals where user_id = '22222222-2222-2222-2222-222222222222') = 0,
  'requesting account deletion wipes the user''s own goals'
);

select assert(
  (select count(*) from friendships
   where user_id = '22222222-2222-2222-2222-222222222222' or friend_id = '22222222-2222-2222-2222-222222222222') = 0,
  'requesting account deletion removes the user''s friendships'
);

-- -----------------------------------------------------------------------------
-- Unarchive (0006)
-- -----------------------------------------------------------------------------

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update user_goals set active = false where id = 'aaaa0002-0000-0000-0000-000000000002';
  reset role;
end $$;

select assert(
  not (select active from user_goals where id = 'aaaa0002-0000-0000-0000-000000000002'),
  'archiving a goal marks it inactive'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  perform unarchive_goal('aaaa0002-0000-0000-0000-000000000002');
  reset role;
end $$;

select assert(
  (select active from user_goals where id = 'aaaa0002-0000-0000-0000-000000000002'),
  'unarchiving a goal reactivates it'
);

select assert_denied(
  '22222222-2222-2222-2222-222222222222',
  $$select unarchive_goal('aaaa0001-0000-0000-0000-000000000001')$$,
  'a user cannot unarchive someone else''s goal'
);

-- -----------------------------------------------------------------------------
-- Push notifications (0007)
-- -----------------------------------------------------------------------------

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$insert into push_subscriptions (user_id, endpoint, p256dh, auth)
    values ('33333333-3333-3333-3333-333333333333', 'https://push.example/x', 'p', 'a')$$,
  'a user cannot create a push subscription for someone else'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values ('11111111-1111-1111-1111-111111111111', 'https://push.example/alice', 'p', 'a');
  reset role;
end $$;

select assert(
  (select count(*) from push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111') = 1,
  'a user can create their own push subscription'
);

do $$
declare v_seen int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  select count(*) into v_seen from push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111';
  reset role;
  if v_seen <> 0 then
    raise exception 'FAILED: another user could read someone else''s push subscription';
  end if;
  raise notice 'ok: a user cannot read someone else''s push subscription';
end $$;

select assert_no_rows_affected(
  '33333333-3333-3333-3333-333333333333',
  $$delete from push_subscriptions where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'a user cannot delete someone else''s push subscription'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$select * from goals_missed_today()$$,
  'goals_missed_today is not callable by an ordinary authenticated user'
);

-- A fresh, isolated pair — anyone reused this late in the file may already
-- carry block/deletion history from earlier sections (see the group-
-- management and account-deletion notes above).
insert into auth.users (id, email, raw_user_meta_data) values
  ('55555555-5555-5555-5555-555555555555', 'erin@example.com',  '{"full_name": "Erin"}'),
  ('66666666-6666-6666-6666-666666666666', 'frank@example.com', '{"full_name": "Frank"}');
insert into friendships (user_id, friend_id, status)
values ('55555555-5555-5555-5555-555555555555',
        '66666666-6666-6666-6666-666666666666', 'accepted');

-- A daily goal with an intact 3‑day streak as of yesterday, and nothing
-- logged yet today — exactly what goals_missed_today() should surface.
insert into user_goals (id, user_id, is_custom, title, category, goal_type, verification)
values ('99990001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555',
        true, 'Evening stretch', 'physical', 'daily', 'daily_checkin');
insert into goal_completions (user_goal_id, completed_date, current_streak)
values ('99990001-0000-0000-0000-000000000001', current_date - 1, 3);

select assert(
  exists (
    select 1 from goals_missed_today()
    where user_goal_id = '99990001-0000-0000-0000-000000000001'
  ),
  'goals_missed_today surfaces a goal with an intact streak and no completion today'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  perform record_goal_completion('99990001-0000-0000-0000-000000000001');
  reset role;
end $$;

select assert(
  not exists (
    select 1 from goals_missed_today()
    where user_goal_id = '99990001-0000-0000-0000-000000000001'
  ),
  'goals_missed_today drops a goal once it is completed today'
);

do $$
declare v_conversation uuid; v_message uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  select id into v_conversation from open_direct_conversation('66666666-6666-6666-6666-666666666666');
  select id into v_message from send_message(v_conversation, 'hello frank');
  reset role;
  perform set_config('pisga.test_conversation', v_conversation::text, false);
  perform set_config('pisga.test_message', v_message::text, false);
end $$;

select assert(
  (select array_agg(recipient) from notification_recipients_for_message(
    current_setting('pisga.test_message')::uuid
  ) as recipient) = array['66666666-6666-6666-6666-666666666666'::uuid],
  'a message notifies the other conversation member, not the sender'
);

select assert_denied(
  '55555555-5555-5555-5555-555555555555',
  $$select * from notification_recipients_for_message(current_setting('pisga.test_message')::uuid)$$,
  'notification_recipients_for_message is not callable by an ordinary authenticated user'
);

select assert(
  exists (
    select 1 from supabase_functions.http_request_log
    where table_name = 'messages'
  ),
  'sending a message fires the notify_on_message webhook trigger'
);

select assert(
  exists (
    select 1 from supabase_functions.http_request_log
    where table_name = 'user_badges'
  ),
  'earning a badge fires the notify_on_badge_earned webhook trigger'
);

insert into user_goals (id, user_id, is_custom, title, category, goal_type, verification, target_date)
values ('99990002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555',
        true, 'Read a book', 'academic', 'deadline', 'checkbox_reflection', current_date + 7);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  perform finish_goal('99990002-0000-0000-0000-000000000002');
  reset role;
end $$;

select assert(
  exists (
    select 1 from supabase_functions.http_request_log
    where table_name = 'user_goals'
  ),
  'finishing a deadline goal fires the notify_on_goal_completed webhook trigger'
);

-- -----------------------------------------------------------------------------
-- Structured goals — schema invariants (0010)
--
-- A fresh user, because the goal-per-category limit counts everything a user
-- already holds and the fixtures above have been adopting goals for alice
-- since the top of this file.
-- -----------------------------------------------------------------------------

insert into auth.users (id, email, raw_user_meta_data)
values ('77777777-7777-7777-7777-777777777777', 'gina@example.com', '{"full_name": "Gina"}');

insert into goals_library
  (slug, title_he, title_en, category, goal_type, verification, points, sort_order,
   code, subcategory, metric_key, metric_unit, metric_direction,
   base_points, level_1_value, level_step, verification_default, verification_allowed,
   calibration_questions)
values
  ('t-pushups', 'שכיבות סמיכה', 'Push-ups', 'physical', 'daily', 'guided_session', 24, 1,
   'T-01', 'כוח', 'reps_per_day', 'חזרות', 'up',
   24, 15, 2, 'V3', array['V3','V1']::verification_code[], '["Q1","Q2","Q4"]'::jsonb);

select assert(
  (select verification_trust_multiplier('V2')) = 1.2
    and (select verification_trust_multiplier('V0')) = 0.6
    and (select verification_trust_multiplier('V5')) = 1.0,
  'the verification trust multipliers match the section 5 catalogue'
);

-- Section 5: a structured goal is always verified.
do $$
begin
  begin
    insert into goals_library (slug, title_he, title_en, category, goal_type, verification,
                               code, metric_key, metric_unit, metric_direction,
                               base_points, level_1_value, level_step, verification_default)
    values ('t-bad-v0', 'x', 'x', 'physical', 'daily', 'daily_checkin',
            'T-99', 'k', 'u', 'up', 10, 1, 1, 'V0');
    raise exception 'FAILED: a library goal was allowed to default to V0';
  exception when check_violation then
    raise notice 'ok: a library goal cannot use V0 as its verification default';
  end;
end $$;

-- A half-specified library row would reach the engine and silently score zero.
do $$
begin
  begin
    insert into goals_library (slug, title_he, title_en, category, goal_type, verification,
                               code, metric_key)
    values ('t-partial', 'x', 'x', 'physical', 'daily', 'daily_checkin', 'T-98', 'k');
    raise exception 'FAILED: a half-specified structured goal was accepted';
  exception when check_violation then
    raise notice 'ok: a library row is either fully specified or not structured at all';
  end;
end $$;

-- Section 4.3: the personal record is a ceiling the current level never passes.
do $$
begin
  begin
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                            verification, current_level_value, personal_record_value)
    select '77777777-7777-7777-7777-777777777777', id, false, 'x', 'physical', 'daily',
           'guided_session', 30, 20
    from goals_library where code = 'T-01';
    raise exception 'FAILED: a level above the personal record was accepted';
  exception when others then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice 'ok: the current level can never exceed the personal record (%)', sqlerrm;
  end;
end $$;

-- Section 5.1: verification is what buys entry to the ranking, so a V0 goal
-- is by definition personal and unranked.
do $$
begin
  begin
    insert into user_goals (user_id, is_custom, title, category, goal_type, verification,
                            verification_code, counts_for_ranking)
    values ('77777777-7777-7777-7777-777777777777', true, 'x', 'physical', 'daily',
            'daily_checkin', 'V0', true);
    raise exception 'FAILED: a V0 goal was allowed into the ranking';
  exception when check_violation then
    raise notice 'ok: a V0 goal cannot count for ranking';
  end;

  begin
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                            verification, counts_for_ranking)
    select '77777777-7777-7777-7777-777777777777', id, false, 'x', 'physical', 'daily',
           'guided_session', false
    from goals_library where code = 'T-01';
    raise exception 'FAILED: a structured goal was allowed out of the ranking';
  exception when check_violation then
    raise notice 'ok: a structured goal always counts for ranking';
  end;
end $$;

-- Protection 1 — five active structured goals per category, no more.
-- A structured goal must reference the library (0001), so the six candidates
-- need six library rows to be adopted from.
insert into goals_library (slug, title_he, title_en, category, goal_type, verification, sort_order)
select 't-limit-' || i, 'מטרה ' || i, 'Goal ' || i, 'academic', 'daily', 'daily_checkin', 100 + i
from generate_series(1, 6) as i;

do $$
declare v_lib uuid;
begin
  for v_lib in select id from goals_library where slug like 't-limit-%' order by sort_order limit 5 loop
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type, verification)
    values ('77777777-7777-7777-7777-777777777777', v_lib, false, 'limit', 'academic',
            'daily', 'daily_checkin');
  end loop;
  raise notice 'ok: five structured goals in a category are allowed';
exception when others then
  raise exception 'FAILED: five structured goals were rejected — %', sqlerrm;
end $$;

do $$
declare v_lib uuid;
begin
  select id into v_lib from goals_library where slug = 't-limit-6';
  begin
    insert into user_goals (user_id, library_id, is_custom, title, category, goal_type, verification)
    values ('77777777-7777-7777-7777-777777777777', v_lib, false, 'limit 6', 'academic',
            'daily', 'daily_checkin');
    raise exception 'FAILED: a sixth structured goal was accepted';
  exception when others then
    if sqlerrm like 'FAILED:%' then raise; end if;
    raise notice 'ok: a sixth structured goal in one category is rejected (%)', sqlerrm;
  end;
end $$;

-- Personal goals are outside that budget: converting one frees a slot.
do $$
begin
  insert into user_goals (user_id, is_custom, title, category, goal_type, verification)
  values ('77777777-7777-7777-7777-777777777777', true, 'personal extra', 'academic',
          'daily', 'daily_checkin');
  raise notice 'ok: personal goals do not consume the structured-goal budget';
exception when others then
  raise exception 'FAILED: a personal goal was counted against the limit — %', sqlerrm;
end $$;

-- Points that a client can write are points a client can forge, and these
-- feed the friends leaderboard.
select assert_denied(
  '77777777-7777-7777-7777-777777777777',
  $$insert into weekly_metrics (user_goal_id, week_start, total_points)
    select id, week_start(current_date), 9999 from user_goals
    where user_id = '77777777-7777-7777-7777-777777777777' limit 1$$,
  'a client cannot insert its own weekly metrics'
);

select assert_denied(
  '77777777-7777-7777-7777-777777777777',
  $$insert into level_changes (user_goal_id, direction, from_value, to_value)
    select id, 'up', 10, 20 from user_goals
    where user_id = '77777777-7777-7777-7777-777777777777' limit 1$$,
  'a client cannot forge a level change'
);

-- Protection 4 — no negative points anywhere, and protection 2's category
-- ceiling is asserted per row so an uncapped value cannot be stored at all.
do $$
declare v_goal uuid;
begin
  select id into v_goal from user_goals
  where user_id = '77777777-7777-7777-7777-777777777777' limit 1;

  begin
    insert into weekly_metrics (user_goal_id, week_start, execution_points)
    values (v_goal, week_start(current_date), -5);
    raise exception 'FAILED: negative points were stored';
  exception when check_violation then
    raise notice 'ok: points can never be negative';
  end;

  begin
    insert into weekly_metrics (user_goal_id, week_start, improvement_points)
    values (v_goal, week_start(current_date), 120);
    raise exception 'FAILED: uncapped improvement points were stored';
  exception when check_violation then
    raise notice 'ok: improvement points are capped at 100 per row';
  end;

  begin
    insert into weekly_metrics (user_goal_id, week_start, level_multiplier)
    values (v_goal, week_start(current_date), 0.4);
    raise exception 'FAILED: a level multiplier below the 0.6 floor was stored';
  exception when check_violation then
    raise notice 'ok: the level multiplier floor of 0.6 holds';
  end;
end $$;

-- One row per goal per week: the baseline reads this table's own history, and
-- a duplicate week would corrupt every Δ computed after it.
do $$
declare v_goal uuid; v_week date := week_start(current_date);
begin
  select id into v_goal from user_goals
  where user_id = '77777777-7777-7777-7777-777777777777' limit 1;

  insert into weekly_metrics (user_goal_id, week_start, total_value) values (v_goal, v_week, 10);
  begin
    insert into weekly_metrics (user_goal_id, week_start, total_value) values (v_goal, v_week, 20);
    raise exception 'FAILED: two metric rows were stored for the same goal-week';
  exception when unique_violation then
    raise notice 'ok: a goal has at most one metrics row per week';
  end;
end $$;

-- Section 4.1: a level change has to actually change something, and its
-- recorded direction has to match the numbers.
do $$
declare v_goal uuid;
begin
  select id into v_goal from user_goals
  where user_id = '77777777-7777-7777-7777-777777777777' limit 1;

  begin
    insert into level_changes (user_goal_id, direction, from_value, to_value)
    values (v_goal, 'up', 10, 8);
    raise exception 'FAILED: an "up" change that lowered the level was accepted';
  exception when check_violation then
    raise notice 'ok: a level change direction must match its values';
  end;
end $$;

-- -----------------------------------------------------------------------------
-- The growth engine (0012)
--
-- The section 3.3 worked example, run through the SQL engine. src/lib/growth.ts
-- is pinned to the same numbers by its own unit tests; if these two ever drift,
-- the leaderboard and the progress screen would disagree about the same week.
-- -----------------------------------------------------------------------------

select assert(
  growth_level_multiplier(20, 20, 'up') = 1.0
    and round(growth_level_multiplier(16, 20, 'up'), 2) = 0.80
    and growth_level_multiplier(2, 20, 'up') = 0.6,
  'the level multiplier reproduces the section 4.1.1 table and floors at 0.6'
);

-- The two down-direction goals in the library (S-19, I-16) get the penalty
-- too: for them a better level is a smaller number, so the ratio inverts.
select assert(
  round(growth_level_multiplier(180, 120, 'down'), 2) = 0.67
    and growth_level_multiplier(120, 120, 'down') = 1.0,
  'the level multiplier inverts for a down-direction goal'
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'danny@example.com', '{"full_name": "Danny"}'),
  ('99999999-9999-9999-9999-999999999999', 'yossi@example.com', '{"full_name": "Yossi"}');

-- Push-ups: BP 24, L1 15/day. The section 3.3 table works in weekly totals,
-- so the baseline floor is 105.
do $$
declare v_lib uuid; v_danny uuid; v_yossi uuid; v_week date := week_start(current_date);
begin
  select id into v_lib from goals_library where code = 'P-01';

  insert into user_goals (id, user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value,
                          personal_record_value, added_at)
  values ('bbbb0001-0000-0000-0000-000000000001', '88888888-8888-8888-8888-888888888888',
          v_lib, false, 'שכיבות סמיכה', 'physical', 'daily', 'guided_session', 'V3',
          50, 50, now() - interval '8 weeks')
  returning id into v_danny;

  insert into user_goals (id, user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value,
                          personal_record_value, added_at)
  values ('bbbb0002-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999',
          v_lib, false, 'שכיבות סמיכה', 'physical', 'daily', 'guided_session', 'V3',
          15, 15, now() - interval '8 weeks')
  returning id into v_yossi;

  -- Danny's four-week peak is 350; Yossi's is 70, which the L1 floor lifts to 105.
  insert into weekly_metrics (user_goal_id, week_start, total_value) values
    (v_danny, v_week - 7,  350), (v_danny, v_week - 14, 350),
    (v_danny, v_week - 21, 280), (v_danny, v_week - 28, 245),
    (v_yossi, v_week - 7,  70),  (v_yossi, v_week - 14, 70),
    (v_yossi, v_week - 21, 65),  (v_yossi, v_week - 28, 60);

  -- Seven completions each: Danny 60/day (420), Yossi 20/day (140).
  insert into goal_completions (user_goal_id, completed_date, current_streak, metric_value, trust_multiplier)
  select v_danny, v_week + d, d + 1, 60, 1.0 from generate_series(0, 6) as d;
  insert into goal_completions (user_goal_id, completed_date, current_streak, metric_value, trust_multiplier)
  select v_yossi, v_week + d, d + 1, 20, 1.0 from generate_series(0, 6) as d;

  perform compute_weekly_metrics(v_danny, v_week);
  perform compute_weekly_metrics(v_yossi, v_week);
end $$;

select assert(
  (select baseline_value from weekly_metrics
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
     and week_start = week_start(current_date)) = 350
  and (select baseline_value from weekly_metrics
       where user_goal_id = 'bbbb0002-0000-0000-0000-000000000002'
         and week_start = week_start(current_date)) = 105,
  'the baseline is the 4-week peak, floored at L1 (softening the beginner)'
);

select assert(
  (select round(delta_pct, 2) from weekly_metrics
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
     and week_start = week_start(current_date)) = 0.20
  and (select round(delta_pct, 2) from weekly_metrics
       where user_goal_id = 'bbbb0002-0000-0000-0000-000000000002'
         and week_start = week_start(current_date)) = 0.33,
  'the deltas match section 3.3 — 20% for Danny, 33% for Yossi'
);

select assert(
  (select execution_points from weekly_metrics
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
     and week_start = week_start(current_date)) = 168
  and (select execution_points from weekly_metrics
       where user_goal_id = 'bbbb0002-0000-0000-0000-000000000002'
         and week_start = week_start(current_date)) = 168,
  'execution points are identical — nobody is paid for being strong'
);

-- The assertion the entire product rests on.
select assert(
  (select improvement_points from weekly_metrics
   where user_goal_id = 'bbbb0002-0000-0000-0000-000000000002'
     and week_start = week_start(current_date))
  >
  (select improvement_points from weekly_metrics
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
     and week_start = week_start(current_date)),
  'going 10 → 20 earns more improvement than going 50 → 60'
);

select assert(
  (select total_points from weekly_metrics
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
     and week_start = week_start(current_date)) = 182
  and (select total_points from weekly_metrics
       where user_goal_id = 'bbbb0002-0000-0000-0000-000000000002'
         and week_start = week_start(current_date)) = 192,
  'the totals are 182 and 192, exactly as section 3.3 works them out'
);

-- Protection 8 — a goal younger than two weeks has nothing to be measured
-- against, so improvement is withheld while execution still pays.
do $$
declare v_lib uuid; v_goal uuid; v_week date := week_start(current_date);
begin
  select id into v_lib from goals_library where code = 'P-03';
  insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value,
                          personal_record_value, added_at)
  values ('88888888-8888-8888-8888-888888888888', v_lib, false, 'סקוואט', 'physical',
          'daily', 'guided_session', 'V3', 30, 30, now() - interval '3 days')
  returning id into v_goal;

  insert into goal_completions (user_goal_id, completed_date, current_streak, metric_value, trust_multiplier)
  values (v_goal, current_date, 1, 900, 1.0);

  perform compute_weekly_metrics(v_goal, v_week);
  perform set_config('pisga.new_goal', v_goal::text, false);
end $$;

select assert(
  (select delta_pct from weekly_metrics
   where user_goal_id = current_setting('pisga.new_goal')::uuid) > 0
  and (select improvement_points from weekly_metrics
       where user_goal_id = current_setting('pisga.new_goal')::uuid) = 0
  and (select execution_points from weekly_metrics
       where user_goal_id = current_setting('pisga.new_goal')::uuid) > 0,
  'a goal under two weeks old earns execution but no improvement points'
);

-- Protection 6 — the 72-hour cooldown, and section 4.3's record that never falls.
do $$
declare v_goal uuid := 'bbbb0001-0000-0000-0000-000000000001';
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
  perform change_goal_level(v_goal, 'up');
  reset role;
end $$;

select assert(
  (select current_level_value from user_goals where id = 'bbbb0001-0000-0000-0000-000000000001') = 56
  and (select personal_record_value from user_goals where id = 'bbbb0001-0000-0000-0000-000000000001') = 56,
  'levelling up raises both the level and the personal record'
);

select assert(
  (select was_personal_record from level_changes
   where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
   order by changed_at desc limit 1),
  'a level-up past the old record is recorded as a personal record'
);

select assert_denied(
  '88888888-8888-8888-8888-888888888888',
  $$select change_goal_level('bbbb0001-0000-0000-0000-000000000001', 'down')$$,
  'a second level change inside 72 hours is refused'
);

-- Section 4.3: dropping a level leaves the record standing, which is what
-- makes the penalty last until the user climbs back. Sit-ups (L1 30, step 15)
-- opened at 60, so there is real room to fall.
do $$
declare v_lib uuid; v_goal uuid;
begin
  select id into v_lib from goals_library where code = 'P-05';
  insert into user_goals (id, user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value,
                          personal_record_value, added_at)
  values ('bbbb0003-0000-0000-0000-000000000003', '99999999-9999-9999-9999-999999999999',
          v_lib, false, 'כפיפות בטן', 'physical', 'daily', 'guided_session', 'V3',
          60, 60, now() - interval '8 weeks')
  returning id into v_goal;

  insert into goal_completions (user_goal_id, completed_date, current_streak, metric_value, trust_multiplier)
  values (v_goal, current_date, 1, 60, 1.0);

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  perform change_goal_level(v_goal, 'down');
  reset role;
end $$;

select assert(
  (select current_level_value from user_goals where id = 'bbbb0003-0000-0000-0000-000000000003') = 45
  and (select personal_record_value from user_goals where id = 'bbbb0003-0000-0000-0000-000000000003') = 60,
  'dropping a level never lowers the personal record'
);

select assert(
  (select level_multiplier from weekly_metrics
   where user_goal_id = 'bbbb0003-0000-0000-0000-000000000003'
     and week_start = week_start(current_date)) < 1.0,
  'the level multiplier falls after a drop, shrinking future execution points'
);

-- A goal already sitting at the library floor has nowhere left to drop to.
select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select change_goal_level('bbbb0002-0000-0000-0000-000000000002', 'down')$$,
  'a goal at its opening level cannot be dropped further'
);

-- Section 5.1 — conversion moves a goal between the two economies.
do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '88888888-8888-8888-8888-888888888888', true);
  perform convert_goal_to_personal('bbbb0001-0000-0000-0000-000000000001');
  reset role;
end $$;

select assert(
  (select is_custom and not counts_for_ranking and verification_code = 'V0'
     and converted_from_goal_id is not null and library_id is null
   from user_goals where id = 'bbbb0001-0000-0000-0000-000000000001'),
  'converting to personal drops the ranking, sets V0, and remembers the origin'
);

select assert(
  (select current_level_value = 56 and personal_record_value = 56
   from user_goals where id = 'bbbb0001-0000-0000-0000-000000000001'),
  'conversion keeps the level and the personal record (section 5.1 rule 4)'
);

-- Rule 3: the weeks spent personal leave the baseline window entirely.
select assert(
  not (select counted_for_ranking from weekly_metrics
       where user_goal_id = 'bbbb0001-0000-0000-0000-000000000001'
         and week_start = week_start(current_date)),
  'the week of the conversion stops counting for ranking'
);

select assert_denied(
  '88888888-8888-8888-8888-888888888888',
  $$select convert_goal_to_structured('bbbb0001-0000-0000-0000-000000000001')$$,
  'returning to the ranking inside 7 days is refused'
);

-- Protection 7 — no backfilling an avoidance goal.
do $$
declare v_lib uuid; v_goal uuid;
begin
  select id into v_lib from goals_library where code = 'P-19';  -- V4
  insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value, personal_record_value)
  values ('99999999-9999-9999-9999-999999999999', v_lib, false, 'סוכר', 'physical',
          'daily', 'daily_checkin', 'V4', 3, 3)
  returning id into v_goal;
  perform set_config('pisga.v4_goal', v_goal::text, false);
end $$;

select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select record_structured_completion(current_setting('pisga.v4_goal')::uuid, 1, null, current_date - 3)$$,
  'a V4 avoidance goal cannot be filled in retroactively'
);

-- Section 5 — V5 stays light, but not empty.
do $$
declare v_lib uuid; v_goal uuid;
begin
  select id into v_lib from goals_library where code = 'S-01';  -- V5
  insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value, personal_record_value)
  values ('99999999-9999-9999-9999-999999999999', v_lib, false, 'שיחה', 'social',
          'daily', 'checkbox_reflection', 'V5', 2, 2)
  returning id into v_goal;
  perform set_config('pisga.v5_goal', v_goal::text, false);
end $$;

select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select record_structured_completion(current_setting('pisga.v5_goal')::uuid, 1, 'קצר מדי')$$,
  'a V5 completion under 40 characters is refused'
);

-- The trust multiplier is resolved server-side and frozen onto the row, so a
-- later change to the goal's verification cannot re-price earned history.
do $$
declare v_goal uuid := current_setting('pisga.v5_goal')::uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  perform record_structured_completion(
    v_goal, 1, 'דיברתי עם אמא כמעט חצי שעה על השבוע שעבר ועל העבודה החדשה שלה');
  reset role;
end $$;

select assert(
  (select trust_multiplier from goal_completions
   where user_goal_id = current_setting('pisga.v5_goal')::uuid) = 1.0,
  'a completion stores the trust multiplier that applied when it was earned'
);

-- Section 3.5 — the growth table ranks by improvement, not by volume.
do $$
declare v_rows int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  select count(*) into v_rows from growth_leaderboard();
  reset role;
  if v_rows < 1 then
    raise exception 'FAILED: the growth leaderboard returned nothing for a signed-in user';
  end if;
  raise notice 'ok: the growth leaderboard returns the caller and their friends';
end $$;

-- -----------------------------------------------------------------------------
-- Goal media storage (0013)
--
-- The V6 bucket is private, unlike avatars. Two things must hold: the folder
-- rule keeps one user out of another's proof, and the bucket itself is not
-- readable by an anonymous visitor holding only the object path.
-- -----------------------------------------------------------------------------

select assert(
  (select not public from storage.buckets where id = 'goal-media'),
  'the goal-media bucket is private — proof of where someone was is not an avatar'
);

select assert_denied(
  '11111111-1111-1111-1111-111111111111',
  $$insert into storage.objects (bucket_id, name, owner)
    values ('goal-media', '22222222-2222-2222-2222-222222222222/g/1.jpg',
            '11111111-1111-1111-1111-111111111111')$$,
  'a user cannot upload proof into another user''s goal-media folder'
);

do $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  insert into storage.objects (bucket_id, name, owner)
  values ('goal-media', '11111111-1111-1111-1111-111111111111/g/1.jpg',
          '11111111-1111-1111-1111-111111111111');
  reset role;
end $$;

do $$
declare v_seen int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  select count(*) into v_seen from storage.objects where bucket_id = 'goal-media';
  reset role;
  if v_seen <> 0 then
    raise exception 'FAILED: another user could read % goal-media object(s)', v_seen;
  end if;
  raise notice 'ok: one user cannot read another user''s goal media';
end $$;

do $$
declare v_seen int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into v_seen from storage.objects where bucket_id = 'goal-media';
  reset role;
  if v_seen <> 1 then
    raise exception 'FAILED: the owner saw % of their own goal-media objects', v_seen;
  end if;
  raise notice 'ok: the owner reads their own goal media';
end $$;

-- -----------------------------------------------------------------------------
-- Verification fallback (0014)
--
-- P-08 (daily walking) defaults to V2 and allows {V2, V1, V6}. The user may
-- complete it with an allowed alternative, and the trust multiplier must then
-- be the alternative's — never the sensor's ×1.2.
-- -----------------------------------------------------------------------------

do $$
declare v_lib uuid; v_goal uuid;
begin
  select id into v_lib from goals_library where code = 'P-08';  -- V2, allows V1/V6
  insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value, personal_record_value)
  values ('99999999-9999-9999-9999-999999999999', v_lib, false, 'הליכה', 'physical',
          'daily', 'sensor_sync', 'V2', 5000, 5000)
  returning id into v_goal;
  perform set_config('pisga.v2_goal', v_goal::text, false);
end $$;

do $$
declare v_goal uuid := current_setting('pisga.v2_goal')::uuid;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  perform record_structured_completion(v_goal, 5200, null, current_date, false, 'V6');
  reset role;
end $$;

select assert(
  (select trust_multiplier from goal_completions
   where user_goal_id = current_setting('pisga.v2_goal')::uuid) = 1.1,
  'a fallback completion is priced by the method actually used, not the goal''s default'
);

select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select record_structured_completion(current_setting('pisga.v2_goal')::uuid, 5200, null,
                                        current_date, false, 'V3')$$,
  'a method outside the goal''s verification_allowed is refused'
);

select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select record_structured_completion(current_setting('pisga.v2_goal')::uuid, 5200, null,
                                        current_date, false, 'V0')$$,
  'V0 is never in a library goal''s allowed list, so it cannot be chosen here'
);

-- The V5 minimum follows the method used, so falling back to V5 still has to
-- say something. S-12 defaults to V5 and allows V6.
select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$select record_structured_completion(current_setting('pisga.v5_goal')::uuid, 1, 'קצר',
                                        current_date, false, 'V5')$$,
  'the 40-character floor still applies when V5 is named explicitly'
);

-- -----------------------------------------------------------------------------
-- Health sync (0015)
--
-- The V2 ingest path. Every one of these is a way the ×1.2 multiplier could be
-- claimed without a sensor actually having measured anything.
-- -----------------------------------------------------------------------------

select assert(
  (select count(*) from pg_proc p
   where p.proname = 'record_health_completion'
     and has_function_privilege('authenticated', p.oid, 'execute')) = 0,
  'a signed-in user cannot call record_health_completion — it is service-role only'
);

select assert(
  (select count(*) from pg_proc p
   where p.proname = 'connect_health_source'
     and has_function_privilege('authenticated', p.oid, 'execute')) = 0,
  'a signed-in user cannot claim a health connection for themselves'
);

-- A user cannot forge the connection row directly either: there is no insert
-- policy, only select and delete.
select assert_denied(
  '99999999-9999-9999-9999-999999999999',
  $$insert into health_sources (user_id, source)
    values ('99999999-9999-9999-9999-999999999999', 'apple_health')$$,
  'a user cannot insert their own health_sources row'
);

-- Reuses the P-08 goal adopted for the 0014 fallback tests above: one
-- adoption per library goal per user, and P-08 is the sensor goal.
do $$
begin
  perform set_config('pisga.health_goal', current_setting('pisga.v2_goal'), false);
end $$;

-- Without a connection there is nothing to trust.
do $$
declare v_failed boolean := false;
begin
  begin
    perform record_health_completion(
      '99999999-9999-9999-9999-999999999999',
      current_setting('pisga.health_goal')::uuid, 6000, 'apple_health', false);
  exception when others then
    v_failed := true;
    raise notice 'ok: a reading is refused before the store is connected (rejected: %)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAILED: a reading was accepted with no health_sources row';
  end if;
end $$;

do $$
begin
  perform connect_health_source(
    '99999999-9999-9999-9999-999999999999', 'apple_health',
    array['steps', 'distance'], 'iPhone 15');
end $$;

-- Layer 1 — the whole reason this migration exists.
do $$
declare v_failed boolean := false;
begin
  begin
    perform record_health_completion(
      '99999999-9999-9999-9999-999999999999',
      current_setting('pisga.health_goal')::uuid, 20000, 'apple_health', true);
  exception when others then
    v_failed := true;
    raise notice 'ok: a hand-entered Health sample cannot verify a sensor goal (rejected: %)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAILED: a hand-entered sample earned a sensor completion';
  end if;
end $$;

do $$
begin
  perform record_health_completion(
    '99999999-9999-9999-9999-999999999999',
    current_setting('pisga.health_goal')::uuid, 6200, 'apple_health', false,
    current_date, 'iPhone 15');
end $$;

select assert(
  (select trust_multiplier = 1.2 and source = 'apple_health' and source_device = 'iPhone 15'
   from goal_completions
   where user_goal_id = current_setting('pisga.health_goal')::uuid) ,
  'a device reading is worth ×1.2 and keeps its provenance'
);

select assert(
  (select last_synced_at is not null from health_sources
   where user_id = '99999999-9999-9999-9999-999999999999' and source = 'apple_health'),
  'a successful sync stamps the connection'
);

-- A sensor reporting yesterday is normal — protection 7 restricts V4/V7 only.
do $$
begin
  perform record_health_completion(
    '99999999-9999-9999-9999-999999999999',
    current_setting('pisga.health_goal')::uuid, 5800, 'apple_health', false,
    current_date - 1, 'iPhone 15');
  raise notice 'ok: a sensor may report yesterday';
end $$;

-- A goal measured another way is not fair game just because steps were read.
do $$
declare v_lib uuid; v_goal uuid; v_failed boolean := false;
begin
  select id into v_lib from goals_library where code = 'A-05';  -- V8, flashcards
  insert into user_goals (user_id, library_id, is_custom, title, category, goal_type,
                          verification, verification_code, current_level_value, personal_record_value)
  values ('99999999-9999-9999-9999-999999999999', v_lib, false, 'כרטיסיות', 'academic',
          'daily', 'checkbox_reflection', 'V8', 20, 20)
  returning id into v_goal;

  begin
    perform record_health_completion(
      '99999999-9999-9999-9999-999999999999', v_goal, 40, 'apple_health', false);
  exception when others then
    v_failed := true;
    raise notice 'ok: a non-sensor goal cannot be completed from the health store (rejected: %)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAILED: a V8 goal was completed from a step count';
  end if;
end $$;

-- One user's device cannot write into another user's goal.
do $$
declare v_failed boolean := false;
begin
  begin
    perform record_health_completion(
      '11111111-1111-1111-1111-111111111111',
      current_setting('pisga.health_goal')::uuid, 9000, 'apple_health', false);
  exception when others then
    v_failed := true;
    raise notice 'ok: a health reading cannot be written into someone else''s goal (rejected: %)', sqlerrm;
  end;
  if not v_failed then
    raise exception 'FAILED: a reading crossed users';
  end if;
end $$;

-- The app asks which goals to read from the phone; it must only ever get its own.
do $$
declare v_mine int; v_theirs int;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', true);
  select count(*) into v_mine from my_health_goals();
  reset role;

  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  select count(*) into v_theirs from my_health_goals();
  reset role;

  if v_mine < 1 then
    raise exception 'FAILED: my_health_goals returned nothing for the owner';
  end if;
  if v_theirs <> 0 then
    raise exception 'FAILED: my_health_goals leaked % goal(s) to another user', v_theirs;
  end if;
  raise notice 'ok: my_health_goals returns the caller''s sensor goals and nobody else''s';
end $$;

\echo 'all RLS tests passed'
