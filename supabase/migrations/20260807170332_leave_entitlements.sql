create table if not exists public.leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  leave_type text not null default 'Annual leave',
  leave_year integer not null default extract(year from current_date)::integer check (leave_year between 2000 and 2200),
  allocated_days numeric(7,2) not null default 0 check (allocated_days >= 0),
  carry_over_days numeric(7,2) not null default 0 check (carry_over_days >= 0),
  emergency_days numeric(7,2) not null default 0 check (emergency_days >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, employee_id, leave_type, leave_year)
);

create index if not exists leave_entitlements_org_year_idx
  on public.leave_entitlements (organisation_id, leave_year, employee_id);

alter table public.leave_entitlements enable row level security;

create policy "employees view own leave entitlements"
on public.leave_entitlements for select to authenticated
using (
  organisation_id = current_organisation_id()
  and employee_id = current_employee_id()
  and is_active_user()
);

create policy "authorised staff manage leave entitlements"
on public.leave_entitlements for all to authenticated
using (
  organisation_id = current_organisation_id()
  and is_active_user()
  and (is_system_admin() or has_permission('leave.manage') or has_permission('leave.approve'))
)
with check (
  organisation_id = current_organisation_id()
  and is_active_user()
  and (is_system_admin() or has_permission('leave.manage') or has_permission('leave.approve'))
);

grant select, insert, update, delete on public.leave_entitlements to authenticated;

create or replace view public.leave_balance_summary
with (security_invoker = true)
as
select
  le.id,
  le.organisation_id,
  le.employee_id,
  e.employee_number,
  trim(concat_ws(' ', e.first_name, e.last_name)) as employee_name,
  le.leave_type,
  le.leave_year,
  le.allocated_days,
  le.carry_over_days,
  le.emergency_days,
  le.allocated_days + le.carry_over_days + le.emergency_days as total_days,
  coalesce(usage.approved_days, 0)::numeric(7,2) as used_days,
  coalesce(usage.pending_days, 0)::numeric(7,2) as pending_days,
  greatest(
    0,
    le.allocated_days + le.carry_over_days + le.emergency_days - coalesce(usage.approved_days, 0)
  )::numeric(7,2) as remaining_days,
  greatest(
    0,
    coalesce(usage.approved_days, 0) - (le.allocated_days + le.carry_over_days + le.emergency_days)
  )::numeric(7,2) as excess_days,
  le.notes,
  le.updated_at,
  le.updated_at as created_at
from public.leave_entitlements le
join public.employees e on e.id = le.employee_id
left join lateral (
  select
    coalesce(sum(lr.days) filter (where lr.status = 'approved'), 0) as approved_days,
    coalesce(sum(lr.days) filter (where lr.status = 'pending'), 0) as pending_days
  from public.leave_requests lr
  where lr.organisation_id = le.organisation_id
    and lr.employee_id = le.employee_id
    and lr.leave_type = le.leave_type
    and extract(year from lr.start_date)::integer = le.leave_year
) usage on true;

grant select on public.leave_balance_summary to authenticated;

create or replace function public.set_leave_entitlement(
  p_employee_id uuid,
  p_leave_type text,
  p_leave_year integer,
  p_allocated_days numeric,
  p_carry_over_days numeric default 0,
  p_emergency_days numeric default 0,
  p_notes text default null
) returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  if not (is_system_admin() or has_permission('leave.manage') or has_permission('leave.approve')) then
    raise exception 'You do not have permission to set leave days.';
  end if;
  if coalesce(trim(p_leave_type), '') = '' then raise exception 'Leave type is required.'; end if;
  if p_leave_year not between 2000 and 2200 then raise exception 'Enter a valid leave year.'; end if;
  if least(p_allocated_days, p_carry_over_days, p_emergency_days) < 0 then
    raise exception 'Leave days cannot be negative.';
  end if;

  insert into public.leave_entitlements (
    organisation_id, employee_id, leave_type, leave_year,
    allocated_days, carry_over_days, emergency_days, notes, created_by, updated_by
  )
  select
    e.organisation_id, e.id, trim(p_leave_type), p_leave_year,
    p_allocated_days, coalesce(p_carry_over_days, 0), coalesce(p_emergency_days, 0),
    nullif(trim(p_notes), ''), auth.uid(), auth.uid()
  from public.employees e
  where e.organisation_id = current_organisation_id()
    and e.archived_at is null
    and (p_employee_id is null or e.id = p_employee_id)
  on conflict (organisation_id, employee_id, leave_type, leave_year)
  do update set
    allocated_days = excluded.allocated_days,
    carry_over_days = excluded.carry_over_days,
    emergency_days = excluded.emergency_days,
    notes = excluded.notes,
    updated_by = auth.uid(),
    updated_at = now();

  get diagnostics v_count = row_count;
  if v_count = 0 then raise exception 'No eligible employee was found.'; end if;
  return v_count;
end;
$$;

grant execute on function public.set_leave_entitlement(uuid, text, integer, numeric, numeric, numeric, text) to authenticated;

create or replace function public.review_leave_request(
  p_request_id uuid,
  p_decision text,
  p_allow_emergency boolean default false,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_request public.leave_requests%rowtype;
  v_entitlement public.leave_entitlements%rowtype;
  v_used numeric := 0;
  v_remaining numeric := 0;
  v_deficit numeric := 0;
begin
  if not (is_system_admin() or has_permission('leave.manage') or has_permission('leave.approve') or has_permission('team.leave.approve')) then
    raise exception 'You do not have permission to review this leave request.';
  end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected.'; end if;

  select * into v_request from public.leave_requests where id = p_request_id for update;
  if not found then raise exception 'Leave request not found or not accessible.'; end if;

  if p_decision = 'approved' then
    select * into v_entitlement
    from public.leave_entitlements
    where organisation_id = v_request.organisation_id
      and employee_id = v_request.employee_id
      and leave_type = v_request.leave_type
      and leave_year = extract(year from v_request.start_date)::integer
    for update;

    if found then
      select coalesce(sum(days), 0) into v_used
      from public.leave_requests
      where organisation_id = v_request.organisation_id
        and employee_id = v_request.employee_id
        and leave_type = v_request.leave_type
        and extract(year from start_date)::integer = v_entitlement.leave_year
        and status = 'approved'
        and id <> v_request.id;
      v_remaining := greatest(0, v_entitlement.allocated_days + v_entitlement.carry_over_days + v_entitlement.emergency_days - v_used);
    end if;

    if not found or v_remaining < v_request.days then
      v_deficit := greatest(0, v_request.days - v_remaining);
      if not p_allow_emergency then
        raise exception 'Only % leave day(s) remain. Use Emergency approve to add and approve the extra % day(s).', v_remaining, v_deficit;
      end if;
      insert into public.leave_entitlements (
        organisation_id, employee_id, leave_type, leave_year,
        allocated_days, emergency_days, notes, created_by, updated_by
      ) values (
        v_request.organisation_id, v_request.employee_id, v_request.leave_type,
        extract(year from v_request.start_date)::integer, 0, v_deficit,
        coalesce(nullif(trim(p_note), ''), 'Emergency leave approved with insufficient balance.'),
        auth.uid(), auth.uid()
      )
      on conflict (organisation_id, employee_id, leave_type, leave_year)
      do update set
        emergency_days = public.leave_entitlements.emergency_days + excluded.emergency_days,
        notes = excluded.notes,
        updated_by = auth.uid(),
        updated_at = now();
    end if;
  end if;

  update public.leave_requests
  set status = p_decision,
      approved_by = auth.uid(),
      hr_comment = coalesce(nullif(trim(p_note), ''), hr_comment),
      workflow_stage = case when p_decision = 'approved' then 'approved' else 'rejected' end,
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('status', p_decision, 'emergency_days_added', v_deficit);
end;
$$;

grant execute on function public.review_leave_request(uuid, text, boolean, text) to authenticated;

create or replace function public.calculate_leave_request_days()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.days := (
    select count(*)::numeric
    from generate_series(new.start_date, new.end_date, interval '1 day') day
    where extract(isodow from day) between 1 and 5
  );
  if new.days < 1 then raise exception 'Leave must include at least one working day.'; end if;
  return new;
end;
$$;

drop trigger if exists calculate_leave_request_days_trigger on public.leave_requests;
create trigger calculate_leave_request_days_trigger
before insert or update of start_date, end_date on public.leave_requests
for each row execute function public.calculate_leave_request_days();

do $$ begin
  alter publication supabase_realtime add table public.leave_entitlements;
exception when duplicate_object then null;
end $$;
