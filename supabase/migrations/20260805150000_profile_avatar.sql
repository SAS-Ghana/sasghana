-- Profile-level avatar photo: independent of the employees table, so accounts with no linked
-- employee record (e.g. Administrator today) can still show a real uploaded photo instead of
-- initials-only. Reuses the existing employee-media storage bucket under a profile/{profile_id}/
-- path prefix rather than a new bucket.

alter table public.profiles add column if not exists avatar_path text;

-- Every active user may manage (upload/replace/delete) their own avatar object, regardless of
-- whether they have employees.update or any other permission -- this is purely self-service.
create policy "profiles manage own avatar" on storage.objects for all to authenticated
using (
  bucket_id = 'employee-media'
  and (storage.foldername(name))[1] = 'profile'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'employee-media'
  and (storage.foldername(name))[1] = 'profile'
  and (storage.foldername(name))[2] = auth.uid()::text
);
