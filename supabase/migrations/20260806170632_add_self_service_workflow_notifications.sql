create or replace function public.notify_self_service_workflow()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  employee_profile uuid;
  employee_name text;
  subject_name text;
  target record;
  display_status text;
begin
  employee_profile := public.profile_for_employee(new.employee_id);
  select trim(concat_ws(' ', e.first_name, e.last_name))
    into employee_name
    from public.employees e
   where e.id = new.employee_id;

  if tg_table_name = 'employee_change_requests' then
    subject_name := replace(coalesce(new.field_name, 'profile information'), '_', ' ');
    if tg_op = 'INSERT' then
      for target in
        select p.id from public.profiles p
         where p.organisation_id = new.organisation_id
           and p.status in ('active', 'password_change_required')
           and lower(coalesce(p.account_type, '')) in ('hr', 'administrator')
      loop
        perform public.insert_user_notification(new.organisation_id, target.id,
          'New profile change request',
          coalesce(employee_name, 'Employee') || ' requested a change to ' || subject_name || '.',
          'profile', 'normal', 'Profile Requests', coalesce(employee_name, 'Employee'));
      end loop;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and employee_profile is not null then
      display_status := replace(coalesce(new.status, 'updated'), '_', ' ');
      perform public.insert_user_notification(new.organisation_id, employee_profile,
        'Profile request updated',
        'Your request to change ' || subject_name || ' is now ' || display_status || '.',
        'profile', case when new.status = 'rejected' then 'high' else 'normal' end,
        'Requests', 'Human Resources');
    end if;

  elsif tg_table_name = 'transfer_requests' then
    subject_name := trim(concat_ws(' / ', new.requested_department, new.requested_branch));
    if tg_op = 'INSERT' then
      for target in
        select p.id from public.profiles p
         where p.organisation_id = new.organisation_id
           and p.status in ('active', 'password_change_required')
           and lower(coalesce(p.account_type, '')) in ('hr', 'administrator')
      loop
        perform public.insert_user_notification(new.organisation_id, target.id,
          'New transfer request',
          coalesce(employee_name, 'Employee') || ' requested a transfer' ||
            case when subject_name <> '' then ' to ' || subject_name else '' end || '.',
          'transfer', 'normal', 'Profile Requests', coalesce(employee_name, 'Employee'));
      end loop;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and employee_profile is not null then
      display_status := replace(coalesce(new.status, 'updated'), '_', ' ');
      perform public.insert_user_notification(new.organisation_id, employee_profile,
        'Transfer request updated',
        'Your transfer request is now ' || display_status || '.',
        'transfer', case when new.status in ('rejected', 'returned') then 'high' else 'normal' end,
        'Requests', 'Human Resources');
    end if;

  elsif tg_table_name = 'internal_job_applications' then
    select j.title into subject_name from public.job_openings j where j.id = new.job_opening_id;
    if tg_op = 'INSERT' then
      for target in
        select p.id from public.profiles p
         where p.organisation_id = new.organisation_id
           and p.status in ('active', 'password_change_required')
           and lower(coalesce(p.account_type, '')) in ('hr', 'administrator')
      loop
        perform public.insert_user_notification(new.organisation_id, target.id,
          'New internal job application',
          coalesce(employee_name, 'Employee') || ' applied for ' || coalesce(subject_name, 'an internal vacancy') || '.',
          'recruitment', 'normal', 'Recruitment', coalesce(employee_name, 'Employee'));
      end loop;
    elsif tg_op = 'UPDATE' and new.status is distinct from old.status and employee_profile is not null then
      display_status := replace(coalesce(new.status, 'updated'), '_', ' ');
      perform public.insert_user_notification(new.organisation_id, employee_profile,
        'Job application updated',
        'Your application for ' || coalesce(subject_name, 'an internal vacancy') || ' is now ' || display_status || '.',
        'recruitment', case when new.status = 'rejected' then 'high' else 'normal' end,
        'Recruitment', 'Human Resources');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_self_service_workflow() from public, anon, authenticated;

drop trigger if exists self_service_workflow_notifications on public.employee_change_requests;
create trigger self_service_workflow_notifications
after insert or update on public.employee_change_requests
for each row execute function public.notify_self_service_workflow();

drop trigger if exists self_service_workflow_notifications on public.transfer_requests;
create trigger self_service_workflow_notifications
after insert or update on public.transfer_requests
for each row execute function public.notify_self_service_workflow();

drop trigger if exists self_service_workflow_notifications on public.internal_job_applications;
create trigger self_service_workflow_notifications
after insert or update on public.internal_job_applications
for each row execute function public.notify_self_service_workflow();

revoke all on function public.insert_user_notification(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;
