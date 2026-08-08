-- Surface assigned shifts to employees, let them acknowledge/complete only
-- their own shifts, and notify both sides of the assignment lifecycle.

create index if not exists shift_assignments_employee_date_idx
  on public.shift_assignments (employee_id, shift_date desc);

create index if not exists job_openings_org_status_closing_idx
  on public.job_openings (organisation_id, status, closing_date desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shift_assignments'::regclass
      and conname = 'shift_assignments_status_check'
  ) then
    alter table public.shift_assignments
      add constraint shift_assignments_status_check
      check (status in ('published', 'acknowledged', 'completed', 'cancelled'));
  end if;
end $$;

create or replace function public.update_my_shift_status(
  p_shift_id uuid,
  p_status text
)
returns public.shift_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift public.shift_assignments;
  v_employee_id uuid := public.current_employee_id();
begin
  if auth.uid() is null or v_employee_id is null then
    raise exception 'An active employee account is required';
  end if;
  if p_status not in ('acknowledged', 'completed') then
    raise exception 'Unsupported shift status';
  end if;

  select * into v_shift
  from public.shift_assignments
  where id = p_shift_id
    and organisation_id = public.current_organisation_id()
    and employee_id = v_employee_id
  for update;

  if not found then raise exception 'Shift assignment not found'; end if;
  if v_shift.status in ('completed', 'cancelled') then
    raise exception 'This shift can no longer be changed';
  end if;
  if p_status = 'acknowledged' and v_shift.status <> 'published' then
    raise exception 'Only a published shift can be acknowledged';
  end if;
  if p_status = 'completed' and now() < v_shift.ends_at then
    raise exception 'A shift can only be completed after its end time';
  end if;

  update public.shift_assignments
  set status = p_status, updated_at = now()
  where id = v_shift.id
  returning * into v_shift;
  return v_shift;
end;
$$;

revoke all on function public.update_my_shift_status(uuid, text) from public, anon;
grant execute on function public.update_my_shift_status(uuid, text) to authenticated;

create or replace function public.notify_shift_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_profile uuid;
  v_employee_name text;
begin
  select p.id, trim(concat_ws(' ', e.first_name, e.last_name))
  into v_employee_profile, v_employee_name
  from public.employees e
  join public.profiles p on p.employee_id = e.id
  where e.id = new.employee_id
    and p.organisation_id = new.organisation_id
  order by p.created_at
  limit 1;

  if tg_op = 'INSERT' and v_employee_profile is not null then
    perform public.insert_user_notification(
      new.organisation_id,
      v_employee_profile,
      'New shift assigned',
      format('A shift was assigned for %s from %s to %s%s.',
        to_char(new.starts_at at time zone 'Africa/Accra', 'DD Mon YYYY'),
        to_char(new.starts_at at time zone 'Africa/Accra', 'HH24:MI'),
        to_char(new.ends_at at time zone 'Africa/Accra', 'HH24:MI'),
        case when nullif(trim(new.location), '') is null then '' else ' at ' || trim(new.location) end),
      'shift', 'high', 'Calendar', 'Work schedule'
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status and new.assigned_by is not null then
    perform public.insert_user_notification(
      new.organisation_id,
      new.assigned_by,
      'Shift status updated',
      format('%s marked the %s shift as %s.',
        coalesce(nullif(v_employee_name, ''), 'Employee'),
        to_char(new.starts_at at time zone 'Africa/Accra', 'DD Mon YYYY HH24:MI'),
        replace(new.status, '_', ' ')),
      'shift', 'normal', 'Team Schedules', coalesce(nullif(v_employee_name, ''), 'Employee')
    );
  end if;
  return new;
end;
$$;

revoke all on function public.notify_shift_assignment_change() from public, anon, authenticated;

drop trigger if exists shift_assignment_notifications on public.shift_assignments;
create trigger shift_assignment_notifications
after insert or update of status on public.shift_assignments
for each row execute function public.notify_shift_assignment_change();

do $$
declare
  v_shift record;
begin
  for v_shift in
    select s.*, p.id as recipient_id
    from public.shift_assignments s
    join public.profiles p on p.employee_id = s.employee_id
      and p.organisation_id = s.organisation_id
    where s.status in ('published', 'acknowledged')
      and not exists (
        select 1 from public.notifications n
        where n.recipient_id = p.id
          and n.category = 'shift'
          and n.title = 'New shift assigned'
          and n.created_at >= s.created_at
      )
  loop
    perform public.insert_user_notification(
      v_shift.organisation_id,
      v_shift.recipient_id,
      'New shift assigned',
      format('A shift was assigned for %s from %s to %s%s.',
        to_char(v_shift.starts_at at time zone 'Africa/Accra', 'DD Mon YYYY'),
        to_char(v_shift.starts_at at time zone 'Africa/Accra', 'HH24:MI'),
        to_char(v_shift.ends_at at time zone 'Africa/Accra', 'HH24:MI'),
        case when nullif(trim(v_shift.location), '') is null then '' else ' at ' || trim(v_shift.location) end),
      'shift', 'high', 'Calendar', 'Work schedule'
    );
  end loop;
end $$;
