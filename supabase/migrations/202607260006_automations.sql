create or replace function public.prevent_overlapping_leave()
returns trigger language plpgsql as $$
begin
  if new.status in ('pending','approved') and exists(
    select 1 from public.leave_requests lr
    where lr.employee_id=new.employee_id and lr.id<>coalesce(new.id,gen_random_uuid())
      and lr.status in ('pending','approved')
      and daterange(lr.start_date,lr.end_date,'[]') && daterange(new.start_date,new.end_date,'[]')
  ) then raise exception 'This employee already has an overlapping leave request.';
  end if;
  return new;
end $$;

drop trigger if exists prevent_overlapping_leave_trigger on public.leave_requests;
create trigger prevent_overlapping_leave_trigger before insert or update on public.leave_requests
for each row execute function public.prevent_overlapping_leave();

create or replace function public.notify_employee_workflow()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid; notification_title text; notification_body text; notification_category text;
begin
  if tg_table_name='tasks' then
    select profile_id into recipient from employees where id=new.assigned_to_employee_id;
    notification_title:='New task assigned';
    notification_body:=new.title;
    notification_category:='task';
  elsif tg_table_name='leave_requests' and old.status is distinct from new.status then
    select profile_id into recipient from employees where id=new.employee_id;
    notification_title:='Leave request updated';
    notification_body:='Your '||new.leave_type||' request is now '||replace(new.status,'_',' ')||'.';
    notification_category:='leave';
  else return new;
  end if;
  if recipient is not null then
    insert into notifications(organisation_id,recipient_id,title,body,category)
    values(new.organisation_id,recipient,notification_title,notification_body,notification_category);
  end if;
  return new;
end $$;

drop trigger if exists notify_new_task on public.tasks;
create trigger notify_new_task after insert on public.tasks
for each row execute function public.notify_employee_workflow();
drop trigger if exists notify_leave_update on public.leave_requests;
create trigger notify_leave_update after update on public.leave_requests
for each row execute function public.notify_employee_workflow();

create or replace function public.meeting_conflicts(
  attendee_profile_id uuid, proposed_start timestamptz, proposed_end timestamptz
) returns table(meeting_id uuid,title text,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path=public as $$
  select m.id,m.title,m.starts_at,m.ends_at from meetings m
  join meeting_attendees ma on ma.meeting_id=m.id
  where ma.profile_id=attendee_profile_id and ma.response<>'declined'
    and m.status='scheduled' and tstzrange(m.starts_at,m.ends_at,'[)') && tstzrange(proposed_start,proposed_end,'[)')
$$;

create or replace function public.create_notification_preferences()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into notification_preferences(profile_id,organisation_id)
  values(new.id,new.organisation_id) on conflict(profile_id) do nothing;
  return new;
end $$;
drop trigger if exists create_profile_notification_preferences on public.profiles;
create trigger create_profile_notification_preferences after insert on public.profiles
for each row execute function public.create_notification_preferences();

insert into public.notification_preferences(profile_id,organisation_id)
select id,organisation_id from public.profiles on conflict(profile_id) do nothing;

do $$
begin
  create extension if not exists pg_cron with schema pg_catalog;
  if not exists(select 1 from cron.job where jobname='purge-expired-sas-chat') then
    perform cron.schedule('purge-expired-sas-chat','17 1 * * *','select public.purge_expired_chat_messages()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling was unavailable; purge function remains available for external scheduling.';
end $$;
