alter table public.profiles add column if not exists email text;
create index if not exists profiles_email_lower_idx on public.profiles(lower(email));

update public.profiles p
set email=u.email
from auth.users u
where u.id=p.id and p.email is null;

create or replace function public.sync_profile_auth_email()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if new.email is null then select u.email into new.email from auth.users u where u.id=new.id; end if;
  return new;
end $$;
drop trigger if exists profiles_sync_auth_email on public.profiles;
create trigger profiles_sync_auth_email before insert or update of id,email on public.profiles
for each row execute function public.sync_profile_auth_email();

create or replace function public.resolve_login_email(login_name text)
returns text
language sql
stable
security definer
set search_path=public,auth
as $$
  select coalesce(p.email,u.email)
  from public.profiles p
  join auth.users u on u.id=p.id
  where lower(p.username)=lower(trim(login_name))
     or lower(coalesce(p.email,u.email))=lower(trim(login_name))
  limit 1
$$;
grant execute on function public.resolve_login_email(text) to anon,authenticated;

create or replace function public.export_organisation_backup()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  org_id uuid:=public.current_organisation_id();
  table_record record;
  result jsonb:='{}'::jsonb;
  rows_json jsonb;
begin
  if not public.has_permission('backups.manage') then
    raise exception 'You do not have permission to create backups.';
  end if;
  for table_record in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public' and c.column_name='organisation_id' and t.table_type='BASE TABLE'
    order by c.table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where organisation_id=$1',table_record.table_name)
      into rows_json using org_id;
    result:=result||jsonb_build_object(table_record.table_name,rows_json);
  end loop;
  select jsonb_agg(to_jsonb(o)) into rows_json from public.organisations o where o.id=org_id;
  result:=result||jsonb_build_object('organisations',coalesce(rows_json,'[]'::jsonb));
  select jsonb_agg(to_jsonb(ur)) into rows_json from public.user_roles ur join public.profiles p on p.id=ur.profile_id where p.organisation_id=org_id;
  result:=result||jsonb_build_object('user_roles',coalesce(rows_json,'[]'::jsonb));
  select jsonb_agg(to_jsonb(up)) into rows_json from public.user_permission_overrides up join public.profiles p on p.id=up.profile_id where p.organisation_id=org_id;
  result:=result||jsonb_build_object('user_permission_overrides',coalesce(rows_json,'[]'::jsonb));
  insert into public.backup_records(organisation_id,backup_type,status,requested_by,completed_at,notes)
  values(org_id,'manual','completed',auth.uid(),now(),'Complete portable JSON organisation backup generated and downloaded.');
  return jsonb_build_object(
    'format','sas-people-complete-backup',
    'version',1,
    'created_at',now(),
    'organisation_id',org_id,
    'tables',result
  );
end $$;
grant execute on function public.export_organisation_backup() to authenticated;

create or replace function public.request_password_reset_notice(login_name text)
returns text language plpgsql security definer set search_path=public,auth as $$
declare target public.profiles%rowtype;
begin
  select p.* into target from public.profiles p where lower(p.username)=lower(trim(login_name)) or lower(p.email)=lower(trim(login_name)) limit 1;
  if target.id is not null then
    insert into public.notifications(organisation_id,recipient_id,title,body,category)
    select target.organisation_id,p.id,'Password reset requested',target.display_name||' ('||target.username||') requested a password reset email.','security'
    from public.profiles p where p.organisation_id=target.organisation_id and p.account_type in ('administrator','hr') and p.status in ('active','password_change_required');
    insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
    values(target.organisation_id,null,'password.reset_requested','profiles',target.id,'success',jsonb_build_object('username',target.username));
  end if;
  return 'accepted';
end $$;
grant execute on function public.request_password_reset_notice(text) to anon,authenticated;

create or replace function public.restore_organisation_backup(backup jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare org_id uuid:=public.current_organisation_id(); table_name text; row_data jsonb; assignments text; restored integer:=0;
ordered text[]:=array['organisations','departments','branches','profiles','employees','roles','user_roles','user_permission_overrides'];
begin
  if not public.has_permission('backups.restore') then raise exception 'You do not have permission to restore backups.'; end if;
  if backup->>'format'<>'sas-people-complete-backup' or (backup->>'organisation_id')::uuid<>org_id then raise exception 'Invalid backup or organisation mismatch.'; end if;
  ordered:=ordered||array(select key from jsonb_object_keys(backup->'tables') key where not(key=any(ordered)));
  foreach table_name in array ordered loop
    if not (backup->'tables' ? table_name) or to_regclass('public.'||quote_ident(table_name)) is null then continue; end if;
    select string_agg(format('%I=excluded.%I',column_name,column_name),',') into assignments from information_schema.columns
      where table_schema='public' and information_schema.columns.table_name=restore_organisation_backup.table_name and column_name<>'id';
    for row_data in select value from jsonb_array_elements(backup->'tables'->table_name) loop
      if row_data ? 'organisation_id' and row_data->>'organisation_id'<>org_id::text then raise exception 'Backup row organisation mismatch.'; end if;
      if row_data ? 'id' then
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) on conflict(id) do update set %s',table_name,table_name,assignments) using row_data;
      else
        execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) on conflict do nothing',table_name,table_name) using row_data;
      end if;
      restored:=restored+1;
    end loop;
  end loop;
  insert into public.backup_records(organisation_id,backup_type,status,requested_by,completed_at,restore_tested_at,notes)
  values(org_id,'restore','restored',auth.uid(),now(),now(),'Complete organisation data restore from portable JSON backup.');
  return restored;
end $$;
grant execute on function public.restore_organisation_backup(jsonb) to authenticated;

insert into public.permissions(key,description) values
('backups.restore','Restore a complete organisation backup')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.name='SAS System Administrator' and p.key='backups.restore'
on conflict do nothing;
