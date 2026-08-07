begin;

create or replace function public.restore_organisation_backup(backup jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  org_id uuid := public.current_organisation_id();
  table_name text;
  row_data jsonb;
  column_list text;
  record_definition text;
  assignments text;
  has_id boolean;
  changed integer;
  restored integer := 0;
  ordered text[] := array[
    'organisations','branches','departments','profiles','employees','roles',
    'user_roles','user_permission_overrides'
  ];
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('backups.restore')) then
    raise exception 'You do not have permission to restore backups.';
  end if;
  if backup->>'format'<>'sas-people-complete-backup'
     or (backup->>'organisation_id')::uuid<>org_id then
    raise exception 'Invalid backup or organisation mismatch.';
  end if;

  ordered := ordered || array(
    select key from jsonb_object_keys(backup->'tables') key
    where not (key=any(ordered))
  );
  perform set_config('sas.restore_mode','on',true);

  foreach table_name in array ordered loop
    if not (backup->'tables' ? table_name)
       or to_regclass('public.'||quote_ident(table_name)) is null then
      continue;
    end if;

    select
      string_agg(format('%I',a.attname),',' order by a.attnum),
      string_agg(format('%I %s',a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod)),',' order by a.attnum),
      string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
        filter(where a.attname<>'id'),
      bool_or(a.attname='id')
    into column_list,record_definition,assignments,has_id
    from pg_catalog.pg_attribute a
    where a.attrelid=to_regclass('public.'||quote_ident(table_name))
      and a.attnum>0 and not a.attisdropped and a.attgenerated='';

    for row_data in select value from jsonb_array_elements(backup->'tables'->table_name) loop
      if row_data ? 'organisation_id' and row_data->>'organisation_id'<>org_id::text then
        raise exception 'Backup row organisation mismatch in table %.',table_name;
      end if;
      begin
        if has_id and assignments is not null then
          execute format(
            'insert into public.%1$I (%2$s) select %2$s from jsonb_to_record($1) as x(%3$s) on conflict(id) do update set %4$s',
            table_name,column_list,record_definition,assignments
          ) using row_data;
        elsif has_id then
          execute format(
            'insert into public.%1$I (%2$s) select %2$s from jsonb_to_record($1) as x(%3$s) on conflict(id) do nothing',
            table_name,column_list,record_definition
          ) using row_data;
        else
          execute format(
            'insert into public.%1$I (%2$s) select %2$s from jsonb_to_record($1) as x(%3$s) on conflict do nothing',
            table_name,column_list,record_definition
          ) using row_data;
        end if;
        get diagnostics changed=row_count;
        restored:=restored+changed;
      exception when others then
        raise exception 'Restore failed for %.%: %',table_name,coalesce(row_data->>'id','composite row'),sqlerrm;
      end;
    end loop;
  end loop;

  perform set_config('sas.restore_mode','off',true);
  insert into public.backup_records(
    organisation_id,backup_type,status,requested_by,completed_at,restore_tested_at,notes,operation_type
  ) values (
    org_id,'restore','restored',auth.uid(),now(),now(),
    format('Organisation recovery completed. %s rows inserted or updated.',restored),'restore'
  );
  insert into public.audit_logs(organisation_id,actor_id,action,resource,outcome,metadata)
  values(org_id,auth.uid(),'backup.restored','backup_records','success',jsonb_build_object('row_count',restored,'format_version',backup->>'version'));
  return restored;
end
$function$;

revoke all on function public.restore_organisation_backup(jsonb) from public, anon;
grant execute on function public.restore_organisation_backup(jsonb) to authenticated;

commit;
