-- Fix employee job applications and self-service media uploads.
-- The application always sends resume_path, and profile/CV uploads use x-upsert.


alter table public.internal_job_applications
  add column if not exists resume_path text;

drop policy if exists "employees upload own employee media" on storage.objects;
create policy "employees upload own employee media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'employee-media'
  and public.is_active_user()
  and (
    (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    or
    (storage.foldername(name))[1] = 'applications'
    and (storage.foldername(name))[2] = public.current_employee_id()::text
  )
);

drop policy if exists "employees update own employee media" on storage.objects;
create policy "employees update own employee media"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'employee-media'
  and public.is_active_user()
  and (
    (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    or
    (storage.foldername(name))[1] = 'applications'
    and (storage.foldername(name))[2] = public.current_employee_id()::text
  )
)
with check (
  bucket_id = 'employee-media'
  and public.is_active_user()
  and (
    (storage.foldername(name))[1] = 'profile'
    and (storage.foldername(name))[2] = (select auth.uid())::text
    or
    (storage.foldername(name))[1] = 'applications'
    and (storage.foldername(name))[2] = public.current_employee_id()::text
  )
);
