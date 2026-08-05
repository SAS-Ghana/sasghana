-- SAS People: allow system administrators to manage employee-media storage objects
-- (passport photos) even when they don't separately hold the employees.update permission.
--
-- The original policy (202607260005_people_experience_payroll.sql) only checked
-- has_permission('employees.update'), unlike the equivalent check elsewhere in the codebase
-- (20260727143000_dynamic_master_data_settings_rls.sql:118, employee change-request review, etc.)
-- which always OR's in is_system_admin() as a bypass. This is very likely why an administrator
-- account without an explicit employees.update grant could not upload an employee photo: the
-- app's own UI treats account_type = 'administrator' as fully privileged, but this specific
-- storage policy did not.
--
-- This file is not applied automatically. Review it, then run `supabase db push` (or paste it into
-- the Supabase SQL editor) against the project yourself.

drop policy if exists "admins manage employee media" on storage.objects;
create policy "admins manage employee media" on storage.objects for all to authenticated
using(bucket_id='employee-media' and (public.is_system_admin() or public.has_permission('employees.update')))
with check(bucket_id='employee-media' and (public.is_system_admin() or public.has_permission('employees.update')));
