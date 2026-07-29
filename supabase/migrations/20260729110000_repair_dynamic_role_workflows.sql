-- Repair role-linked dashboards and notification workflow RPCs.

create or replace function public.manages_employee(target_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.employees e
    left join public.profiles p on p.id = auth.uid()
    left join public.departments d on d.id = e.department_id
    where e.id = target_employee
      and e.organisation_id = public.current_organisation_id()
      and p.employee_id is not null
      and e.id <> p.employee_id
      and (
        e.manager_id = p.employee_id
        or d.manager_profile_id = auth.uid()
      )
  )
$$;

create or replace view public.managed_team_directory
with (security_invoker = true) as
select
  e.id,
  e.organisation_id,
  e.employee_number,
  trim(concat(e.first_name, ' ', e.last_name)) as full_name,
  e.work_email,
  e.phone,
  e.position_title,
  e.branch,
  e.employment_type,
  e.employment_status,
  e.start_date,
  e.date_of_birth,
  d.name as department_name,
  e.department_id,
  e.manager_id
from public.employees e
left join public.departments d on d.id = e.department_id
where e.organisation_id = public.current_organisation_id()
  and (
    public.manages_employee(e.id)
    or public.has_permission('employees.view_all')
  );

grant select on public.managed_team_directory to authenticated;

-- Keep profile.employee_id and employees.profile_id in sync for active accounts.
update public.employees e
set profile_id = p.id,
    updated_at = now()
from public.profiles p
where p.employee_id = e.id
  and e.profile_id is distinct from p.id;

-- The seeded manager account is Jojo, whose employee record is Charles Vandyck.
-- Link Kenneth to that manager so manager workflows have an authorised test report.
with manager_profile as (
  select p.id as profile_id, p.employee_id, p.organisation_id
  from public.profiles p
  where lower(p.username) = 'jojo'
    and p.employee_id is not null
),
employee_report as (
  select e.id, e.department_id, e.organisation_id
  from public.employees e
  join public.profiles p on p.employee_id = e.id
  where lower(p.username) = 'kenneth'
)
update public.employees report
set manager_id = manager_profile.employee_id,
    updated_at = now()
from manager_profile, employee_report
where report.id = employee_report.id
  and report.organisation_id = manager_profile.organisation_id
  and report.manager_id is distinct from manager_profile.employee_id;

with manager_profile as (
  select p.id as profile_id, p.employee_id, p.organisation_id
  from public.profiles p
  where lower(p.username) = 'jojo'
    and p.employee_id is not null
),
employee_report as (
  select e.department_id, e.organisation_id
  from public.employees e
  join public.profiles p on p.employee_id = e.id
  where lower(p.username) = 'kenneth'
    and e.department_id is not null
)
update public.employees manager_employee
set department_id = employee_report.department_id,
    updated_at = now()
from manager_profile, employee_report
where manager_employee.id = manager_profile.employee_id
  and manager_employee.organisation_id = manager_profile.organisation_id
  and manager_employee.department_id is distinct from employee_report.department_id;

with manager_profile as (
  select p.id as profile_id, p.employee_id, p.organisation_id
  from public.profiles p
  where lower(p.username) = 'jojo'
    and p.employee_id is not null
),
employee_report as (
  select e.department_id, e.organisation_id
  from public.employees e
  join public.profiles p on p.employee_id = e.id
  where lower(p.username) = 'kenneth'
    and e.department_id is not null
)
update public.departments d
set manager_profile_id = manager_profile.profile_id
from manager_profile, employee_report
where d.id = employee_report.department_id
  and d.organisation_id = manager_profile.organisation_id
  and d.manager_profile_id is distinct from manager_profile.profile_id;

create or replace function public.mark_all_my_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where recipient_id = auth.uid()
    and archived_at is null
    and is_read = false;

  get diagnostics updated_count = row_count;
  return updated_count;
end
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language sql
security invoker
set search_path = public
as $$
  select public.mark_all_my_notifications_read()
$$;

create or replace function public.set_my_notification_read(
  p_notification_id uuid,
  p_is_read boolean default true
)
returns public.notifications
language plpgsql
security invoker
set search_path = public
as $$
declare
  notification_row public.notifications;
begin
  update public.notifications
  set is_read = p_is_read,
      read_at = case when p_is_read then coalesce(read_at, now()) else null end
  where id = p_notification_id
    and recipient_id = auth.uid()
  returning * into notification_row;

  if notification_row.id is null then
    raise exception 'Notification not found';
  end if;

  return notification_row;
end
$$;

revoke all on function public.mark_all_my_notifications_read() from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.set_my_notification_read(uuid, boolean) from public;
grant execute on function public.mark_all_my_notifications_read() to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.set_my_notification_read(uuid, boolean) to authenticated;
