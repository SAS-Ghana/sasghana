begin;

drop policy if exists "administrator manage benefit_plans" on public.benefit_plans;
drop policy if exists "authorised users manage benefit_plans" on public.benefit_plans;
create policy "authorised users manage benefit_plans"
on public.benefit_plans for all to authenticated
using (organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('benefits.manage')))
with check (organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('benefits.manage')));
grant select,insert,update,delete on public.benefit_plans to authenticated;

create table if not exists public.user_permissions(
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(profile_id,permission_id)
);
alter table public.user_permissions enable row level security;

drop policy if exists "users view own permission overrides" on public.user_permissions;
create policy "users view own permission overrides" on public.user_permissions for select to authenticated
using(profile_id=auth.uid() or is_system_admin() or has_permission('users.manage') or has_permission('roles.manage'));

drop policy if exists "access managers manage permission overrides" on public.user_permissions;
create policy "access managers manage permission overrides" on public.user_permissions for all to authenticated
using(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')))
with check(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')));
grant select,insert,update,delete on public.user_permissions to authenticated;

create or replace function public.has_permission(required_permission text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id=ur.role_id join public.permissions p on p.id=rp.permission_id where ur.profile_id=auth.uid() and p.key=required_permission)
      or exists(select 1 from public.user_permissions up join public.permissions p on p.id=up.permission_id where up.profile_id=auth.uid() and p.key=required_permission);
$$;

drop policy if exists "system administrators manage user_roles" on public.user_roles;
drop policy if exists "access managers manage user_roles" on public.user_roles;
create policy "access managers manage user_roles" on public.user_roles for all to authenticated
using(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')) and exists(select 1 from public.profiles p where p.id=user_roles.profile_id and p.organisation_id=current_organisation_id()))
with check(is_active_user() and (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')) and exists(select 1 from public.profiles p where p.id=user_roles.profile_id and p.organisation_id=current_organisation_id()));
grant select,insert,update,delete on public.user_roles to authenticated;

drop policy if exists "system administrators manage profiles" on public.profiles;
drop policy if exists "access managers manage profiles" on public.profiles;
create policy "access managers manage profiles" on public.profiles for all to authenticated
using(organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('users.manage')))
with check(organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('users.manage')));

drop policy if exists "system administrators manage roles" on public.roles;
drop policy if exists "access managers manage roles" on public.roles;
create policy "access managers manage roles" on public.roles for all to authenticated
using(organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('roles.manage')))
with check(organisation_id=current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('roles.manage')));

drop policy if exists "system administrators manage role_permissions" on public.role_permissions;
drop policy if exists "access managers manage role_permissions" on public.role_permissions;
create policy "access managers manage role_permissions" on public.role_permissions for all to authenticated
using(is_active_user() and (is_system_admin() or has_permission('roles.manage')) and exists(select 1 from public.roles r where r.id=role_permissions.role_id and r.organisation_id=current_organisation_id()))
with check(is_active_user() and (is_system_admin() or has_permission('roles.manage')) and exists(select 1 from public.roles r where r.id=role_permissions.role_id and r.organisation_id=current_organisation_id()));
grant select,insert,update,delete on public.role_permissions to authenticated;

create or replace function public.set_user_access(
  p_profile_id uuid,
  p_role_ids uuid[] default array[]::uuid[],
  p_permission_ids uuid[] default array[]::uuid[],
  p_dashboard_access jsonb default '[]'::jsonb,
  p_employee_id uuid default null,
  p_account_type text default null,
  p_job_title text default null,
  p_preferred_dashboard text default null,
  p_self_service_enabled boolean default true
) returns void language plpgsql security definer set search_path=public as $$
declare target_org uuid;
begin
  if not is_active_user() or not (is_system_admin() or has_permission('users.manage') or has_permission('roles.manage')) then raise exception 'Not authorised to manage user access'; end if;
  select organisation_id into target_org from public.profiles where id=p_profile_id;
  if target_org is null or target_org<>current_organisation_id() then raise exception 'User is outside your organisation'; end if;
  delete from public.user_roles where profile_id=p_profile_id;
  insert into public.user_roles(profile_id,role_id) select p_profile_id,r.id from public.roles r where r.id=any(coalesce(p_role_ids,array[]::uuid[])) and r.organisation_id=target_org;
  delete from public.user_permissions where profile_id=p_profile_id;
  insert into public.user_permissions(profile_id,permission_id,granted_by) select p_profile_id,p.id,auth.uid() from public.permissions p where p.id=any(coalesce(p_permission_ids,array[]::uuid[]));
  update public.profiles set dashboard_access=coalesce(p_dashboard_access,'[]'::jsonb),employee_id=p_employee_id,account_type=coalesce(p_account_type,account_type),job_title=nullif(p_job_title,''),preferred_dashboard=coalesce(nullif(p_preferred_dashboard,''),preferred_dashboard),self_service_enabled=coalesce(p_self_service_enabled,true),updated_at=now() where id=p_profile_id;
end;$$;
grant execute on function public.set_user_access(uuid,uuid[],uuid[],jsonb,uuid,text,text,text,boolean) to authenticated;

commit;
