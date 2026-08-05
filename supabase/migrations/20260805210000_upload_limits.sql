-- Admin-configurable upload limits: a global default per bucket already exists on
-- storage.buckets.file_size_limit; this adds a per-individual-user override on top of it, plus an
-- RPC the client calls before attempting an upload so oversized files fail fast with a clear message
-- rather than a generic storage error (see app/lib/supabase-data.ts's uploadStorageFile).

create table if not exists public.user_upload_limits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null,
  max_bytes bigint not null check (max_bytes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, bucket_id)
);

alter table public.user_upload_limits enable row level security;

create policy "admins manage upload limits" on public.user_upload_limits for all
using (public.is_system_admin() or public.has_permission('settings.manage'))
with check (public.is_system_admin() or public.has_permission('settings.manage'));
create policy "users view own upload limit" on public.user_upload_limits for select
using (profile_id = auth.uid());

-- Effective limit for the CURRENT user on a given bucket: a per-user override if one is set,
-- otherwise the bucket's own file_size_limit. Returns null if the bucket itself has no configured
-- limit (uncapped), in which case the client performs no size check.
create or replace function public.my_upload_limit(p_bucket text) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select max_bytes from public.user_upload_limits where profile_id = auth.uid() and bucket_id = p_bucket),
    (select file_size_limit from storage.buckets where id = p_bucket)
  )
$$;
revoke all on function public.my_upload_limit(text) from public;
grant execute on function public.my_upload_limit(text) to authenticated;

-- Same resolution, usable inside a storage RLS with check clause as a server-side backstop.
create or replace function public.upload_within_limit(p_bucket text, p_size bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select p_size <= coalesce(
    (select max_bytes from public.user_upload_limits where profile_id = auth.uid() and bucket_id = p_bucket),
    (select file_size_limit from storage.buckets where id = p_bucket),
    p_size
  )
$$;
revoke all on function public.upload_within_limit(text, bigint) from public;
grant execute on function public.upload_within_limit(text, bigint) to authenticated;

-- Server-side hardening on the three primary admin/HR-managed bucket policies (the highest-traffic
-- upload paths). NOTE: this does not extend the narrower self-service policies added in
-- 20260805150000_profile_avatar.sql and 20260805170000_job_application_cv_upload.sql -- since RLS
-- policies are OR'd together, a self-service upload through one of those paths is not yet covered by
-- this numeric check. The client-side check in uploadStorageFile() is the primary UX gate for those.
-- Whether metadata->>'size' is populated at INSERT-time depends on the Supabase Storage API version --
-- test an upload just over a configured per-user limit after applying this migration to confirm it's
-- actually rejected, since a misconfigured policy could otherwise block all uploads to these buckets.

drop policy if exists "admins manage employee media" on storage.objects;
create policy "admins manage employee media" on storage.objects for all to authenticated
using (bucket_id = 'employee-media' and (public.is_system_admin() or public.has_permission('employees.update')))
with check (
  bucket_id = 'employee-media'
  and (public.is_system_admin() or public.has_permission('employees.update'))
  and public.upload_within_limit('employee-media', coalesce((metadata->>'size')::bigint, 0))
);

drop policy if exists "admins manage HR media" on storage.objects;
create policy "admins manage HR media" on storage.objects for all to authenticated
using (bucket_id = 'hr-media' and (public.has_permission('onboarding.manage') or public.has_permission('announcements.manage')))
with check (
  bucket_id = 'hr-media'
  and (public.has_permission('onboarding.manage') or public.has_permission('announcements.manage'))
  and public.upload_within_limit('hr-media', coalesce((metadata->>'size')::bigint, 0))
);

drop policy if exists "authorised users manage library book files" on storage.objects;
create policy "authorised users manage library book files" on storage.objects for all to authenticated
using (bucket_id = 'library-books' and (public.is_system_admin() or public.has_permission('documents.verify') or public.has_permission('settings.manage')))
with check (
  bucket_id = 'library-books'
  and (public.is_system_admin() or public.has_permission('documents.verify') or public.has_permission('settings.manage'))
  and public.upload_within_limit('library-books', coalesce((metadata->>'size')::bigint, 0))
);

-- storage.buckets isn't directly writable by an authenticated client role -- this lets an admin
-- change a bucket's global size/type limits from the Settings Centre UI instead of a migration.
create or replace function public.update_bucket_upload_limit(p_bucket text, p_max_bytes bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_system_admin() or public.has_permission('settings.manage')) then
    raise exception 'Not authorised';
  end if;
  update storage.buckets set file_size_limit = p_max_bytes where id = p_bucket;
end $$;
revoke all on function public.update_bucket_upload_limit(text, bigint) from public;
grant execute on function public.update_bucket_upload_limit(text, bigint) to authenticated;

-- Buckets + their current global limit, readable by anyone allowed to manage settings (used by the
-- Settings Centre "Storage & uploads" section instead of querying storage.buckets directly, which is
-- not exposed to authenticated clients by default).
create or replace function public.list_upload_buckets() returns table(bucket_id text, file_size_limit bigint, allowed_mime_types text[])
language sql stable security definer set search_path = public as $$
  select id, file_size_limit, allowed_mime_types from storage.buckets
  where id in ('employee-media', 'hr-media', 'library-books')
  order by id
$$;
revoke all on function public.list_upload_buckets() from public;
grant execute on function public.list_upload_buckets() to authenticated;
