-- Lets an employee attach a CV/resume when applying internally. cover_note already existed on
-- internal_job_applications but was never collected by the UI; resume_path is new.

alter table public.internal_job_applications add column if not exists resume_path text;

-- CVs are PDFs/Word docs, not images -- the employee-media bucket only allowed image mime types.
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
where id = 'employee-media';

-- Self-service path, same convention as the profile-avatar policy (20260805150000_profile_avatar.sql):
-- an employee may manage their own CV objects under applications/{employee_id}/..., independent of
-- the broader "admins manage employee media" policy.
create policy "employees manage own application cv" on storage.objects for all to authenticated
using (
  bucket_id = 'employee-media'
  and (storage.foldername(name))[1] = 'applications'
  and (storage.foldername(name))[2] = (select employee_id::text from public.profiles where id = auth.uid())
)
with check (
  bucket_id = 'employee-media'
  and (storage.foldername(name))[1] = 'applications'
  and (storage.foldername(name))[2] = (select employee_id::text from public.profiles where id = auth.uid())
);
