-- =============================================================================
-- Group management, rebuilt to match design 9a-9d — multiple admins, not a
-- single fixed owner. Supersedes the owner-only model from 0006, which was
-- built before any mockup existed for this screen.
--
-- Also: a fifth push trigger (friendship created via an invite link), now
-- that the push infrastructure (0007) exists to hang it on.
-- =============================================================================

alter table conversation_members add column is_admin boolean not null default false;

-- -----------------------------------------------------------------------------
-- Admins may update the group's own settings (posting mode). Supersedes the
-- 0006 policy, which only let the original creator through.
-- -----------------------------------------------------------------------------

drop policy if exists "the owner updates their own conversation" on conversations;

create policy "a group admin updates their conversation"
  on conversations for update to authenticated
  using (
    kind = 'group' and exists (
      select 1 from conversation_members m
      where m.conversation_id = id and m.user_id = auth.uid() and m.is_admin
    )
  )
  with check (
    kind = 'group' and exists (
      select 1 from conversation_members m
      where m.conversation_id = id and m.user_id = auth.uid() and m.is_admin
    )
  );

/** The creator is the group's first admin. */
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

  insert into conversation_members (conversation_id, user_id, is_admin)
  select v_row.id, member_id, member_id = v_me
  from unnest(array_append(p_member_ids, v_me)) as member_id
  on conflict do nothing;

  return v_row;
end;
$$;

-- Supersedes 0006: "the owner" → "any admin".
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
      select c.kind <> 'group' or c.members_can_post or coalesce(caller.is_admin, false)
      from conversations c
      left join conversation_members caller
        on caller.conversation_id = c.id and caller.user_id = p_user
      where c.id = p_conversation_id
    );
$$;

/** Any admin: switches a group between "everyone posts" and admins-only. */
create or replace function set_group_posting_mode(p_conversation_id uuid, p_members_can_post boolean)
returns conversations
language plpgsql
security invoker
set search_path = public
as $$
declare v_row conversations; v_is_admin boolean;
begin
  select is_admin into v_is_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();

  if not coalesce(v_is_admin, false) then
    raise exception 'only a group admin can change who may post';
  end if;

  update conversations set members_can_post = p_members_can_post
  where id = p_conversation_id and kind = 'group'
  returning * into v_row;

  if not found then
    raise exception 'group not found';
  end if;

  return v_row;
end;
$$;

/** Any admin: adds an accepted friend to the group as a regular member. */
create or replace function add_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind conversation_kind;
  v_is_admin boolean;
begin
  select kind into v_kind from conversations where id = p_conversation_id;
  if v_kind is distinct from 'group' then
    raise exception 'only a group conversation can have members added';
  end if;

  select is_admin into v_is_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'only a group admin can add members';
  end if;

  if not are_friends(auth.uid(), p_user_id) then
    raise exception 'you can only add accepted friends to the group';
  end if;

  insert into conversation_members (conversation_id, user_id, is_admin)
  values (p_conversation_id, p_user_id, false)
  on conflict do nothing;
end;
$$;

/**
 * Any admin: removes a regular member. An admin can't be removed this way —
 * they would need to be promoted-around first, which this app has no path
 * for — so the only way an admin leaves is leave_group_conversation() below,
 * same as anyone else.
 */
create or replace function remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind conversation_kind;
  v_caller_admin boolean;
  v_target_admin boolean;
begin
  select kind into v_kind from conversations where id = p_conversation_id;
  if v_kind is distinct from 'group' then
    raise exception 'only a group conversation supports removing a member';
  end if;

  select is_admin into v_caller_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not coalesce(v_caller_admin, false) then
    raise exception 'only a group admin can remove a member';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'use leave_group_conversation to remove yourself';
  end if;

  select is_admin into v_target_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;
  if v_target_admin then
    raise exception 'an admin cannot be removed directly';
  end if;

  delete from conversation_members
  where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;

/** Any admin: promotes a regular member to admin (design 9c/9d's "מנה מנהל אחר"). */
create or replace function promote_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_caller_admin boolean;
begin
  select is_admin into v_caller_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();
  if not coalesce(v_caller_admin, false) then
    raise exception 'only a group admin can promote a member';
  end if;

  update conversation_members set is_admin = true
  where conversation_id = p_conversation_id and user_id = p_user_id;

  if not found then
    raise exception 'that person is not a member of this group';
  end if;
end;
$$;

/**
 * Leaving is already possible directly (0005's plain delete policy on
 * conversation_members — kept as-is, see below), but the sole admin of a
 * group with other members still in it needs to promote someone first, or
 * the group is left with nobody able to manage it. This is the guided path
 * the client calls; it raises instead of leaving so the UI can show design
 * 9c/9d's warning and offer the promote step.
 *
 * ⚠ Not airtight: 0005's "users leave a conversation themselves" delete
 * policy still lets a client delete their own row directly, bypassing this
 * check. Accepted on purpose — the only person that hurts is the one doing
 * it to their own group, not a cross-user integrity issue, so it isn't worth
 * revoking a policy the rest of chat already depends on.
 */
create or replace function leave_group_conversation(p_conversation_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_am_admin boolean;
  v_other_admins int;
  v_other_members int;
begin
  select is_admin into v_am_admin
  from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();

  if not found then
    raise exception 'you are not a member of this conversation';
  end if;

  select count(*) into v_other_admins
  from conversation_members
  where conversation_id = p_conversation_id and user_id <> auth.uid() and is_admin;

  select count(*) into v_other_members
  from conversation_members
  where conversation_id = p_conversation_id and user_id <> auth.uid();

  if v_am_admin and v_other_admins = 0 and v_other_members > 0 then
    raise exception 'promote another member to admin before you leave';
  end if;

  delete from conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;

-- -----------------------------------------------------------------------------
-- Fifth push trigger: someone joined via your invite link.
--
-- This can't be a generic `after insert on friendships` trigger like the
-- other three in 0007 — a friendships row is symmetric (user_id, friend_id),
-- so a table-level trigger has no way to tell which side owns the invite
-- link and which side just redeemed it. redeem_invite() is the one place
-- that actually knows both, so it calls out directly instead.
--
-- ⚠ Fill in <PROJECT_REF> and <WEBHOOK_SECRET> here too (same values as the
-- 0007 triggers) before running this migration for real.
-- -----------------------------------------------------------------------------

create or replace function redeem_invite(p_token text)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_owner_profile profiles;
  v_inserted boolean;
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

  -- Idempotent: opening the same link twice must not error, duplicate, or
  -- notify a second time. xmax = 0 is the standard way to tell "this command
  -- actually inserted a new row" apart from "the ON CONFLICT clause updated
  -- an existing one".
  insert into friendships (user_id, friend_id, status, responded_at)
  values (least(auth.uid(), v_owner), greatest(auth.uid(), v_owner), 'accepted', now())
  on conflict (user_id, friend_id) do update set status = 'accepted', responded_at = now()
  returning (xmax = 0) into v_inserted;

  if v_inserted then
    perform net.http_post(
      url := 'https://<PROJECT_REF>.functions.supabase.co/notify-event',
      headers := '{"Content-Type":"application/json","x-webhook-secret":"<WEBHOOK_SECRET>"}'::jsonb,
      body := jsonb_build_object(
        'table', 'friendships',
        'record', jsonb_build_object('owner_id', v_owner, 'joiner_id', auth.uid())
      )
    );
  end if;

  select * into v_owner_profile from profiles where id = v_owner;
  return v_owner_profile;
end;
$$;
