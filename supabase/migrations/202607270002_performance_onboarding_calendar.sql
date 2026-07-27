-- Connected performance, onboarding, department management and calendar workflows.
alter table public.departments
  add column if not exists manager_profile_id uuid references public.profiles(id),
  add column if not exists description text,
  add column if not exists cost_centre text,
  add column if not exists status text not null default 'active';

create table if not exists public.review_cycles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  cycle_type text not null default 'quarterly',
  period_start date not null,
  period_end date not null,
  feedback_deadline date not null,
  visibility text not null default 'employee_after_release',
  status text not null default 'draft' check(status in ('draft','open','calibration','released','closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(period_end>=period_start)
);

create table if not exists public.review_assignments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  cycle_id uuid not null references public.review_cycles(id) on delete cascade,
  subject_employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_relationship text not null check(reviewer_relationship in ('self','manager','peer','direct_report','hr')),
  status text not null default 'pending' check(status in ('pending','in_progress','submitted','declined')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(cycle_id,subject_employee_id,reviewer_profile_id)
);

create table if not exists public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  assignment_id uuid not null unique references public.review_assignments(id) on delete cascade,
  subject_employee_id uuid not null references public.employees(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id),
  overall_rating numeric(2,1) not null check(overall_rating between 1 and 5),
  goals_rating numeric(2,1) check(goals_rating between 1 and 5),
  values_rating numeric(2,1) check(values_rating between 1 and 5),
  collaboration_rating numeric(2,1) check(collaboration_rating between 1 and 5),
  strengths text,
  development_areas text,
  feedback text,
  is_anonymous_to_employee boolean not null default false,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  department_id uuid references public.departments(id),
  employment_type text,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_template_items (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  template_id uuid not null references public.onboarding_templates(id) on delete cascade,
  title text not null,
  item_type text not null check(item_type in ('company_details','form','document','acceptance_letter','policy','compliance','asset','training','meeting','task')),
  policy_id uuid references public.policies(id),
  document_template_id uuid references public.document_templates(id),
  asset_category text,
  instructions text,
  assignee_type text not null default 'employee',
  due_offset_days integer not null default 0,
  requires_acknowledgement boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.onboarding_item_progress (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  onboarding_id uuid not null references public.employee_onboarding(id) on delete cascade,
  template_item_id uuid references public.onboarding_template_items(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  item_type text not null,
  status text not null default 'pending' check(status in ('pending','in_progress','submitted','approved','completed','waived')),
  due_date date,
  assigned_profile_id uuid references public.profiles(id),
  evidence_path text,
  acknowledged_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  holiday_date date not null,
  country_code text not null default 'GH',
  holiday_type text not null default 'public',
  blocks_meetings boolean not null default true,
  notification_days_before integer not null default 2,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique(organisation_id,holiday_date,name)
);

create table if not exists public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  block_type text not null default 'busy' check(block_type in ('busy','focus','leave','holiday','tentative')),
  allow_override boolean not null default false,
  source text not null default 'manual',
  source_record_id uuid,
  created_at timestamptz not null default now(),
  check(ends_at>starts_at)
);

create or replace function public.manages_employee(target_employee uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(
    select 1 from employees e
    left join profiles p on p.id=auth.uid()
    left join departments d on d.id=e.department_id
    where e.id=target_employee
      and e.organisation_id=public.current_organisation_id()
      and (e.manager_id=p.employee_id or d.manager_profile_id=auth.uid())
  )
$$;

create or replace view public.managed_team_directory as
select e.id,e.organisation_id,e.employee_number,
  trim(concat(e.first_name,' ',e.last_name)) as full_name,e.work_email,e.phone,
  e.position_title,e.branch,e.employment_type,e.employment_status,e.start_date,e.date_of_birth,
  d.name as department_name,e.department_id,e.manager_id
from public.employees e left join public.departments d on d.id=e.department_id
where e.organisation_id=public.current_organisation_id()
and (public.manages_employee(e.id) or public.has_permission('employees.view_all'));
grant select on public.managed_team_directory to authenticated;

create or replace function public.manager_update_employee_work_details(
  target_employee uuid,new_position text,new_branch text,new_employment_type text,new_phone text
) returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.manages_employee(target_employee) or public.has_permission('employees.update')) then
    raise exception 'You do not manage this employee';
  end if;
  update public.employees set position_title=new_position,branch=new_branch,
    employment_type=new_employment_type,phone=new_phone,updated_at=now()
  where id=target_employee and organisation_id=public.current_organisation_id();
end $$;
grant execute on function public.manager_update_employee_work_details(uuid,text,text,text,text) to authenticated;

alter table public.review_cycles enable row level security;
alter table public.review_assignments enable row level security;
alter table public.review_feedback enable row level security;
alter table public.onboarding_templates enable row level security;
alter table public.onboarding_template_items enable row level security;
alter table public.onboarding_item_progress enable row level security;
alter table public.company_holidays enable row level security;
alter table public.availability_blocks enable row level security;

create policy "members view released review cycles" on public.review_cycles for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "hr manages review cycles" on public.review_cycles for all
using(public.has_permission('performance.manage')) with check(public.has_permission('performance.manage'));
create policy "reviewers view own assignments" on public.review_assignments for select
using(reviewer_profile_id=auth.uid() or public.manages_employee(subject_employee_id) or public.has_permission('performance.manage'));
create policy "hr manages review assignments" on public.review_assignments for all
using(public.has_permission('performance.manage')) with check(public.has_permission('performance.manage'));
create policy "reviewers update own assignments" on public.review_assignments for update
using(reviewer_profile_id=auth.uid()) with check(reviewer_profile_id=auth.uid());
create policy "reviewers submit own feedback" on public.review_feedback for insert
with check(reviewer_profile_id=auth.uid() and exists(select 1 from public.review_assignments a where a.id=assignment_id and a.reviewer_profile_id=auth.uid()));
create policy "reviewers edit draft feedback" on public.review_feedback for update
using(reviewer_profile_id=auth.uid() and released_at is null) with check(reviewer_profile_id=auth.uid());
create policy "employees view released feedback" on public.review_feedback for select
using(
  reviewer_profile_id=auth.uid()
  or public.has_permission('performance.manage')
  or public.manages_employee(subject_employee_id)
  or (released_at is not null and subject_employee_id=(select employee_id from public.profiles where id=auth.uid()))
);

create policy "members view onboarding templates" on public.onboarding_templates for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "hr manages onboarding templates" on public.onboarding_templates for all
using(public.has_permission('onboarding.manage')) with check(public.has_permission('onboarding.manage'));
create policy "members view onboarding template items" on public.onboarding_template_items for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "hr manages onboarding template items" on public.onboarding_template_items for all
using(public.has_permission('onboarding.manage')) with check(public.has_permission('onboarding.manage'));
create policy "employee and managers view onboarding progress" on public.onboarding_item_progress for select
using(employee_id=(select employee_id from public.profiles where id=auth.uid()) or public.manages_employee(employee_id) or public.has_permission('onboarding.manage'));
create policy "authorised users manage onboarding progress" on public.onboarding_item_progress for all
using(public.manages_employee(employee_id) or public.has_permission('onboarding.manage'))
with check(public.manages_employee(employee_id) or public.has_permission('onboarding.manage'));

create policy "managers view team attendance" on public.attendance_records for select
using(public.manages_employee(employee_id));
create policy "managers view team leave" on public.leave_requests for select
using(public.manages_employee(employee_id));
create policy "managers view team reviews" on public.performance_reviews for select
using(public.manages_employee(employee_id));
create policy "managers view team assets" on public.assets for select
using(assigned_employee_id is not null and public.manages_employee(assigned_employee_id));

create policy "members view holidays" on public.company_holidays for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "hr manages holidays" on public.company_holidays for all
using(public.has_permission('calendar.manage')) with check(public.has_permission('calendar.manage'));
create policy "users manage own availability" on public.availability_blocks for all
using(profile_id=auth.uid() or public.has_permission('calendar.manage'))
with check(profile_id=auth.uid() or public.has_permission('calendar.manage'));
create policy "members see availability" on public.availability_blocks for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());

insert into public.permissions(key,description) values
('performance.rate','Submit assigned performance feedback'),
('performance.view_self','View released personal ratings and feedback'),
('performance.view_team','View ratings and statistics for managed employees'),
('departments.manage','Create departments and assign department managers'),
('calendar.manage','Manage holidays and organisation availability'),
('calendar.view','View holidays, availability and meeting conflicts'),
('onboarding.templates','Create reusable onboarding templates and compliance checklists')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p where
 (r.name='SAS System Administrator')
 or (r.name in ('Human Resources Administrator','HR Officer') and p.key in ('performance.rate','performance.view_self','performance.view_team','departments.manage','calendar.manage','calendar.view','onboarding.templates'))
 or (r.name in ('Department Head','Line Manager') and p.key in ('performance.rate','performance.view_self','performance.view_team','calendar.view'))
 or (r.name='Employee' and p.key in ('performance.rate','performance.view_self','calendar.view'))
on conflict do nothing;

insert into public.company_holidays(organisation_id,name,holiday_date,source)
select o.id,h.name,h.holiday_date,'ghana_seed' from public.organisations o cross join (values
('New Year''s Day','2026-01-01'::date),('Constitution Day','2026-01-07'::date),
('Independence Day','2026-03-06'::date),('May Day','2026-05-01'::date),
('Africa Day','2026-05-25'::date),('Republic Day','2026-07-01'::date),
('Founders'' Day','2026-08-04'::date),('Kwame Nkrumah Memorial Day','2026-09-21'::date),
('Farmers'' Day','2026-12-04'::date),('Christmas Day','2026-12-25'::date),
('Boxing Day','2026-12-26'::date)
) h(name,holiday_date)
where o.name='SAS Finance Group Ghana'
on conflict do nothing;

create or replace function public.generate_people_calendar_notifications()
returns integer language plpgsql security definer set search_path=public as $$
declare generated integer:=0; inserted_count integer:=0;
begin
  insert into notifications(organisation_id,recipient_id,title,body,category)
  select h.organisation_id,p.id,'Upcoming holiday: '||h.name,
    h.name||' is on '||to_char(h.holiday_date,'FMDay, DD Mon YYYY')||
    case when h.blocks_meetings then '. Meeting availability is blocked unless overridden.' else '.' end,
    'holiday'
  from company_holidays h join profiles p on p.organisation_id=h.organisation_id
  where p.status in ('active','password_change_required')
    and h.holiday_date-current_date between 0 and h.notification_days_before
    and not exists(select 1 from notifications n where n.recipient_id=p.id and n.title='Upcoming holiday: '||h.name and n.created_at::date=current_date);
  get diagnostics generated=row_count;

  insert into notifications(organisation_id,recipient_id,title,body,category)
  select e.organisation_id,d.manager_profile_id,'Team birthday reminder',
    trim(concat(e.first_name,' ',e.last_name))||' has a birthday on '||to_char(e.date_of_birth,'FMMonth DD')||'.',
    'birthday'
  from employees e join departments d on d.id=e.department_id
  where d.manager_profile_id is not null and e.date_of_birth is not null
    and to_char(e.date_of_birth,'MM-DD') between to_char(current_date,'MM-DD') and to_char(current_date+interval '14 days','MM-DD')
    and not exists(select 1 from notifications n where n.recipient_id=d.manager_profile_id and n.title='Team birthday reminder' and n.body like trim(concat(e.first_name,' ',e.last_name))||'%' and n.created_at::date=current_date);
  get diagnostics inserted_count=row_count;
  generated:=generated+inserted_count;
  return generated;
end $$;

do $$
begin
  create extension if not exists pg_cron with schema extensions;
  if not exists(select 1 from cron.job where jobname='sas-people-calendar-notifications') then
    perform cron.schedule('sas-people-calendar-notifications','15 6 * * *','select public.generate_people_calendar_notifications()');
  end if;
exception when others then
  raise notice 'Calendar notification scheduler must be enabled manually: %',sqlerrm;
end $$;
