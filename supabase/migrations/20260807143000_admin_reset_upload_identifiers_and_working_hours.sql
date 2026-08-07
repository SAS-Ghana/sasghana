-- Production administration hardening: upload settings, readable identifiers and a guarded
-- organisation reset. The reset is never invoked automatically and always creates a recovery point.

create sequence if not exists public.sas_profile_code_seq;
create sequence if not exists public.sas_department_code_seq;
create sequence if not exists public.sas_employee_code_seq;

alter table public.profiles add column if not exists profile_code text;
alter table public.departments add column if not exists department_code text;

with ranked as (
  select id, row_number() over (order by created_at,id) as number from public.profiles where profile_code is null
)
update public.profiles p set profile_code='SASPROF'||lpad(r.number::text,6,'0') from ranked r where p.id=r.id;

with ranked as (
  select id, row_number() over (order by created_at,id) as number from public.departments where department_code is null
)
update public.departments d set department_code='SASDEPT'||lpad(r.number::text,4,'0') from ranked r where d.id=r.id;

with ranked as (
  select id, row_number() over (partition by organisation_id order by created_at,id) as number
  from public.employees
)
update public.employees e set employee_number='SASEMP'||lpad(r.number::text,5,'0') from ranked r where e.id=r.id;

create unique index if not exists profiles_org_profile_code_key on public.profiles(organisation_id,profile_code);
create unique index if not exists departments_org_department_code_key on public.departments(organisation_id,department_code);

select setval('public.sas_profile_code_seq',greatest((select count(*) from public.profiles),1),true);
select setval('public.sas_department_code_seq',greatest((select count(*) from public.departments),1),true);
select setval('public.sas_employee_code_seq',greatest((select count(*) from public.employees),1),true);

create or replace function public.assign_sas_readable_code()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_table_name='profiles' and nullif(trim(new.profile_code),'') is null then
    new.profile_code := 'SASPROF'||lpad(nextval('public.sas_profile_code_seq')::text,6,'0');
  elsif tg_table_name='departments' and nullif(trim(new.department_code),'') is null then
    new.department_code := 'SASDEPT'||lpad(nextval('public.sas_department_code_seq')::text,4,'0');
  elsif tg_table_name='employees' and nullif(trim(new.employee_number),'') is null then
    new.employee_number := 'SASEMP'||lpad(nextval('public.sas_employee_code_seq')::text,5,'0');
  end if;
  return new;
end $$;
revoke all on function public.assign_sas_readable_code() from public,anon,authenticated;

drop trigger if exists profiles_assign_sas_code on public.profiles;
create trigger profiles_assign_sas_code before insert on public.profiles for each row execute function public.assign_sas_readable_code();
drop trigger if exists departments_assign_sas_code on public.departments;
create trigger departments_assign_sas_code before insert on public.departments for each row execute function public.assign_sas_readable_code();
drop trigger if exists employees_assign_sas_code on public.employees;
create trigger employees_assign_sas_code before insert on public.employees for each row execute function public.assign_sas_readable_code();

create table if not exists public.user_upload_limits (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  bucket_id text not null,
  max_bytes bigint not null check(max_bytes>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_id,bucket_id)
);
alter table public.user_upload_limits enable row level security;
drop policy if exists "admins manage upload limits" on public.user_upload_limits;
create policy "admins manage upload limits" on public.user_upload_limits for all to authenticated
using(organisation_id=public.current_organisation_id() and (public.is_system_admin() or public.has_permission('settings.manage')))
with check(organisation_id=public.current_organisation_id() and (public.is_system_admin() or public.has_permission('settings.manage')));
drop policy if exists "users view own upload limit" on public.user_upload_limits;
create policy "users view own upload limit" on public.user_upload_limits for select to authenticated using(profile_id=(select auth.uid()));
grant select,insert,update,delete on public.user_upload_limits to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('brand-assets','brand-assets',true,1048576,array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict(id) do update set public=true,file_size_limit=1048576,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "admins manage brand assets" on storage.objects;
create policy "admins manage brand assets" on storage.objects for all to authenticated
using(bucket_id='brand-assets' and (public.is_system_admin() or public.has_permission('settings.manage')))
with check(bucket_id='brand-assets' and (public.is_system_admin() or public.has_permission('settings.manage')));

create or replace function public.my_upload_limit(p_bucket text) returns bigint
language sql stable security definer set search_path=public as $$
  select coalesce(
    (select max_bytes from public.user_upload_limits where profile_id=(select auth.uid()) and bucket_id=p_bucket),
    (select file_size_limit from storage.buckets where id=p_bucket)
  )
$$;
revoke all on function public.my_upload_limit(text) from public,anon;
grant execute on function public.my_upload_limit(text) to authenticated;

create or replace function public.update_bucket_upload_limit(p_bucket text,p_max_bytes bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('settings.manage')) then raise exception 'Not authorised'; end if;
  if p_max_bytes<102400 or p_max_bytes>52428800 then raise exception 'Upload limit must be between 0.1MB and 50MB'; end if;
  update storage.buckets set file_size_limit=p_max_bytes where id=p_bucket;
  if not found then raise exception 'Upload type was not found'; end if;
end $$;
revoke all on function public.update_bucket_upload_limit(text,bigint) from public,anon;
grant execute on function public.update_bucket_upload_limit(text,bigint) to authenticated;

create or replace function public.list_upload_buckets()
returns table(bucket_id text,file_size_limit bigint,allowed_mime_types text[])
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('settings.manage')) then raise exception 'Not authorised'; end if;
  return query select b.id,b.file_size_limit,b.allowed_mime_types from storage.buckets b
  where b.id in ('employee-media','hr-media','library-books','brand-assets') order by b.id;
end $$;
revoke all on function public.list_upload_buckets() from public,anon;
grant execute on function public.list_upload_buckets() to authenticated;

create or replace function public.preview_organisation_reset()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when public.is_system_admin() then jsonb_build_object(
    'employees',(select count(*) from public.employees where organisation_id=public.current_organisation_id()),
    'other_accounts',(select count(*) from public.profiles where organisation_id=public.current_organisation_id() and id<>(select auth.uid())),
    'departments',(select count(*) from public.departments where organisation_id=public.current_organisation_id()),
    'confirmation','RESET '||(select username from public.profiles where id=(select auth.uid()))
  ) else null end
$$;
revoke all on function public.preview_organisation_reset() from public,anon;
grant execute on function public.preview_organisation_reset() to authenticated;

create or replace function public.reset_organisation_to_admin(p_confirmation text)
returns jsonb language plpgsql security definer set search_path=public,private,auth as $$
declare
  org_id uuid:=public.current_organisation_id(); admin_id uuid:=(select auth.uid()); admin_username text;
  removal_ids uuid[]; backup_id uuid; table_record record; pass integer; deleted_accounts integer:=0;
begin
  if not public.is_active_user() or not public.is_system_admin() then raise exception 'Only the active system administrator can reset the organisation.'; end if;
  select username into admin_username from public.profiles where id=admin_id and organisation_id=org_id;
  if p_confirmation is distinct from 'RESET '||admin_username then raise exception 'The reset confirmation did not match.'; end if;

  backup_id:=public.create_organisation_recovery_point('Automatic recovery point before full organisation reset');
  select coalesce(array_agg(id),'{}'::uuid[]) into removal_ids from public.profiles where organisation_id=org_id and id<>admin_id;
  update public.profiles set employee_id=null,avatar_path=null,failed_login_count=0,locked_until=null where id=admin_id;
  perform set_config('sas.restore_mode','on',true);

  for pass in 1..20 loop
    for table_record in
      select t.table_name from information_schema.tables t
      where t.table_schema='public' and t.table_type='BASE TABLE'
        and exists(select 1 from information_schema.columns c where c.table_schema='public' and c.table_name=t.table_name and c.column_name='organisation_id')
        and t.table_name not in ('organisations','profiles','roles','permissions','role_permissions','user_roles','audit_logs','backup_records','public_branding')
      order by (select count(*) from information_schema.table_constraints k where k.table_schema='public' and k.table_name=t.table_name and k.constraint_type='FOREIGN KEY') desc,t.table_name
    loop
      begin execute format('delete from public.%I where organisation_id=$1',table_record.table_name) using org_id;
      exception when foreign_key_violation then null;
      end;
    end loop;
  end loop;

  delete from public.user_roles where profile_id=any(removal_ids);
  delete from public.profiles where id=any(removal_ids);
  get diagnostics deleted_accounts=row_count;
  delete from auth.users where id=any(removal_ids);
  update public.public_branding set company_name='SAS Finance Group Ghana',short_name='SAS Finance Group',description='Employee Management and Onboarding Portal',
    dashboard_description='Private & confidential',login_eyebrow='Private employee portal',login_title='People operations, made effortless.',
    login_welcome='Secure employee management and onboarding for SAS Finance Group Ghana.',logo_url=null,login_logo_url=null,dashboard_logo_url=null,
    primary_colour='#00AEEF',secondary_colour='#071426',accent_colour='#00AEEF',background_colour='#F4F7FB',surface_colour='#FFFFFF',sidebar_colour='#071426'
  where organisation_id=org_id;
  perform set_config('sas.restore_mode','off',true);
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(org_id,admin_id,'organisation.reset','organisations',org_id,'success',jsonb_build_object('deleted_accounts',deleted_accounts,'recovery_point_id',backup_id));
  return jsonb_build_object('deleted_accounts',deleted_accounts,'recovery_point_id',backup_id,'administrator_id',admin_id);
end $$;
revoke all on function public.reset_organisation_to_admin(text) from public,anon;
grant execute on function public.reset_organisation_to_admin(text) to authenticated;

notify pgrst,'reload schema';
