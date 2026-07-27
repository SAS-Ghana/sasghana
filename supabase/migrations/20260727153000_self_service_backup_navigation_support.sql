begin;

alter table public.backup_records
  add column if not exists downloaded_at timestamptz,
  add column if not exists downloaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists operation_type text default 'backup';

alter table public.profiles
  add column if not exists preferred_dashboard text default 'Dashboard',
  add column if not exists self_service_enabled boolean not null default true;

alter table public.employees
  add column if not exists profile_photo_path text,
  add column if not exists appointment_letter_path text,
  add column if not exists appointment_letter_generated_at timestamptz;

create table if not exists public.employee_document_downloads (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_type text not null,
  format text not null,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.employee_document_downloads enable row level security;

drop policy if exists "employees read own downloads" on public.employee_document_downloads;
create policy "employees read own downloads"
on public.employee_document_downloads for select to authenticated
using (
  organisation_id = current_organisation_id()
  and is_active_user()
  and (
    requested_by = auth.uid()
    or is_system_admin()
    or has_permission('documents.verify')
  )
);

drop policy if exists "employees record own downloads" on public.employee_document_downloads;
create policy "employees record own downloads"
on public.employee_document_downloads for insert to authenticated
with check (
  organisation_id = current_organisation_id()
  and is_active_user()
  and requested_by = auth.uid()
);

grant select,insert on public.employee_document_downloads to authenticated;

create or replace function public.record_backup_download(
  p_record_id uuid,
  p_file_name text,
  p_file_size_bytes bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_active_user() or not (is_system_admin() or has_permission('backups.manage')) then
    raise exception 'Not authorised';
  end if;

  update public.backup_records
  set downloaded_at = now(),
      downloaded_by = auth.uid(),
      file_name = p_file_name,
      file_size_bytes = p_file_size_bytes,
      completed_at = coalesce(completed_at, now()),
      status = case when status is null or status = 'pending' then 'completed' else status end
  where id = p_record_id
    and organisation_id = current_organisation_id();
end;
$$;

grant execute on function public.record_backup_download(uuid,text,bigint) to authenticated;

commit;
