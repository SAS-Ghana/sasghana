begin;

drop policy if exists "administrators manage user permission overrides" on public.user_permission_overrides;
drop policy if exists "access managers manage user permission overrides" on public.user_permission_overrides;
create policy "access managers manage user permission overrides" on public.user_permission_overrides for all to authenticated
using(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')))
with check(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')));
grant select,insert,update,delete on public.user_permission_overrides to authenticated;

create or replace function public.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  with assigned as (
    select p.key,true as granted from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id where ur.profile_id=auth.uid()
    union all
    select p.key,upo.granted from public.user_permission_overrides upo join public.permissions p on p.id=upo.permission_id where upo.profile_id=auth.uid()
  ) select coalesce(bool_or(granted),false) from assigned where key=required_permission;
$$;

insert into public.user_permissions(profile_id,permission_id,granted_by)
select profile_id,permission_id,null from public.user_permission_overrides where granted=true
on conflict(profile_id,permission_id) do nothing;

create or replace function public.set_user_access(
  p_profile_id uuid,p_role_ids uuid[] default array[]::uuid[],p_permission_ids uuid[] default array[]::uuid[],p_dashboard_access jsonb default '[]'::jsonb,p_employee_id uuid default null,p_account_type text default null,p_job_title text default null,p_preferred_dashboard text default null,p_self_service_enabled boolean default true
) returns void language plpgsql security definer set search_path=public as $$
declare target_org uuid;
begin
  if not is_active_user() or not (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')) then raise exception 'Not authorised to manage user access'; end if;
  select organisation_id into target_org from public.profiles where id=p_profile_id;
  if target_org is null or target_org<>current_organisation_id() then raise exception 'User is outside your organisation'; end if;
  delete from public.user_roles where profile_id=p_profile_id;
  insert into public.user_roles(profile_id,role_id) select p_profile_id,r.id from public.roles r where r.id=any(coalesce(p_role_ids,array[]::uuid[])) and r.organisation_id=target_org;
  delete from public.user_permission_overrides where profile_id=p_profile_id;
  insert into public.user_permission_overrides(profile_id,permission_id,granted) select p_profile_id,p.id,true from public.permissions p where p.id=any(coalesce(p_permission_ids,array[]::uuid[]));
  delete from public.user_permissions where profile_id=p_profile_id;
  insert into public.user_permissions(profile_id,permission_id,granted_by) select p_profile_id,p.id,auth.uid() from public.permissions p where p.id=any(coalesce(p_permission_ids,array[]::uuid[]));
  update public.profiles set dashboard_access=coalesce(p_dashboard_access,'[]'::jsonb),employee_id=p_employee_id,account_type=coalesce(p_account_type,account_type),job_title=nullif(p_job_title,''),preferred_dashboard=coalesce(nullif(p_preferred_dashboard,''),preferred_dashboard),self_service_enabled=coalesce(p_self_service_enabled,true),updated_at=now() where id=p_profile_id;
end;$$;
grant execute on function public.set_user_access(uuid,uuid[],uuid[],jsonb,uuid,text,text,text,boolean) to authenticated;

commit;
