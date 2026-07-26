alter table public.profiles
  add column if not exists username text,
  add column if not exists employee_id uuid,
  add column if not exists job_title text,
  add column if not exists account_type text not null default 'employee',
  add column if not exists force_password_change boolean not null default false,
  add column if not exists last_login_at timestamptz,
  add column if not exists invitation_status text not null default 'accepted',
  add column if not exists dashboard_access jsonb not null default '[]'::jsonb;

alter table public.employees
  add column if not exists middle_name text,
  add column if not exists preferred_name text,
  add column if not exists personal_email text,
  add column if not exists date_of_birth date,
  add column if not exists gender text,
  add column if not exists nationality text,
  add column if not exists marital_status text,
  add column if not exists residential_address text,
  add column if not exists digital_address text,
  add column if not exists probation_end_date date,
  add column if not exists contract_end_date date,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text,
  add column if not exists emergency_contact_relationship text,
  add column if not exists skills text,
  add column if not exists qualifications text,
  add column if not exists ghana_card_number text,
  add column if not exists ssnit_number text,
  add column if not exists bank_name text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_number text,
  add column if not exists internal_notes text;

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  location text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table if not exists public.user_permission_overrides (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (profile_id, permission_id)
);

create table if not exists public.employee_details (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null unique references public.employees(id) on delete cascade,
  preferred_name text,
  personal_email text,
  date_of_birth date,
  gender text,
  nationality text,
  marital_status text,
  residential_address text,
  digital_address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  employment_type text,
  contract_start date,
  contract_end date,
  probation_end date,
  grade text,
  work_location text,
  manager_id uuid references public.employees(id),
  education jsonb not null default '[]'::jsonb,
  qualifications jsonb not null default '[]'::jsonb,
  certifications jsonb not null default '[]'::jsonb,
  employment_history jsonb not null default '[]'::jsonb,
  skills jsonb not null default '[]'::jsonb,
  languages jsonb not null default '[]'::jsonb,
  ghana_card_number text,
  ssnit_number text,
  tin_number text,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  description text,
  assigned_to_employee_id uuid references public.employees(id),
  assigned_by uuid references public.profiles(id),
  category text not null default 'general',
  priority text not null default 'normal',
  status text not null default 'not_started',
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id),
  pay_period text not null,
  currency text not null default 'GHS',
  basic_salary numeric(14,2) not null default 0,
  allowances numeric(14,2) not null default 0,
  bonuses numeric(14,2) not null default 0,
  overtime numeric(14,2) not null default 0,
  tax_deduction numeric(14,2) not null default 0,
  ssnit_deduction numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  net_pay numeric(14,2) generated always as
    (basic_salary + allowances + bonuses + overtime - tax_deduction - ssnit_deduction - other_deductions) stored,
  status text not null default 'draft',
  payment_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, pay_period)
);

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  category text not null,
  version text not null default '1.0',
  summary text,
  content text,
  status text not null default 'draft',
  requires_acknowledgement boolean not null default false,
  effective_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.policy_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  policy_id uuid not null references public.policies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  unique (policy_id, employee_id)
);

insert into public.permissions (key, description) values
('dashboard.admin.view','View the administrator dashboard'),
('dashboard.hr.view','View the HR dashboard'),
('dashboard.manager.view','View the manager dashboard'),
('dashboard.employee.view','View the employee dashboard'),
('employees.view_all','View all employee records'),
('employees.view_department','View department employee records'),
('employees.view_team','View direct reports'),
('employees.view_self','View own employee record'),
('employees.create','Create employee records'),
('employees.update','Update employee records'),
('employees.archive','Archive employee records'),
('employees.view_sensitive','View sensitive employee information'),
('employees.view_bank_details','View employee bank details'),
('employees.view_identification','View employee identification'),
('onboarding.manage','Manage onboarding journeys'),
('onboarding.assign','Assign onboarding work'),
('onboarding.review','Review onboarding submissions'),
('documents.upload','Upload employee documents'),
('documents.verify','Verify employee documents'),
('documents.download','Download employee documents'),
('documents.view_confidential','View confidential documents'),
('attendance.manage','Manage attendance'),
('attendance.approve','Approve attendance corrections'),
('leave.manage','Manage leave'),
('leave.approve','Approve leave requests'),
('performance.manage','Manage performance processes'),
('performance.review_team','Review team performance'),
('assets.manage','Manage assets'),
('tasks.manage','Create and assign tasks'),
('payroll.manage','Manage payroll'),
('payroll.view_self','View own payslips'),
('reports.view','View reports'),
('reports.export','Export reports'),
('announcements.manage','Manage announcements and policies'),
('users.manage','Manage user accounts'),
('roles.manage','Manage roles and permissions'),
('settings.manage','Manage organisation settings'),
('audit.view','View audit activity'),
('security.manage','Manage security controls')
on conflict (key) do update set description = excluded.description;

insert into public.roles (organisation_id, name)
select o.id, r.name from public.organisations o
cross join (values
  ('SAS System Administrator'),('Human Resources Administrator'),('HR Officer'),
  ('Department Head'),('Line Manager'),('Employee'),('Auditor'),('Compliance Officer')
) r(name)
where o.name = 'SAS Finance Group Ghana'
on conflict (organisation_id, name) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.organisations o on o.id = r.organisation_id
cross join public.permissions p
where o.name = 'SAS Finance Group Ghana'
and (
  r.name = 'SAS System Administrator'
  or (r.name = 'Human Resources Administrator' and p.key in
    ('dashboard.hr.view','employees.view_all','employees.create','employees.update','employees.view_sensitive',
     'onboarding.manage','onboarding.assign','onboarding.review','documents.upload','documents.verify','documents.download',
     'attendance.manage','attendance.approve','leave.manage','leave.approve','performance.manage','assets.manage',
     'tasks.manage','payroll.manage','reports.view','reports.export','announcements.manage','users.manage','audit.view'))
  or (r.name = 'HR Officer' and p.key in
    ('dashboard.hr.view','employees.view_all','employees.update','onboarding.manage','onboarding.review',
     'documents.upload','documents.verify','attendance.manage','leave.manage','tasks.manage','reports.view'))
  or (r.name = 'Department Head' and p.key in
    ('dashboard.manager.view','employees.view_department','employees.view_team','leave.approve',
     'performance.review_team','reports.view','tasks.manage'))
  or (r.name = 'Line Manager' and p.key in
    ('dashboard.manager.view','employees.view_team','leave.approve','performance.review_team','tasks.manage'))
  or (r.name = 'Employee' and p.key in
    ('dashboard.employee.view','employees.view_self','documents.upload','documents.download','payroll.view_self'))
  or (r.name in ('Auditor','Compliance Officer') and p.key in
    ('reports.view','audit.view','documents.download'))
)
on conflict do nothing;

create or replace function public.current_permissions()
returns table(permission_key text)
language sql stable security definer set search_path = public as $$
  with assigned as (
    select p.key, true as granted
    from user_roles ur join role_permissions rp on rp.role_id = ur.role_id
    join permissions p on p.id = rp.permission_id
    where ur.profile_id = auth.uid()
    union all
    select p.key, upo.granted
    from user_permission_overrides upo join permissions p on p.id = upo.permission_id
    where upo.profile_id = auth.uid()
  )
  select key from assigned group by key having bool_or(granted)
$$;

create or replace function public.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_system_admin() or exists(
    select 1 from public.current_permissions() where permission_key = required_permission
  )
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'branches','employee_details','tasks',
    'payroll_records','policies','policy_acknowledgements'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "organisation members read %1$s" on public.%1$I for select using (organisation_id = public.current_organisation_id() and public.is_active_user())',
      table_name
    );
    execute format(
      'create policy "administrators manage %1$s" on public.%1$I for all using (organisation_id = public.current_organisation_id() and public.is_system_admin()) with check (organisation_id = public.current_organisation_id() and public.is_system_admin())',
      table_name
    );
  end loop;
end $$;

alter table public.user_permission_overrides enable row level security;
create policy "administrators manage user permission overrides" on public.user_permission_overrides
for all using (public.is_system_admin()) with check (public.is_system_admin());

create policy "users view permissions" on public.permissions for select
using (public.is_active_user());
create policy "users view roles" on public.roles for select
using (organisation_id = public.current_organisation_id() and public.is_active_user());
create policy "users view own roles" on public.user_roles for select
using (profile_id = auth.uid() and public.is_active_user());
create policy "users view own permission overrides" on public.user_permission_overrides for select
using (profile_id = auth.uid() and public.is_active_user());

drop policy if exists "organisation members read payroll_records" on public.payroll_records;
create policy "authorised payroll access" on public.payroll_records for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('payroll.manage') or
    (public.has_permission('payroll.view_self') and exists (
      select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid()
    ))
  )
);

drop policy if exists "organisation members read employee_details" on public.employee_details;
create policy "authorised employee detail access" on public.employee_details for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('employees.view_sensitive') or exists (
      select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid()
    )
  )
);

drop policy if exists "organisation members read tasks" on public.tasks;
create policy "authorised task access" on public.tasks for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('tasks.manage') or exists (
      select 1 from public.employees e where e.id = assigned_to_employee_id and e.profile_id = auth.uid()
    )
  )
);

drop policy if exists "organisation members read user_permission_overrides" on public.user_permission_overrides;

insert into public.system_settings (organisation_id, setting_key, setting_value, category, description)
select o.id, s.setting_key, s.setting_value, s.category, s.description
from public.organisations o cross join (values
  ('company_name','SAS Finance Group Ghana','company','Official organisation display name'),
  ('default_timezone','Africa/Accra','localisation','Timezone used for attendance and reporting'),
  ('date_format','dd/MM/yyyy','localisation','Organisation date display format'),
  ('work_week','Monday-Friday','attendance','Standard employee work week'),
  ('standard_workday_hours','8','attendance','Expected daily working hours'),
  ('probation_review_days','30,60,90','performance','Default probation review checkpoints'),
  ('leave_approval_flow','manager_then_hr','leave','Required leave approval sequence'),
  ('password_minimum_length','10','security','Minimum password length'),
  ('session_timeout_minutes','60','security','Inactive session timeout'),
  ('document_expiry_notice_days','30','documents','Days before document expiry notification'),
  ('employee_number_prefix','SAS','employees','Prefix for generated employee numbers'),
  ('email_sender_name','SAS People','notifications','Display name for platform emails'),
  ('payroll_currency','GHS','payroll','Default payroll currency'),
  ('payslip_visibility','after_approval','payroll','When employees may view payslips')
) s(setting_key,setting_value,category,description)
where o.name = 'SAS Finance Group Ghana'
on conflict (organisation_id, setting_key) do nothing;

insert into public.branches (organisation_id, name, location)
select id, 'Head Office', 'Accra' from public.organisations
where name = 'SAS Finance Group Ghana'
on conflict (organisation_id, name) do nothing;
