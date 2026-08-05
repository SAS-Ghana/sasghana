-- Two tables the app has assumed exist since earlier sessions but were never actually created in any
-- migration: public.transfer_requests (employee self-service "Request transfer" -- confirmed missing
-- via full-repo grep, explains "transfer requests are not working") and public.asset_requests
-- (employee self-service "Request an asset" -- found missing while fixing the first one; same root
-- cause, same fix pattern). Modeled on the existing public.employee_change_requests table/RLS shape
-- (supabase/migrations/202607270001_self_service_experience.sql) for consistency.

create table if not exists public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_department text,
  requested_branch text,
  reason text,
  status text not null default 'pending' check (status in ('pending','manager_approved','returned','rejected','completed','cancelled')),
  manager_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  employee_id uuid not null references public.employees(id) on delete cascade,
  asset_type text,
  category text,
  reason text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','fulfilled','cancelled')),
  manager_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transfer_requests enable row level security;
alter table public.asset_requests enable row level security;

create index if not exists transfer_requests_org_status_idx on public.transfer_requests(organisation_id, status);
create index if not exists asset_requests_org_status_idx on public.asset_requests(organisation_id, status);

-- Employees read/insert their own; broad view/update follows the same permission-based pattern
-- already used for hr_requests (employees.view_all) and change requests (employees.update).
create policy "employees manage own transfer requests" on public.transfer_requests for select
using (employee_id = (select employee_id from public.profiles where id = auth.uid()) or public.has_permission('employees.view_all'));
create policy "employees submit own transfer requests" on public.transfer_requests for insert
with check (employee_id = (select employee_id from public.profiles where id = auth.uid()) and organisation_id = public.current_organisation_id());
create policy "people team review transfer requests" on public.transfer_requests for update
using (public.has_permission('employees.update')) with check (public.has_permission('employees.update'));

create policy "employees manage own asset requests" on public.asset_requests for select
using (employee_id = (select employee_id from public.profiles where id = auth.uid()) or public.has_permission('employees.view_all') or public.has_permission('assets.manage'));
create policy "employees submit own asset requests" on public.asset_requests for insert
with check (employee_id = (select employee_id from public.profiles where id = auth.uid()) and organisation_id = public.current_organisation_id());
create policy "people team review asset requests" on public.asset_requests for update
using (public.has_permission('employees.update') or public.has_permission('assets.manage'))
with check (public.has_permission('employees.update') or public.has_permission('assets.manage'));

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='transfer_requests') then
    alter publication supabase_realtime add table public.transfer_requests;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='asset_requests') then
    alter publication supabase_realtime add table public.asset_requests;
  end if;
end $$;
