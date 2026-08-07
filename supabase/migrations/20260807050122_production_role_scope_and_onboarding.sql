-- Tighten manager data scope and allow employees to update only their own onboarding progress.

drop policy if exists org_scope_select on public.employee_cases;
create policy employee_cases_scoped_select on public.employee_cases for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator()
    or public.has_permission('hr.cases.manage') or public.has_permission('admin.cases.manage')
    or public.manages_employee(employee_id)
  )
);

drop policy if exists org_scope_select on public.employee_offboarding;
create policy employee_offboarding_scoped_select on public.employee_offboarding for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator()
    or public.has_permission('onboarding.manage') or public.has_permission('offboarding.manage')
    or employee_id=public.current_employee_id() or public.manages_employee(employee_id)
  )
);

drop policy if exists org_scope_select on public.import_jobs;
create policy import_jobs_staff_select on public.import_jobs for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator() or public.has_permission('settings.manage')
  )
);

drop policy if exists org_scope_select on public.shift_assignments;
create policy shift_assignments_scoped_select on public.shift_assignments for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator() or public.has_permission('attendance.manage')
    or employee_id=public.current_employee_id() or public.manages_employee(employee_id)
  )
);

drop policy if exists org_scope_select on public.approval_instances;
create policy approval_instances_scoped_select on public.approval_instances for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator() or requester_profile_id=auth.uid()
    or exists(select 1 from public.approval_actions a where a.approval_instance_id=id and a.approver_profile_id=auth.uid())
  )
);

drop policy if exists org_scope_select on public.approval_actions;
create policy approval_actions_scoped_select on public.approval_actions for select to authenticated
using (
  organisation_id=public.current_organisation_id() and public.is_active_user() and (
    public.is_system_admin() or public.is_hr_or_administrator() or approver_profile_id=auth.uid()
    or exists(select 1 from public.approval_instances i where i.id=approval_instance_id and i.requester_profile_id=auth.uid())
  )
);

create or replace function public.update_my_onboarding_status(p_onboarding_id uuid,p_status text,p_progress integer,p_note text default null)
returns public.employee_onboarding
language plpgsql
security definer
set search_path=public
as $$
declare v_row public.employee_onboarding;
begin
  if p_status not in ('not_started','in_progress','needs_attention','completed') then raise exception 'Unsupported onboarding status'; end if;
  select * into v_row from public.employee_onboarding
  where id=p_onboarding_id and organisation_id=public.current_organisation_id() and employee_id=public.current_employee_id()
  for update;
  if not found then raise exception 'Onboarding journey not found'; end if;
  update public.employee_onboarding set status=p_status,progress=case when p_status='completed' then 100 else greatest(0,least(100,p_progress)) end,
    notes=case when nullif(trim(p_note),'') is null then notes else concat_ws(E'\n',notes,'Employee update: '||trim(p_note)) end,
    started_at=case when p_status='in_progress' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status='completed' then now() else null end,updated_at=now()
  where id=p_onboarding_id returning * into v_row;
  if v_row.assigned_to is not null then insert into public.notifications(organisation_id,recipient_id,title,body,category,action_url)
    values(v_row.organisation_id,v_row.assigned_to,'Onboarding status updated',format('Employee changed onboarding to %s (%s%%). %s',replace(p_status,'_',' '),v_row.progress,coalesce(p_note,'')),'onboarding','Onboarding'); end if;
  return v_row;
end;
$$;
revoke all on function public.update_my_onboarding_status(uuid,text,integer,text) from public,anon;
grant execute on function public.update_my_onboarding_status(uuid,text,integer,text) to authenticated;
