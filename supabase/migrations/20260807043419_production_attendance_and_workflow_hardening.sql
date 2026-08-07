-- Production hardening for employee self-service and attendance.

create or replace function public.submit_employee_change_request(
  p_field_name text,
  p_new_value text,
  p_reason text default null
) returns public.employee_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_employee public.employees%rowtype;
  v_row public.employee_change_requests%rowtype;
  v_field text;
begin
  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null or not public.is_active_user() then raise exception 'Active profile required'; end if;
  if v_profile.employee_id is null then raise exception 'Your login is not linked to an employee record'; end if;
  select * into v_employee from public.employees where id = v_profile.employee_id and organisation_id = v_profile.organisation_id;
  if v_employee.id is null then raise exception 'Employee record not found'; end if;

  v_field := case trim(p_field_name)
    when 'profile_photo' then 'passport_photo_path'
    else trim(p_field_name)
  end;
  if v_field not in (
    'first_name','middle_name','last_name','preferred_name','phone','personal_email',
    'date_of_birth','gender','nationality','marital_status','residential_address',
    'digital_address','emergency_contact_name','emergency_contact_phone',
    'emergency_contact_relationship','skills','qualifications','passport_photo_path',
    'biography','linkedin_url','bank_name','bank_account_name','bank_account_number'
  ) then raise exception 'This field cannot be changed through self-service'; end if;
  if coalesce(trim(p_new_value),'') = '' then raise exception 'Requested value is required'; end if;

  insert into public.employee_change_requests(
    organisation_id,employee_id,requested_by,field_name,old_value,new_value,reason,status
  ) values (
    v_profile.organisation_id,v_profile.employee_id,auth.uid(),v_field,
    to_jsonb(v_employee)->>v_field,p_new_value,nullif(trim(p_reason),''),'pending'
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.review_employee_change_request(
  p_request_id uuid,
  p_decision text,
  p_review_note text default null
) returns public.employee_change_requests
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.employee_change_requests;
  v_profile_id uuid := auth.uid();
  v_field text;
  v_sql text;
begin
  if v_profile_id is null then raise exception 'Authentication required'; end if;
  if not (public.is_system_admin() or public.has_permission('employees.update')) then raise exception 'Insufficient permission'; end if;
  if p_decision not in ('approved','rejected') then raise exception 'Decision must be approved or rejected'; end if;

  select * into v_request from public.employee_change_requests
  where id = p_request_id and organisation_id = public.current_organisation_id() and status in ('pending','manager_approved')
  for update;
  if not found then raise exception 'Reviewable request not found'; end if;

  v_field := case v_request.field_name when 'profile_photo' then 'passport_photo_path' else v_request.field_name end;
  if p_decision = 'approved' then
    if v_field not in (
      'first_name','middle_name','last_name','preferred_name','phone','personal_email',
      'date_of_birth','gender','nationality','marital_status','residential_address',
      'digital_address','emergency_contact_name','emergency_contact_phone',
      'emergency_contact_relationship','skills','qualifications','passport_photo_path',
      'biography','linkedin_url','bank_name','bank_account_name','bank_account_number'
    ) then raise exception 'This field cannot be changed through self-service'; end if;
    v_sql := format(
      'update public.employees set %I=$1, updated_at=now(), profile_change_status=''approved'' where id=$2 and organisation_id=$3',
      v_field
    );
    execute v_sql using v_request.new_value,v_request.employee_id,v_request.organisation_id;
  end if;

  update public.employee_change_requests set
    field_name=v_field,status=p_decision,reviewed_by=v_profile_id,reviewed_at=now(),
    review_note=p_review_note,updated_at=now()
  where id=p_request_id returning * into v_request;

  insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url)
  values(
    v_request.organisation_id,v_request.requested_by,
    case when p_decision='approved' then 'Profile update approved' else 'Profile update needs attention' end,
    case when p_decision='approved'
      then format('Your requested change to %s was approved and is now active.',replace(v_field,'_',' '))
      else format('Your requested change to %s was not approved.%s',replace(v_field,'_',' '),case when p_review_note is null then '' else ' '||p_review_note end)
    end,'profile_change','My Profile'
  );
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(v_request.organisation_id,v_profile_id,'employee_change_request.'||p_decision,'employee_change_requests',v_request.id,'success',jsonb_build_object('field_name',v_field,'employee_id',v_request.employee_id));
  return v_request;
end;
$$;

revoke all on function public.submit_employee_change_request(text,text,text) from public, anon;
revoke all on function public.review_employee_change_request(uuid,text,text) from public, anon;
grant execute on function public.submit_employee_change_request(text,text,text) to authenticated;
grant execute on function public.review_employee_change_request(uuid,text,text) to authenticated;

create or replace function public.process_attendance_cutoff()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  with due as (
    select
      r.id,
      greatest(
        r.clock_in,
        least(
          ((r.attendance_date + coalesce(o.shift_end,s.shift_end)) at time zone s.timezone),
          r.clock_in + make_interval(secs => (s.maximum_daily_hours * 3600)::int)
        )
      ) as cutoff_at
    from public.attendance_records r
    join public.attendance_settings s on s.organisation_id=r.organisation_id
    left join public.attendance_employee_overrides o
      on o.organisation_id=r.organisation_id and o.employee_id=r.employee_id and o.active=true
    where r.clock_in is not null
      and r.clock_out is null
      and (
        r.attendance_date < (now() at time zone s.timezone)::date
        or (
          r.attendance_date = (now() at time zone s.timezone)::date
          and (now() at time zone s.timezone)::time >= coalesce(o.shift_end,s.shift_end)
          and coalesce(o.auto_clock_out,s.auto_clock_out)=true
          and (o.overtime_approved_until is null or o.overtime_approved_until < now())
        )
      )
  )
  update public.attendance_records r set
    clock_out=due.cutoff_at,
    current_state='clocked_out',
    pause_started_at=null,
    clock_out_reason=case when r.attendance_date < current_date then 'automatic_stale_session_reconciliation' else 'automatic_end_of_shift' end,
    auto_clocked_out=true,
    worked_minutes=greatest(0,floor(extract(epoch from (due.cutoff_at-r.clock_in))/60)-coalesce(r.paused_minutes,0)),
    updated_at=now()
  from due where r.id=due.id;
  get diagnostics affected=row_count;
  return affected;
end;
$$;

revoke all on function public.process_attendance_cutoff() from public, anon;
grant execute on function public.process_attendance_cutoff() to authenticated;

alter table public.tasks add column if not exists opened_at timestamptz;
alter table public.tasks add column if not exists acknowledged_at timestamptz;
alter table public.tasks add column if not exists status_note text;
alter table public.tasks add column if not exists status_updated_at timestamptz;

create or replace function public.notify_task_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_assignee_profile uuid;
begin
  if tg_op='INSERT' and new.assigned_to_employee_id is not null then
    select id into v_assignee_profile from public.profiles where employee_id=new.assigned_to_employee_id and organisation_id=new.organisation_id limit 1;
    if v_assignee_profile is not null then
      insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url,sender_name)
      values(new.organisation_id,v_assignee_profile,'New task assigned',new.title||coalesce(E'\n'||new.description,''),'task','My Tasks','Task assignment');
    end if;
  elsif tg_op='UPDATE' and new.opened_at is distinct from old.opened_at and new.assigned_by is not null then
    insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url)
    values(new.organisation_id,new.assigned_by,'Task opened',new.title||' was opened by the assignee.','task','Tasks');
  elsif tg_op='UPDATE' and (new.status is distinct from old.status or new.progress is distinct from old.progress) and new.assigned_by is not null then
    insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url)
    values(new.organisation_id,new.assigned_by,'Task status updated',format('%s is now %s (%s%%). %s',new.title,replace(new.status,'_',' '),new.progress,coalesce(new.status_note,'')),'task','Tasks');
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_notify_activity on public.tasks;
create trigger tasks_notify_activity after insert or update on public.tasks
for each row execute function public.notify_task_activity();

select public.process_attendance_cutoff();
