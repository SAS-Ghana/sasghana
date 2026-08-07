create table if not exists public.attendance_overtime_requests(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  attendance_record_id uuid not null references public.attendance_records(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  requested_minutes integer not null default 0 check(requested_minutes>=0),
  approved_minutes integer check(approved_minutes>=0),
  status text not null default 'pending' check(status in ('pending','questions','approved','rejected')),
  employee_proof text,
  reviewer_comment text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attendance_record_id)
);
alter table public.attendance_overtime_requests enable row level security;
grant select,insert,update on public.attendance_overtime_requests to authenticated;
create index if not exists attendance_overtime_requests_org_status_idx on public.attendance_overtime_requests(organisation_id,status,created_at desc);
create index if not exists attendance_overtime_requests_employee_idx on public.attendance_overtime_requests(employee_id,created_at desc);

create policy overtime_self_select on public.attendance_overtime_requests for select to authenticated
using(organisation_id=public.current_organisation_id() and employee_id=public.current_employee_id() and public.is_active_user());
create policy overtime_staff_manage on public.attendance_overtime_requests for all to authenticated
using(organisation_id=public.current_organisation_id() and public.is_active_user() and (public.is_system_admin() or public.is_hr_or_administrator() or public.has_permission('attendance.manage') or public.manages_employee(employee_id)))
with check(organisation_id=public.current_organisation_id() and public.is_active_user() and (public.is_system_admin() or public.is_hr_or_administrator() or public.has_permission('attendance.manage') or public.manages_employee(employee_id)));

create or replace function public.calculate_attendance_overtime()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_settings public.attendance_settings;v_override public.attendance_employee_overrides;v_end timestamptz;
begin
  if new.clock_out is null then return new; end if;
  select * into v_settings from public.attendance_settings where organisation_id=new.organisation_id;
  if not found then return new; end if;
  select * into v_override from public.attendance_employee_overrides where organisation_id=new.organisation_id and employee_id=new.employee_id and active=true;
  v_end:=((new.attendance_date+coalesce(v_override.shift_end,v_settings.shift_end)) at time zone v_settings.timezone);
  new.overtime_minutes:=greatest(0,floor(extract(epoch from(new.clock_out-v_end))/60));
  return new;
end;$$;
drop trigger if exists attendance_calculate_overtime on public.attendance_records;
create trigger attendance_calculate_overtime before insert or update of clock_out on public.attendance_records for each row execute function public.calculate_attendance_overtime();

create or replace function public.create_overtime_approval_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_profile uuid;v_preapproved boolean;
begin
  if new.clock_out is null or new.overtime_minutes<=0 or (old.clock_out is not null and old.overtime_minutes=new.overtime_minutes) then return new; end if;
  select exists(select 1 from public.attendance_employee_overrides o where o.organisation_id=new.organisation_id and o.employee_id=new.employee_id and o.active=true and o.overtime_approved_until>=new.clock_out) into v_preapproved;
  insert into public.attendance_overtime_requests(organisation_id,attendance_record_id,employee_id,requested_minutes,approved_minutes,status,reviewer_comment)
  values(new.organisation_id,new.id,new.employee_id,new.overtime_minutes,case when v_preapproved then new.overtime_minutes end,case when v_preapproved then 'approved' else 'pending' end,case when v_preapproved then 'Approved through attendance override.' end)
  on conflict(attendance_record_id) do update set requested_minutes=excluded.requested_minutes,updated_at=now();
  if not v_preapproved then
    for v_profile in select id from public.profiles where organisation_id=new.organisation_id and status='active' and account_type in ('administrator','hr') loop
      insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url,priority)
      values(new.organisation_id,v_profile,'Overtime approval required',format('An employee recorded %s overtime minutes. Review the hours, request proof, approve or reject.',new.overtime_minutes),'attendance','Attendance Management','high');
    end loop;
  end if;
  return new;
end;$$;
drop trigger if exists attendance_create_overtime_request on public.attendance_records;
create trigger attendance_create_overtime_request after update of clock_out on public.attendance_records for each row execute function public.create_overtime_approval_request();

create or replace function public.review_overtime_request(p_request_id uuid,p_decision text,p_minutes integer default null,p_comment text default null)
returns public.attendance_overtime_requests language plpgsql security definer set search_path=public as $$
declare v_row public.attendance_overtime_requests;v_recipient uuid;
begin
  if not public.is_active_user() or not(public.is_system_admin() or public.is_hr_or_administrator() or public.has_permission('attendance.manage')) then raise exception 'Not authorised';end if;
  if p_decision not in('approved','rejected','questions') then raise exception 'Unsupported overtime decision';end if;
  select * into v_row from public.attendance_overtime_requests where id=p_request_id and organisation_id=public.current_organisation_id() for update;
  if not found then raise exception 'Overtime request not found';end if;
  update public.attendance_overtime_requests set status=p_decision,approved_minutes=case when p_decision='approved' then least(requested_minutes,greatest(0,coalesce(p_minutes,requested_minutes))) else null end,reviewer_comment=nullif(trim(p_comment),''),reviewed_by=auth.uid(),reviewed_at=case when p_decision in('approved','rejected') then now() end,updated_at=now() where id=p_request_id returning * into v_row;
  if p_decision='approved' then update public.attendance_records set overtime_minutes=v_row.approved_minutes,modified_by=auth.uid(),modification_reason=concat_ws(' ','Overtime approved.',p_comment),updated_at=now() where id=v_row.attendance_record_id;end if;
  select id into v_recipient from public.profiles where employee_id=v_row.employee_id and organisation_id=v_row.organisation_id limit 1;
  if v_recipient is not null then insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url,priority) values(v_row.organisation_id,v_recipient,case p_decision when 'approved' then 'Overtime approved' when 'rejected' then 'Overtime rejected' else 'Overtime proof requested' end,format('Your overtime request is %s.%s',replace(p_decision,'questions','waiting for your proof'),case when p_comment is null then '' else ' '||p_comment end),'attendance','Attendance','high');end if;
  return v_row;
end;$$;
revoke all on function public.review_overtime_request(uuid,text,integer,text) from public,anon;
grant execute on function public.review_overtime_request(uuid,text,integer,text) to authenticated;
