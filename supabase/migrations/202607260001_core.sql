create extension if not exists pgcrypto;

create type public.account_status as enum
  ('invited','active','password_change_required','locked','suspended','disabled','employment_ended','archived');

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  organisation_id uuid not null references public.organisations(id),
  status public.account_status not null default 'invited',
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  profile_id uuid unique references public.profiles(id),
  department_id uuid references public.departments(id),
  employee_number text not null,
  first_name text not null,
  last_name text not null,
  work_email text not null,
  employment_status text not null default 'active',
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organisation_id, employee_number),
  unique (organisation_id, work_email)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  unique (organisation_id, name)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null
);

create table public.user_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  primary key (profile_id, role_id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  actor_id uuid references public.profiles(id),
  action text not null,
  resource text not null,
  resource_id uuid,
  outcome text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.organisations enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.employees enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

create function public.is_active_user() returns boolean language sql stable security definer
set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and status in ('active','password_change_required'))
$$;

create policy "active users view own profile" on public.profiles for select
using (id = auth.uid() and public.is_active_user());
create policy "active users view own employee record" on public.employees for select
using (profile_id = auth.uid() and public.is_active_user());
