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

\echo 'all RLS tests passed'
