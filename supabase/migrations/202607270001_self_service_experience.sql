-- SAS People employee self-service, attendance, directory and controlled profile changes.
alter table public.attendance_records add column if not exists source text not null default 'manual';

create table if not exists public.internal_job_applications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  job_opening_id uuid not null references public.job_openings(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status text not null default 'submitted' check(status in ('submitted','reviewing','shortlisted','interview','offered','accepted','declined','withdrawn')),
  cover_note text,
  reviewed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_opening_id,employee_id)
);

create table if not exists public.employee_change_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  field_name text not null,
  old_value text,
  new_value text not null,
  reason text,
  status text not null default 'pending' check(status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.microsoft_connections (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  microsoft_user_id text,
  work_email text,
  scopes text[] not null default array['openid','profile','email','offline_access','Calendars.ReadWrite','OnlineMeetings.ReadWrite'],
  status text not null default 'disconnected',
  connected_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id)
);

-- The security-definer view exposes only safe directory fields and only the caller's organisation.
create or replace view public.employee_directory as
select e.id,e.organisation_id,
  trim(concat(e.first_name,' ',e.last_name)) as full_name,
  e.position_title,d.name as department_name,e.branch,
  extract(year from e.start_date)::integer as year_joined,
  e.employment_status
from public.employees e
left join public.departments d on d.id=e.department_id
where e.organisation_id=public.current_organisation_id()
and public.is_active_user()
and e.employment_status in ('active','probation','leave');
grant select on public.employee_directory to authenticated;

alter table public.internal_job_applications enable row level security;
alter table public.employee_change_requests enable row level security;
alter table public.microsoft_connections enable row level security;

create policy "employees view own employee profile" on public.employees for select
using(id=(select employee_id from public.profiles where id=auth.uid()));
create policy "employees track own attendance" on public.attendance_records for select
using(employee_id=(select employee_id from public.profiles where id=auth.uid()));
create policy "employees clock themselves in" on public.attendance_records for insert
with check(employee_id=(select employee_id from public.profiles where id=auth.uid()) and organisation_id=public.current_organisation_id());
create policy "employees clock themselves out" on public.attendance_records for update
using(employee_id=(select employee_id from public.profiles where id=auth.uid()))
with check(employee_id=(select employee_id from public.profiles where id=auth.uid()));

create policy "employees manage own applications" on public.internal_job_applications for all
using(employee_id=(select employee_id from public.profiles where id=auth.uid()))
with check(employee_id=(select employee_id from public.profiles where id=auth.uid()) and organisation_id=public.current_organisation_id());
create policy "people team manage applications" on public.internal_job_applications for all
using(public.has_permission('hiring.manage')) with check(public.has_permission('hiring.manage'));

create policy "employees manage own change requests" on public.employee_change_requests for select
using(requested_by=auth.uid() or public.has_permission('employees.update'));
create policy "employees request own changes" on public.employee_change_requests for insert
with check(requested_by=auth.uid() and employee_id=(select employee_id from public.profiles where id=auth.uid()));
create policy "people team review changes" on public.employee_change_requests for update
using(public.has_permission('employees.update')) with check(public.has_permission('employees.update'));

create policy "users manage own microsoft connection" on public.microsoft_connections for all
using(profile_id=auth.uid()) with check(profile_id=auth.uid() and organisation_id=public.current_organisation_id());
create policy "admins view microsoft connection status" on public.microsoft_connections for select
using(public.has_permission('settings.manage'));

create or replace function public.audit_employee_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(new.organisation_id,auth.uid(),'employee_updated','employees',new.id,'success',
    jsonb_build_object('changed_fields',
      (select coalesce(jsonb_agg(key),'[]'::jsonb) from jsonb_each(to_jsonb(new)) n
       where n.value is distinct from (to_jsonb(old)->n.key))));
  return new;
end $$;
drop trigger if exists audit_employee_changes_trigger on public.employees;
create trigger audit_employee_changes_trigger after update on public.employees
for each row execute function public.audit_employee_changes();

insert into public.permissions(key,description) values
('directory.view','View the non-sensitive organisation directory'),
('attendance.clock_self','Clock in and out and view own attendance'),
('profile.request_change','Request approval for changes to own profile'),
('jobs.apply_internal','Apply for open positions as an employee'),
('integrations.microsoft','Connect personal Microsoft 365 work account')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name in ('Employee','Line Manager','Department Head','HR Officer','Human Resources Administrator','SAS System Administrator')
and p.key in ('directory.view','attendance.clock_self','profile.request_change','jobs.apply_internal','integrations.microsoft')
on conflict do nothing;
