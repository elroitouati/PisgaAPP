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

\echo 'all RLS tests passed'
