create or replace function public.current_organisation_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organisation_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.profile_id
    where ur.profile_id = auth.uid()
      and r.name = 'SAS System Administrator'
      and p.status in ('active', 'password_change_required')
  )
$$;

alter table public.employees
  add column if not exists position_title text,
  add column if not exists manager_id uuid references public.employees(id),
  add column if not exists phone text,
  add column if not exists branch text,
  add column if not exists employment_type text default 'Full time';

create table if not exists public.employee_onboarding (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started','in_progress','needs_attention','completed','overdue')),
  progress integer not null default 0 check (progress between 0 and 100),
  assigned_to uuid references public.profiles(id),
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  document_name text not null,
  category text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected','expired')),
  file_path text,
  expiry_date date,
  confidentiality text not null default 'internal' check (confidentiality in ('internal','confidential','restricted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  attendance_date date not null default current_date,
  clock_in timestamptz,
  clock_out timestamptz,
  status text not null default 'present' check (status in ('present','late','absent','remote','travel','leave')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, attendance_date)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null,
  start_date date not null,
  end_date date not null,
  days numeric(6,2) not null default 1,
  status text not null default 'pending' check (status in ('draft','pending','approved','rejected','cancelled')),
  reason text,
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists public.performance_reviews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  review_type text not null default 'annual',
  review_period text not null,
  reviewer_id uuid references public.profiles(id),
  status text not null default 'draft' check (status in ('draft','self_assessment','manager_review','hr_review','completed')),
  rating numeric(3,2) check (rating between 0 and 5),
  due_date date,
  summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  asset_code text not null,
  category text not null,
  description text not null,
  brand text,
  model text,
  serial_number text,
  condition text not null default 'good',
  assigned_employee_id uuid references public.employees(id),
  assignment_date date,
  expected_return_date date,
  status text not null default 'available' check (status in ('available','assigned','maintenance','retired','lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, asset_code)
);

create table if not exists public.hr_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid references public.employees(id),
  request_type text not null,
  subject text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting','resolved','closed')),
  assigned_to uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  title text not null,
  body text not null,
  audience text not null default 'all',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  publish_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_reports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  report_type text not null,
  description text,
  filters jsonb not null default '{}'::jsonb,
  format text not null default 'dashboard',
  created_by uuid references public.profiles(id),
  last_generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  setting_key text not null,
  setting_value text,
  category text not null default 'general',
  description text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (organisation_id, setting_key)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  event_type text not null,
  severity text not null default 'info' check (severity in ('info','warning','high','critical')),
  actor_id uuid references public.profiles(id),
  description text not null,
  outcome text not null default 'recorded',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.system_settings add column if not exists created_at timestamptz not null default now();

create index if not exists employees_org_idx on public.employees(organisation_id);
create index if not exists onboarding_org_idx on public.employee_onboarding(organisation_id);
create index if not exists documents_org_idx on public.employee_documents(organisation_id);
create index if not exists attendance_org_date_idx on public.attendance_records(organisation_id, attendance_date);
create index if not exists leave_org_status_idx on public.leave_requests(organisation_id, status);
create index if not exists reviews_org_status_idx on public.performance_reviews(organisation_id, status);
create index if not exists assets_org_status_idx on public.assets(organisation_id, status);
create index if not exists requests_org_status_idx on public.hr_requests(organisation_id, status);
create index if not exists announcements_org_idx on public.announcements(organisation_id);
create index if not exists audit_org_created_idx on public.audit_logs(organisation_id, created_at desc);
create index if not exists security_org_created_idx on public.security_events(organisation_id, created_at desc);

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'employee_onboarding','employee_documents','attendance_records','leave_requests',
    'performance_reviews','assets','hr_requests','announcements','saved_reports',
    'system_settings','security_events','notifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    begin
      execute format(
        'create policy "organisation members read %1$s" on public.%1$I for select using (organisation_id = public.current_organisation_id() and public.is_active_user())',
        table_name
      );
    exception when duplicate_object then null;
    end;
    begin
      execute format(
        'create policy "system administrators manage %1$s" on public.%1$I for all using (organisation_id = public.current_organisation_id() and public.is_system_admin()) with check (organisation_id = public.current_organisation_id() and public.is_system_admin())',
        table_name
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

do $$
declare table_name text;
begin
  foreach table_name in array array['organisations','departments','employees','roles','permissions','user_roles','role_permissions','audit_logs'] loop
    begin
      execute format(
        'create policy "system administrators manage %1$s" on public.%1$I for all using (public.is_system_admin()) with check (public.is_system_admin())',
        table_name
      );
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

insert into public.departments (organisation_id, name)
select o.id, d.name
from public.organisations o
cross join (values ('Investments'),('Operations'),('Finance'),('Technology'),('People'),('Risk & Compliance')) as d(name)
where o.name = 'SAS Finance Group Ghana'
on conflict (organisation_id, name) do nothing;
