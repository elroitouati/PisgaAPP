-- =============================================================================
-- Profile features: invite links, avatar storage, account deletion, and the
-- archive/unarchive half of "my goals" that PRD/design 8g-8h needed.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Invite links (design 8k/8l, 8m-8p) — decided: one permanent, revocable,
-- auto-accept link per user. No expiry; the owner can regenerate to kill the
-- old one instead.
-- -----------------------------------------------------------------------------

create table invite_codes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles (id) on delete cascade,
  -- hex rather than base64url: the latter's encode() format was only added in
  -- PostgreSQL 18, well past what a Supabase project runs today.
  token      text not null unique default encode(gen_random_bytes(9), 'hex'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- One active (non-revoked) code per owner — regenerating must revoke the old
-- row rather than leaving two live links for the same person.
create unique index invite_codes_one_active_per_owner
  on invite_codes (owner_id) where revoked_at is null;

alter table invite_codes enable row level security;

create policy "owners read their own invite codes"
  on invite_codes for select to authenticated
  using (owner_id = auth.uid());

-- No insert/update policy: codes are only ever written through the functions
-- below, which run as the definer and enforce "one active code" themselves.

/** Returns the caller's active invite code, creating one on first use. */
create or replace function my_invite_code()
returns invite_codes
language plpgsql
security definer
set search_path = public
as $$
declare v_row invite_codes;
begin
  select * into v_row from invite_codes
  where owner_id = auth.uid() and revoked_at is null;

  if found then
    return v_row;
  end if;

  insert into invite_codes (owner_id) values (auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

/** Revokes the current code and issues a fresh one — the link the design shows. */
create or replace function regenerate_invite_code()
returns invite_codes
language plpgsql
security definer
set search_path = public
as $$
begin
  update invite_codes set revoked_at = now()
  where owner_id = auth.uid() and revoked_at is null;

  return my_invite_code();
end;
$$;

/**
 * Redeems an invite token: the caller and the code's owner become friends,
 * immediately and in both directions (PRD decision — no approval step).
 *
 * SECURITY DEFINER so a brand-new user (who is not yet anyone's friend, and
 * has no rows RLS would otherwise let them touch) can still look up the code
 * and write the friendship it grants.
 */
create or replace function redeem_invite(p_token text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_owner_profile profiles;
begin
  select owner_id into v_owner
  from invite_codes
  where token = p_token and revoked_at is null;

  if v_owner is null then
    raise exception 'this invite link is no longer valid';
  end if;

  if v_owner = auth.uid() then
    raise exception 'you cannot use your own invite link';
  end if;

  if is_blocked_pair(auth.uid(), v_owner) then
    raise exception 'this invite link is no longer valid';
  end if;

  -- Idempotent: opening the same link twice must not error or duplicate.
  insert into friendships (user_id, friend_id, status, responded_at)
  values (least(auth.uid(), v_owner), greatest(auth.uid(), v_owner), 'accepted', now())
  on conflict (user_id, friend_id) do update set status = 'accepted', responded_at = now();

  select * into v_owner_profile from profiles where id = v_owner;
  return v_owner_profile;
end;
$$;

/**
 * Lets the join-landing page (design 8m-8p) show who is inviting you before
 * you have signed in at all — the caller has no session yet, so this has to
 * work for `anon`, not just `authenticated`. It only ever returns the inviter's
 * name and avatar, never anything a signed-out visitor shouldn't see.
 */
create or replace function invite_preview(p_token text)
returns table (display_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.display_name, p.avatar_url
  from invite_codes i
  join profiles p on p.id = i.owner_id
  where i.token = p_token and i.revoked_at is null;
$$;

grant execute on function invite_preview(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Avatar storage (design 8a/8b) — a small, tightly-scoped bucket. Chat still
-- carries no images; this is the one place a photo upload exists.
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path convention: <user_id>/<filename>. The policies below key off the first
-- path segment, so a user can only write inside their own folder.
create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "users upload only into their own avatar folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users replace only their own avatar files"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "users delete only their own avatar files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Account deletion (design 8e/8f) — irreversible, typed confirmation.
--
-- A client can delete every row it owns, but not the auth.users row itself:
-- that requires the service-role key, which never reaches the browser. So
-- this function does the part a client legitimately can do — wipe owned data
-- — and records a request row a server-side job (Edge Function with the
-- service-role key) is expected to pick up and finish by calling
-- `auth.admin.deleteUser`. That job is infrastructure, not app code, and is
-- not implemented here.
-- -----------------------------------------------------------------------------

create table account_deletion_requests (
  user_id      uuid primary key references profiles (id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table account_deletion_requests enable row level security;

create policy "users see only their own deletion request"
  on account_deletion_requests for select to authenticated
  using (user_id = auth.uid());

create policy "users file only their own deletion request"
  on account_deletion_requests for insert to authenticated
  with check (user_id = auth.uid());

create or replace function request_account_deletion()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into account_deletion_requests (user_id) values (auth.uid())
  on conflict (user_id) do nothing;

  -- Wipe what the client is allowed to wipe. auth.users itself, and the
  -- profiles row that cascades from it, are left for the server-side job.
  delete from messages where sender_id = auth.uid();
  delete from conversation_members where user_id = auth.uid();
  delete from goal_shares
    where shared_with_user_id = auth.uid()
       or user_goal_id in (select id from user_goals where user_id = auth.uid());
  delete from user_badges where user_id = auth.uid();
  delete from user_goals where user_id = auth.uid();
  delete from onboarding_answers where user_id = auth.uid();
  delete from friendships where user_id = auth.uid() or friend_id = auth.uid();
  delete from blocks where blocker_id = auth.uid() or blocked_id = auth.uid();
  delete from invite_codes where owner_id = auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- Unarchive (design 8g/8h "בארכיון" tab) — archiveGoal already existed
-- client-side (sets active = false); this is the missing other direction.
-- -----------------------------------------------------------------------------

create or replace function unarchive_goal(p_user_goal_id uuid)
returns user_goals
language plpgsql
security invoker
set search_path = public
as $$
declare v_row user_goals;
begin
  update user_goals set active = true, updated_at = now()
  where id = p_user_goal_id and user_id = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'goal not found or not owned by you';
  end if;

  return v_row;
end;
$$;

-- -----------------------------------------------------------------------------
-- Group management (decided: any member posts by default; the owner can
-- switch a group to owner-only broadcast, and can add or remove members).
-- -----------------------------------------------------------------------------

alter table conversations add column members_can_post boolean not null default true;

-- 0005 never added an UPDATE policy (nothing on conversations needed changing
-- yet), so set_group_posting_mode's UPDATE would match zero rows under RLS
-- even for the real owner. The function's own WHERE clause is still what
-- restricts which column changes and to whom; this just lets the row through.
create policy "the owner updates their own conversation"
  on conversations for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());

-- Supersedes the 0005 definition: adds the broadcast-mode check, unchanged
-- otherwise (membership + not-blocked-by-anyone-in-the-thread).
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
    )
    and (
      select c.kind <> 'group' or c.members_can_post or c.created_by = p_user
      from conversations c
      where c.id = p_conversation_id
    );
$$;

/** Owner-only: switches a group between "everyone posts" and broadcast-only. */
create or replace function set_group_posting_mode(p_conversation_id uuid, p_members_can_post boolean)
returns conversations
language plpgsql
security invoker
set search_path = public
as $$
declare v_row conversations;
begin
  update conversations set members_can_post = p_members_can_post
  where id = p_conversation_id and kind = 'group' and created_by = auth.uid()
  returning * into v_row;

  if not found then
    raise exception 'only the group owner can change who may post';
  end if;

  return v_row;
end;
$$;

/** Owner-only: adds an accepted friend to a group. */
create or replace function add_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind conversation_kind;
begin
  select created_by, kind into v_owner, v_kind
  from conversations where id = p_conversation_id;

  if v_kind is distinct from 'group' then
    raise exception 'only a group conversation can have members added';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'only the group owner can add members';
  end if;
  if not are_friends(auth.uid(), p_user_id) then
    raise exception 'you can only add accepted friends to the group';
  end if;

  insert into conversation_members (conversation_id, user_id)
  values (p_conversation_id, p_user_id)
  on conflict do nothing;
end;
$$;

/**
 * Owner-only: removes a member. A member removing themself already works
 * through the plain conversation_members delete policy (0005) — this is only
 * for the owner acting on someone else, and the owner cannot remove themself
 * through it (that would orphan the group's ownership).
 */
create or replace function remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_kind conversation_kind;
begin
  select created_by, kind into v_owner, v_kind
  from conversations where id = p_conversation_id;

  if v_kind is distinct from 'group' then
    raise exception 'only a group conversation supports removing a member';
  end if;
  if v_owner is distinct from auth.uid() then
    raise exception 'only the group owner can remove a member';
  end if;
  if p_user_id = v_owner then
    raise exception 'the group owner cannot be removed';
  end if;

  delete from conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;
