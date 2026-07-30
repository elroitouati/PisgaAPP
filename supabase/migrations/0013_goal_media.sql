-- =============================================================================
-- Storage for V6 (media proof).
--
-- ⚠ Beyond section 11, which lists no bucket. V6 is the verification method
-- for 12 of the 80 goals — gym sessions, volunteering, cooking, tidying — and
-- section 5 describes it as "a photo or screenshot, kept private by default,
-- shareable with friends". Without somewhere to put the file, those 12 goals
-- have no verification at all, so the bucket is the smallest thing that makes
-- the spec true rather than an addition to it.
--
-- Modelled on the avatars bucket from 0006, with one deliberate difference:
-- this one is PRIVATE. An avatar is shown to everyone by design; proof of
-- where someone was on Tuesday is not.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-media', 'goal-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Path convention: <user_id>/<user_goal_id>/<timestamp>.<ext>, so the same
-- first-segment ownership rule as avatars applies.
create policy "owners read their own goal media"
  on storage.objects for select to authenticated
  using (bucket_id = 'goal-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners upload their own goal media"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'goal-media' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners delete their own goal media"
  on storage.objects for delete to authenticated
  using (bucket_id = 'goal-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Which completion a file belongs to. Nullable because the other seven
-- verification methods produce no media.
alter table goal_completions
  add column media_path text;
