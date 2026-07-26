alter table public.employees
  add column if not exists passport_photo_path text,
  add column if not exists biography text,
  add column if not exists linkedin_url text;

alter table public.payroll_records
  add column if not exists taxable_income numeric(14,2) not null default 0,
  add column if not exists paye_tax numeric(14,2) not null default 0,
  add column if not exists employee_ssnit numeric(14,2) not null default 0,
  add column if not exists employer_ssnit numeric(14,2) not null default 0,
  add column if not exists tier_one numeric(14,2) not null default 0,
  add column if not exists tier_two numeric(14,2) not null default 0,
  add column if not exists tier_three numeric(14,2) not null default 0,
  add column if not exists total_rewards numeric(14,2) not null default 0;

alter table public.payroll_records drop column if exists net_pay;
alter table public.payroll_records add column net_pay numeric(14,2) not null default 0;

create or replace function public.ghana_monthly_paye(chargeable numeric)
returns numeric language plpgsql immutable as $$
declare remaining numeric := greatest(chargeable,0); result numeric := 0; slice numeric;
begin
  slice := least(remaining,490); remaining := remaining-slice;
  slice := least(remaining,110); result := result+(slice*0.05); remaining := remaining-slice;
  slice := least(remaining,130); result := result+(slice*0.10); remaining := remaining-slice;
  slice := least(remaining,3166.67); result := result+(slice*0.175); remaining := remaining-slice;
  slice := least(remaining,16000); result := result+(slice*0.25); remaining := remaining-slice;
  slice := least(remaining,30520); result := result+(slice*0.30); remaining := remaining-slice;
  if remaining > 0 then result := result+(remaining*0.35); end if;
  return round(result,2);
end $$;

create or replace function public.calculate_ghana_payroll()
returns trigger language plpgsql as $$
declare gross numeric;
begin
  gross := coalesce(new.basic_salary,0)+coalesce(new.allowances,0)+coalesce(new.bonuses,0)+coalesce(new.overtime,0);
  new.employee_ssnit := round(coalesce(new.basic_salary,0)*0.055,2);
  new.employer_ssnit := round(coalesce(new.basic_salary,0)*0.13,2);
  new.tier_one := round(coalesce(new.basic_salary,0)*0.135,2);
  new.tier_two := round(coalesce(new.basic_salary,0)*0.05,2);
  new.ssnit_deduction := new.employee_ssnit;
  new.taxable_income := greatest(gross-new.employee_ssnit-coalesce(new.tier_three,0),0);
  new.paye_tax := public.ghana_monthly_paye(new.taxable_income);
  new.tax_deduction := new.paye_tax;
  new.net_pay := round(gross-new.employee_ssnit-new.paye_tax-coalesce(new.tier_three,0)-coalesce(new.other_deductions,0),2);
  new.total_rewards := round(gross+new.employer_ssnit,2);
  return new;
end $$;

drop trigger if exists calculate_ghana_payroll_trigger on public.payroll_records;
create trigger calculate_ghana_payroll_trigger before insert or update on public.payroll_records
for each row execute function public.calculate_ghana_payroll();

create table if not exists public.job_openings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  department_id uuid references public.departments(id),
  location text,
  employment_type text,
  description text,
  requirements text,
  hiring_manager_id uuid references public.profiles(id),
  openings integer not null default 1,
  status text not null default 'draft',
  closing_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  job_opening_id uuid references public.job_openings(id),
  full_name text not null,
  email text not null,
  phone text,
  photo_path text,
  resume_path text,
  stage text not null default 'applied',
  rating numeric(2,1),
  interview_date timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.onboarding_media (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  description text,
  media_type text not null,
  media_path text,
  external_url text,
  audience text not null default 'all',
  sort_order integer not null default 0,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.benefit_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  category text not null,
  provider text,
  description text,
  employer_contribution numeric(14,2) not null default 0,
  employee_contribution numeric(14,2) not null default 0,
  eligibility text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.benefit_enrolments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  benefit_plan_id uuid not null references public.benefit_plans(id),
  employee_id uuid not null references public.employees(id),
  coverage_level text,
  status text not null default 'pending',
  effective_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(benefit_plan_id,employee_id)
);

create table if not exists public.compensation_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id),
  effective_date date not null,
  pay_grade text,
  pay_frequency text not null default 'monthly',
  base_salary numeric(14,2) not null,
  variable_pay numeric(14,2) not null default 0,
  equity_value numeric(14,2) not null default 0,
  reason text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  author_id uuid references public.profiles(id),
  title text not null,
  body text not null,
  media_type text,
  media_path text,
  audience text not null default 'all',
  status text not null default 'published',
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_channels (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text,
  channel_type text not null default 'direct',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(channel_id,profile_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  channel_id uuid not null references public.chat_channels(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  message text,
  media_type text,
  media_path text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '30 days'),
  deleted_at timestamptz
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  description text,
  organiser_id uuid references public.profiles(id),
  meeting_provider text not null default 'Microsoft Teams',
  meeting_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at>starts_at)
);

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'pending',
  responded_at timestamptz,
  primary key(meeting_id,profile_id)
);

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  in_app boolean not null default true,
  email boolean not null default true,
  sound boolean not null default true,
  desktop boolean not null default false,
  leave_updates boolean not null default true,
  payroll_updates boolean not null default true,
  task_updates boolean not null default true,
  chat_updates boolean not null default true,
  meeting_updates boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  backup_type text not null default 'manual',
  status text not null default 'requested',
  storage_path text,
  requested_by uuid references public.profiles(id),
  completed_at timestamptz,
  restore_tested_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.purge_expired_chat_messages()
returns integer language plpgsql security definer set search_path=public as $$
declare removed integer;
begin
  delete from public.chat_messages where expires_at<now() or (deleted_at is not null and deleted_at<now()-interval '24 hours');
  get diagnostics removed=row_count;
  return removed;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
('employee-media','employee-media',false,5242880,array['image/jpeg','image/png','image/webp']),
('hr-media','hr-media',false,52428800,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','application/pdf'])
on conflict(id) do nothing;

create policy "authenticated employee media read" on storage.objects for select to authenticated
using(bucket_id='employee-media' and public.is_active_user());
create policy "admins manage employee media" on storage.objects for all to authenticated
using(bucket_id='employee-media' and public.has_permission('employees.update'))
with check(bucket_id='employee-media' and public.has_permission('employees.update'));
create policy "authenticated HR media read" on storage.objects for select to authenticated
using(bucket_id='hr-media' and public.is_active_user());
create policy "admins manage HR media" on storage.objects for all to authenticated
using(bucket_id='hr-media' and (public.has_permission('onboarding.manage') or public.has_permission('announcements.manage')))
with check(bucket_id='hr-media' and (public.has_permission('onboarding.manage') or public.has_permission('announcements.manage')));

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'job_openings','candidates','onboarding_media','benefit_plans','benefit_enrolments',
    'compensation_records','community_posts','chat_channels','chat_messages','meetings',
    'notification_preferences','backup_records'
  ] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('create policy "organisation access %1$s" on public.%1$I for select using (organisation_id=public.current_organisation_id() and public.is_active_user())',table_name);
    execute format('create policy "administrator manage %1$s" on public.%1$I for all using (organisation_id=public.current_organisation_id() and public.is_system_admin()) with check (organisation_id=public.current_organisation_id() and public.is_system_admin())',table_name);
  end loop;
end $$;

alter table public.chat_members enable row level security;
alter table public.meeting_attendees enable row level security;
create policy "members see chat memberships" on public.chat_members for select using (
  profile_id=auth.uid() or public.is_system_admin()
);
create policy "admins manage chat memberships" on public.chat_members for all using(public.is_system_admin()) with check(public.is_system_admin());
create policy "attendees see meeting attendance" on public.meeting_attendees for select using (
  profile_id=auth.uid() or public.is_system_admin()
);
create policy "admins manage meeting attendance" on public.meeting_attendees for all using(public.is_system_admin()) with check(public.is_system_admin());
create policy "active users send chat messages" on public.chat_messages for insert
with check(organisation_id=public.current_organisation_id() and sender_id=auth.uid() and public.is_active_user());
create policy "senders delete own chat messages" on public.chat_messages for update
using(sender_id=auth.uid() and public.is_active_user())
with check(sender_id=auth.uid() and public.is_active_user());

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.leave_requests;
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.meetings;

insert into public.permissions(key,description) values
('hiring.manage','Manage job openings and candidates'),
('benefits.manage','Manage benefit plans and enrolments'),
('compensation.manage','Manage compensation records'),
('community.manage','Publish employee community posts'),
('meetings.manage','Create and manage meetings'),
('backups.manage','Request and monitor backups')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in
('hiring.manage','benefits.manage','compensation.manage','community.manage','meetings.manage','backups.manage')
where r.name='SAS System Administrator'
on conflict do nothing;

insert into public.system_settings(organisation_id,setting_key,setting_value,category,description)
select o.id,s.setting_key,s.setting_value,s.category,s.description from public.organisations o cross join(values
('paye_rate_source','GRA 2024 monthly bands','payroll','Versioned statutory tax table; administrators must review after GRA changes'),
('employee_ssnit_rate','5.5','payroll','Employee SSNIT percentage'),
('employer_ssnit_rate','13','payroll','Employer social security percentage'),
('tier_one_rate','13.5','payroll','Mandatory Tier 1 percentage'),
('tier_two_rate','5','payroll','Mandatory Tier 2 percentage'),
('tier_three_rate','0','payroll','Default voluntary Tier 3 percentage'),
('chat_retention_days','30','communications','Messages expire automatically after this period'),
('backup_reminder_days','30','security','Prompt administrators when no recent backup is recorded'),
('meeting_provider','Microsoft Teams','meetings','Default online meeting provider'),
('notification_sound','true','notifications','Play device sound for new authorised notifications')
)s(setting_key,setting_value,category,description)
where o.name='SAS Finance Group Ghana'
on conflict(organisation_id,setting_key) do nothing;

insert into public.chat_channels(organisation_id,name,channel_type)
select id,'SAS People','group' from public.organisations o
where o.name='SAS Finance Group Ghana'
and not exists(select 1 from public.chat_channels c where c.organisation_id=o.id and c.name='SAS People');
