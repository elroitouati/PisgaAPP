-- =============================================================================
-- Friend chat (designs 4c, 7a, 7b).
--
-- Not in the PRD — added on the product owner's decision, with these rules:
--   * 1:1 and group threads, plus a thread created automatically per shared
--     challenge.
--   * A sender may edit or delete their own message, and nobody else's.
--   * A user may share one of their own personal goals into a thread.
--   * A user may block a friend.
--
-- Blocking is decisive on purpose: it cuts the chat AND the progress
-- visibility, by making are_friends() report false for a blocked pair. A block
-- that left the other person watching your goals would not be a block.
-- =============================================================================

create type conversation_kind as enum ('direct', 'group', 'challenge');

create table conversations (
  id         uuid primary key default gen_random_uuid(),
  kind       conversation_kind not null,
  -- Group threads are named; direct threads take their name from the other
  -- person, and challenge threads from the goal.
  title      text,
  -- Set for kind = 'challenge': the shared goal the thread belongs to.
  user_goal_id uuid references user_goals (id) on delete cascade,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- The two participants of a direct thread, stored ordered so the unique
  -- index below can stop a second thread being opened for the same pair.
  user_a uuid references profiles (id) on delete cascade,
  user_b uuid references profiles (id) on delete cascade,

  constraint direct_threads_have_a_pair
    check ((kind = 'direct') = (user_a is not null and user_b is not null)),
  constraint direct_pair_is_ordered
    check (user_a is null or user_a < user_b),
  constraint challenge_threads_have_a_goal
    check ((kind = 'challenge') = (user_goal_id is not null)),
  constraint group_threads_are_named
    check (kind <> 'group' or coalesce(btrim(title), '') <> '')
);

create unique index conversations_one_thread_per_pair
  on conversations (user_a, user_b) where kind = 'direct';
create unique index conversations_one_thread_per_challenge
  on conversations (user_goal_id) where kind = 'challenge';

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id         uuid not null references profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- Drives the unread badge in design 4c.
  last_read_at    timestamptz not null default 'epoch',
  primary key (conversation_id, user_id)
);

create index on conversation_members (user_id);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id       uuid not null references profiles (id) on delete cascade,
  body            text,
  -- Optional attachment: one of the sender's own goals.
  shared_goal_id  uuid references user_goals (id) on delete set null,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  -- Soft delete: the row stays so the thread keeps its shape, but the body is
  -- cleared by the delete function rather than left readable.
  deleted_at      timestamptz,

  constraint message_has_content
    check (deleted_at is not null or coalesce(btrim(body), '') <> '' or shared_goal_id is not null)
);

create index on messages (conversation_id, created_at desc);

create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint no_self_block check (blocker_id <> blocked_id)
);

create index on blocks (blocked_id);

-- =============================================================================
-- Helpers
-- =============================================================================

create or replace function is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

-- A block overrides friendship everywhere it is consulted: goals, completions,
-- badges and profiles all read through this one function.
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from friendships f
    where f.status = 'accepted'
      and ((f.user_id = a and f.friend_id = b) or (f.user_id = b and f.friend_id = a))
  ) and not is_blocked_pair(a, b);
$$;

-- SECURITY DEFINER for the same reason as the goal helpers: the membership
-- check inside a conversation_members policy would otherwise re-enter itself.
create or replace function is_conversation_member(p_conversation_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from conversation_members m
    where m.conversation_id = p_conversation_id and m.user_id = p_user
  );
$$;

/**
 * True when the caller may post in a thread: a member, and not blocked by
 * anyone else in it. Checked on send rather than only on read, so a block
 * stops new messages immediately.
 */
create or replace function can_post_in_conversation(p_conversation_id uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_conversation_member(p_conversation_id, p_user)
    and not exists (
      select 1 from conversation_members m
      where m.conversation_id = p_conversation_id
        and m.user_id <> p_user
        and is_blocked_pair(m.user_id, p_user)
    );
$$;

-- =============================================================================
-- Thread creation
-- =============================================================================

/**
 * Finds the existing 1:1 thread with a friend or opens one. Find-or-create in
 * the database rather than the client, so two devices tapping at once cannot
 * create two threads for the same pair — the unique index would reject the
 * second and the user would see an error instead of their conversation.
 */
create or replace function open_direct_conversation(p_other_user uuid)
returns conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_a uuid := least(auth.uid(), p_other_user);
  v_b uuid := greatest(auth.uid(), p_other_user);
  v_row conversations;
begin
  if v_me is null or v_me = p_other_user then
    raise exception 'invalid conversation partner';
  end if;

  if not are_friends(v_me, p_other_user) then
    raise exception 'you can only message accepted friends';
  end if;

  select * into v_row from conversations
  where kind = 'direct' and user_a = v_a and user_b = v_b;

  if found then
    return v_row;
  end if;

  insert into conversations (kind, created_by, user_a, user_b)
  values ('direct', v_me, v_a, v_b)
  returning * into v_row;

  insert into conversation_members (conversation_id, user_id)
  values (v_row.id, v_a), (v_row.id, v_b);

  return v_row;
end;
$$;

/** Opens a named group thread with a chosen set of friends. */
create or replace function create_group_conversation(p_title text, p_member_ids uuid[])
returns conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_row conversations;
begin
  if v_me is null then
    raise exception 'not signed in';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'a group needs a name';
  end if;

  foreach v_other in array p_member_ids loop
    if v_other <> v_me and not are_friends(v_me, v_other) then
      raise exception 'you can only add accepted friends to a group';
    end if;
  end loop;

  insert into conversations (kind, title, created_by)
  values ('group', btrim(p_title), v_me)
  returning * into v_row;

  insert into conversation_members (conversation_id, user_id)
  select v_row.id, unnest(array_append(p_member_ids, v_me))
  on conflict do nothing;

  return v_row;
end;
$$;

-- Accepting a shared goal opens the challenge thread and adds both sides, so a
-- challenge always has somewhere to talk without anyone creating it by hand.
create or replace function on_goal_share_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_conversation uuid;
  v_title text;
begin
  if new.status <> 'accepted' or (tg_op = 'UPDATE' and old.status = 'accepted') then
    return new;
  end if;

  select user_id, title into v_owner, v_title from user_goals where id = new.user_goal_id;
  if v_owner is null then
    return new;
  end if;

  select id into v_conversation from conversations
  where kind = 'challenge' and user_goal_id = new.user_goal_id;

  if v_conversation is null then
    insert into conversations (kind, title, user_goal_id, created_by)
    values ('challenge', v_title, new.user_goal_id, v_owner)
    returning id into v_conversation;
  end if;

  insert into conversation_members (conversation_id, user_id)
  values (v_conversation, v_owner), (v_conversation, new.shared_with_user_id)
  on conflict do nothing;

  return new;
end;
$$;

create trigger goal_shares_open_thread
  after insert or update of status on goal_shares
  for each row execute function on_goal_share_accepted();

-- =============================================================================
-- Message actions
-- =============================================================================

create or replace function send_message(
  p_conversation_id uuid,
  p_body text default null,
  p_shared_goal_id uuid default null
)
returns messages
language plpgsql
security invoker
set search_path = public
as $$
declare v_row messages;
begin
  if not can_post_in_conversation(p_conversation_id, auth.uid()) then
    raise exception 'you cannot post in this conversation';
  end if;

  -- Only your own goal can be attached, and only a personal one: library goals
  -- are already visible to friends, so sharing them adds nothing.
  if p_shared_goal_id is not null and not exists (
    select 1 from user_goals g
    where g.id = p_shared_goal_id and g.user_id = auth.uid() and g.is_custom
  ) then
    raise exception 'you can only share your own personal goal';
  end if;

  insert into messages (conversation_id, sender_id, body, shared_goal_id)
  values (p_conversation_id, auth.uid(), nullif(btrim(p_body), ''), p_shared_goal_id)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function edit_message(p_message_id uuid, p_body text)
returns messages
language plpgsql
security invoker
set search_path = public
as $$
declare v_row messages;
begin
  if coalesce(btrim(p_body), '') = '' then
    raise exception 'an edited message cannot be empty';
  end if;

  update messages
  set body = btrim(p_body), edited_at = now()
  where id = p_message_id and sender_id = auth.uid() and deleted_at is null
  returning * into v_row;

  if not found then
    raise exception 'message not found, not yours, or already deleted';
  end if;

  return v_row;
end;
$$;

-- Soft delete that actually removes the text. Keeping the row preserves the
-- thread's shape ("message deleted"); keeping the body would make the feature
-- a lie.
create or replace function delete_message(p_message_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update messages
  set deleted_at = now(), body = null, shared_goal_id = null
  where id = p_message_id and sender_id = auth.uid() and deleted_at is null;

  if not found then
    raise exception 'message not found, not yours, or already deleted';
  end if;
end;
$$;

create or replace function mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  update conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
$$;

/** Blocking also ends the friendship — see the note at the top of this file. */
create or replace function block_user(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_user_id = auth.uid() then
    raise exception 'you cannot block yourself';
  end if;

  insert into blocks (blocker_id, blocked_id)
  values (auth.uid(), p_user_id)
  on conflict do nothing;

  delete from friendships
  where (user_id = auth.uid() and friend_id = p_user_id)
     or (user_id = p_user_id and friend_id = auth.uid());
end;
$$;

create or replace function unblock_user(p_user_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table conversations        enable row level security;
alter table conversation_members enable row level security;
alter table messages             enable row level security;
alter table blocks               enable row level security;

create policy "members read their conversations"
  on conversations for select to authenticated
  using (is_conversation_member(id, auth.uid()));

-- Threads are created through the functions above, which validate friendship
-- and membership; there is no direct client insert path.

create policy "members see who else is in their conversations"
  on conversation_members for select to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "users update only their own membership row"
  on conversation_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "users leave a conversation themselves"
  on conversation_members for delete to authenticated
  using (user_id = auth.uid());

create policy "members read messages in their conversations"
  on messages for select to authenticated
  using (is_conversation_member(conversation_id, auth.uid()));

create policy "members post as themselves"
  on messages for insert to authenticated
  with check (sender_id = auth.uid() and can_post_in_conversation(conversation_id, auth.uid()));

create policy "senders edit only their own messages"
  on messages for update to authenticated
  using (sender_id = auth.uid()) with check (sender_id = auth.uid());

create policy "users manage their own blocks"
  on blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
