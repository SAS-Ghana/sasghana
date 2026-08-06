alter table public.profiles add column if not exists avatar_path text;

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  company_name text not null, contact_person text, email text, phone text, tin text, vat_number text,
  category text, rating numeric(3,2), preferred boolean not null default false,
  status text not null default 'active' check (status in ('active','inactive','blacklisted','archived')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.purchase_requests (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_number text not null, requested_by uuid references public.profiles(id), employee_id uuid references public.employees(id), department_id uuid references public.departments(id),
  title text not null, description text, priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  estimated_total numeric(14,2) not null default 0, currency text not null default 'GHS',
  status text not null default 'submitted' check (status in ('draft','submitted','manager_review','procurement_review','accounts_review','admin_review','approved','rejected','ordered','received','completed','cancelled')),
  manager_comment text, procurement_comment text, accounts_comment text, admin_comment text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id, request_number)
);
create table if not exists public.purchase_request_items (
  id uuid primary key default gen_random_uuid(), purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_name text not null, category text, description text, quantity numeric(12,2) not null default 1, unit_cost numeric(14,2) not null default 0,
  total_cost numeric(14,2) generated always as (quantity*unit_cost) stored
);
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  po_number text not null, purchase_request_id uuid references public.purchase_requests(id), vendor_id uuid references public.vendors(id),
  subtotal numeric(14,2) not null default 0, tax numeric(14,2) not null default 0, discount numeric(14,2) not null default 0,
  total numeric(14,2) generated always as (subtotal+tax-discount) stored, currency text not null default 'GHS',
  status text not null default 'draft' check (status in ('draft','approved','issued','partially_received','received','cancelled','archived')),
  approved_by uuid references public.profiles(id), approved_at timestamptz, created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id, po_number)
);
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  item_code text not null, item_name text not null, category text, brand text, model text, serial_number text,
  quantity numeric(12,2) not null default 1, available_quantity numeric(12,2) not null default 1,
  location text, condition text not null default 'good', status text not null default 'available' check (status in ('available','assigned','maintenance','damaged','disposed','archived')),
  purchase_order_id uuid references public.purchase_orders(id), vendor_id uuid references public.vendors(id), purchase_date date, warranty_end date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,item_code)
);
create table if not exists public.petty_cash_requests (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  request_number text not null, requested_by uuid references public.profiles(id), employee_id uuid references public.employees(id), department_id uuid references public.departments(id),
  purpose text not null, amount numeric(14,2) not null check (amount>0), currency text not null default 'GHS',
  status text not null default 'submitted' check (status in ('draft','submitted','manager_approved','accounts_review','approved','issued','reconciled','rejected','cancelled')),
  receipt_url text, reconciliation_note text, approved_by uuid references public.profiles(id), approved_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,request_number)
);
create table if not exists public.department_budgets (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
  department_id uuid references public.departments(id), fiscal_year integer not null, category text not null,
  allocated_amount numeric(14,2) not null default 0, spent_amount numeric(14,2) not null default 0, currency text not null default 'GHS',
  status text not null default 'active' check (status in ('draft','active','closed','archived')),
  created_by uuid references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,department_id,fiscal_year,category)
);

alter table public.vendors enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.inventory_items enable row level security;
alter table public.petty_cash_requests enable row level security;
alter table public.department_budgets enable row level security;

insert into public.permissions(id,key,description)
select gen_random_uuid(),x.key,x.description from (values
 ('procurement.view','View procurement workspace'),('procurement.create','Create procurement records'),('procurement.edit','Edit procurement records'),('procurement.approve','Approve procurement requests'),('procurement.manage','Manage procurement workspace'),
 ('accounts.view','View accounts workspace'),('accounts.create','Create accounting records'),('accounts.edit','Edit accounting records'),('accounts.approve','Approve finance requests'),('accounts.manage','Manage accounts workspace'),
 ('pettycash.manage','Manage petty cash'),('budget.manage','Manage budgets'),('tax.manage','Manage taxes'),('payroll.run','Run payroll'),('payroll.approve','Approve payroll'),('payroll.publish','Publish payroll')
) as x(key,description)
where not exists (select 1 from public.permissions p where p.key=x.key);

insert into public.roles(id,organisation_id,name)
select gen_random_uuid(),o.id,r.name from public.organisations o cross join (values ('Procurement Officer'),('Accountant')) r(name)
where not exists (select 1 from public.roles rr where rr.organisation_id=o.id and rr.name=r.name);

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on
 (r.name='Procurement Officer' and p.key in ('procurement.view','procurement.create','procurement.edit','procurement.approve','procurement.manage','assets.manage','reports.view','reports.export')) or
 (r.name='Accountant' and p.key in ('accounts.view','accounts.create','accounts.edit','accounts.approve','accounts.manage','pettycash.manage','budget.manage','tax.manage','payroll.run','payroll.approve','payroll.publish','payroll.manage','benefits.manage','reports.view','reports.export'))
where not exists (select 1 from public.role_permissions rp where rp.role_id=r.id and rp.permission_id=p.id);

create or replace function public.has_any_permission(keys text[])
returns boolean language sql stable security definer set search_path=public as $$
 select public.is_system_admin() or exists(select 1 from unnest(keys) k where public.has_permission(k));
$$;
grant execute on function public.has_any_permission(text[]) to authenticated;

create policy "org members view procurement requests" on public.purchase_requests for select using (organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "requesters create purchase requests" on public.purchase_requests for insert with check (organisation_id=public.current_organisation_id() and requested_by=auth.uid() and public.is_active_user());
create policy "procurement manage purchase requests" on public.purchase_requests for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.edit','procurement.approve','procurement.manage','accounts.approve','accounts.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.edit','procurement.approve','procurement.manage','accounts.approve','accounts.manage']));
create policy "purchase request items follow parent" on public.purchase_request_items for all using (exists(select 1 from public.purchase_requests pr where pr.id=purchase_request_id and pr.organisation_id=public.current_organisation_id())) with check (exists(select 1 from public.purchase_requests pr where pr.id=purchase_request_id and pr.organisation_id=public.current_organisation_id()));
create policy "procurement manage vendors" on public.vendors for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.view','procurement.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.create','procurement.edit','procurement.manage']));
create policy "procurement manage purchase orders" on public.purchase_orders for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.view','procurement.manage','accounts.view','accounts.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.create','procurement.edit','procurement.approve','procurement.manage','accounts.approve','accounts.manage']));
create policy "inventory access by role" on public.inventory_items for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.view','procurement.manage','assets.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['procurement.create','procurement.edit','procurement.manage','assets.manage']));
create policy "petty cash requester select" on public.petty_cash_requests for select using (organisation_id=public.current_organisation_id() and (requested_by=auth.uid() or public.has_any_permission(array['accounts.view','accounts.manage','pettycash.manage'])));
create policy "petty cash requester insert" on public.petty_cash_requests for insert with check (organisation_id=public.current_organisation_id() and requested_by=auth.uid());
create policy "accounts manage petty cash" on public.petty_cash_requests for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['accounts.approve','accounts.manage','pettycash.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['accounts.approve','accounts.manage','pettycash.manage']));
create policy "accounts manage budgets" on public.department_budgets for all using (organisation_id=public.current_organisation_id() and public.has_any_permission(array['accounts.view','accounts.manage','budget.manage'])) with check (organisation_id=public.current_organisation_id() and public.has_any_permission(array['accounts.create','accounts.edit','accounts.manage','budget.manage']));

select pg_notify('pgrst','reload schema');