begin;

-- The previous shared webhook trigger referenced table-specific NEW fields.
-- PostgreSQL validates those fields against every trigger row type, so purchase
-- requests failed before the unreachable branding branch could be skipped.
create or replace function public.enqueue_integration_webhook_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_org uuid;
  v_id uuid;
  v_type text;
  v_row jsonb := to_jsonb(new);
  v_payload jsonb;
begin
  v_org := (v_row ->> 'organisation_id')::uuid;
  v_id := coalesce((v_row ->> 'id')::uuid, v_org);

  if tg_table_name = 'purchase_requests' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return new;
    end if;
    v_type := 'procurement.' || case when tg_op = 'INSERT' then 'created' else replace(new.status, '_', '.') end;
    v_payload := jsonb_build_object(
      'request_number', v_row ->> 'request_number',
      'status', v_row ->> 'status',
      'current_stage', v_row ->> 'current_stage',
      'priority', v_row ->> 'priority',
      'estimated_total', v_row -> 'estimated_total'
    );
  else
    v_type := 'branding.updated';
    v_payload := jsonb_build_object(
      'company_name', v_row ->> 'company_name',
      'short_name', v_row ->> 'short_name',
      'updated_at', v_row ->> 'updated_at'
    );
  end if;

  insert into public.webhook_events(organisation_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_org,v_type,tg_table_name,v_id,jsonb_build_object(
    'event',v_type,
    'aggregate_id',v_id,
    'occurred_at',now(),
    'data',v_payload
  ));
  return new;
end
$function$;

revoke all on function public.enqueue_integration_webhook_event() from public, anon, authenticated;

-- Administrator recovery bin. The original JSON row is retained until an
-- administrator restores it or permanently purges it.
create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  table_name text not null,
  original_id uuid not null,
  record_label text,
  original_data jsonb not null,
  deleted_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','restored')),
  restored_by uuid references public.profiles(id) on delete set null,
  restored_at timestamptz,
  unique(table_name, original_id, deleted_at)
);

create index if not exists deleted_records_org_status_time_idx
  on public.deleted_records(organisation_id,status,deleted_at desc);
create index if not exists deleted_records_org_table_idx
  on public.deleted_records(organisation_id,table_name,deleted_at desc);

alter table public.deleted_records enable row level security;
drop policy if exists "administrators read deleted records" on public.deleted_records;
create policy "administrators read deleted records"
on public.deleted_records for select to authenticated
using (organisation_id = public.current_organisation_id() and public.is_system_admin());

grant select on public.deleted_records to authenticated;

-- Existing backup history becomes a secure in-database recovery point index.
alter table public.backup_records
  add column if not exists snapshot_data jsonb,
  add column if not exists checksum text,
  add column if not exists record_count integer,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists downloaded_at timestamptz,
  add column if not exists downloaded_by uuid references public.profiles(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists operation_type text default 'backup';

create index if not exists backup_records_org_time_idx
  on public.backup_records(organisation_id,created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.build_organisation_backup(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  table_record record;
  result jsonb := '{}'::jsonb;
  rows_json jsonb;
begin
  for table_record in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name
    where c.table_schema='public'
      and c.column_name='organisation_id'
      and t.table_type='BASE TABLE'
      and c.table_name not in ('backup_records','webhook_events')
    order by c.table_name
  loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where organisation_id=$1',
      table_record.table_name
    ) into rows_json using p_org_id;
    result := result || jsonb_build_object(table_record.table_name,rows_json);
  end loop;

  select jsonb_agg(to_jsonb(o)) into rows_json from public.organisations o where o.id=p_org_id;
  result := result || jsonb_build_object('organisations',coalesce(rows_json,'[]'::jsonb));
  select jsonb_agg(to_jsonb(ur)) into rows_json
  from public.user_roles ur join public.profiles p on p.id=ur.profile_id
  where p.organisation_id=p_org_id;
  result := result || jsonb_build_object('user_roles',coalesce(rows_json,'[]'::jsonb));
  select jsonb_agg(to_jsonb(up)) into rows_json
  from public.user_permission_overrides up join public.profiles p on p.id=up.profile_id
  where p.organisation_id=p_org_id;
  result := result || jsonb_build_object('user_permission_overrides',coalesce(rows_json,'[]'::jsonb));

  return jsonb_build_object(
    'format','sas-people-complete-backup',
    'version',2,
    'created_at',now(),
    'organisation_id',p_org_id,
    'tables',result
  );
end
$function$;

revoke all on function private.build_organisation_backup(uuid) from public, anon, authenticated;

create or replace function public.export_organisation_backup()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  org_id uuid := public.current_organisation_id();
  backup jsonb;
  row_total integer;
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('backups.manage')) then
    raise exception 'You do not have permission to create backups.';
  end if;
  backup := private.build_organisation_backup(org_id);
  select coalesce(sum(jsonb_array_length(value)),0)::integer into row_total
  from jsonb_each(backup->'tables');
  insert into public.backup_records(
    organisation_id,backup_type,status,requested_by,completed_at,notes,
    checksum,record_count,approved_by,approved_at,operation_type
  ) values (
    org_id,'manual','completed',auth.uid(),now(),
    'Portable organisation backup generated for secure download.',
    md5(backup::text),row_total,auth.uid(),now(),'download'
  );
  return backup;
end
$function$;

revoke all on function public.export_organisation_backup() from public, anon;
grant execute on function public.export_organisation_backup() to authenticated;

create or replace function public.create_organisation_recovery_point(p_notes text default null)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $function$
declare
  org_id uuid := public.current_organisation_id();
  backup jsonb;
  backup_id uuid;
  row_total integer;
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('backups.manage')) then
    raise exception 'You do not have permission to create recovery points.';
  end if;
  backup := private.build_organisation_backup(org_id);
  select coalesce(sum(jsonb_array_length(value)),0)::integer into row_total
  from jsonb_each(backup->'tables');
  insert into public.backup_records(
    organisation_id,backup_type,status,requested_by,completed_at,notes,
    snapshot_data,checksum,record_count,approved_by,approved_at,operation_type
  ) values (
    org_id,'recovery_point','completed',auth.uid(),now(),
    nullif(trim(p_notes),''),backup,md5(backup::text),row_total,auth.uid(),now(),'backup'
  ) returning id into backup_id;
  return backup_id;
end
$function$;

revoke all on function public.create_organisation_recovery_point(text) from public, anon;
grant execute on function public.create_organisation_recovery_point(text) to authenticated;

create or replace function public.restore_organisation_recovery_point(p_record_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  item public.backup_records%rowtype;
  restored integer;
begin
  if not public.is_active_user() or not (public.is_system_admin() or public.has_permission('backups.restore')) then
    raise exception 'You do not have permission to restore recovery points.';
  end if;
  select * into item from public.backup_records
  where id=p_record_id and organisation_id=public.current_organisation_id()
  for update;
  if item.id is null or item.snapshot_data is null then
    raise exception 'Recovery point was not found or has no stored snapshot.';
  end if;
  if item.checksum is distinct from md5(item.snapshot_data::text) then
    raise exception 'Recovery point integrity check failed.';
  end if;
  restored := public.restore_organisation_backup(item.snapshot_data);
  update public.backup_records
  set restore_tested_at=now(),status='restored'
  where id=item.id;
  return restored;
end
$function$;

revoke all on function public.restore_organisation_recovery_point(uuid) from public, anon;
grant execute on function public.restore_organisation_recovery_point(uuid) to authenticated;

create or replace function public.restore_deleted_record(p_deleted_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare
  item public.deleted_records%rowtype;
  restored integer;
begin
  if not public.is_active_user() or not public.is_system_admin() then
    raise exception 'Administrator permission required.';
  end if;
  select * into item from public.deleted_records
  where id=p_deleted_id and organisation_id=public.current_organisation_id()
  for update;
  if item.id is null then raise exception 'Deleted record was not found.'; end if;
  if item.status='restored' then raise exception 'This record has already been restored.'; end if;
  if to_regclass('public.'||quote_ident(item.table_name)) is null then
    raise exception 'The source table no longer exists.';
  end if;

  perform set_config('sas.restore_mode','on',true);
  execute format(
    'insert into public.%I select * from jsonb_populate_record(null::public.%I,$1) on conflict (id) do nothing',
    item.table_name,item.table_name
  ) using item.original_data;
  get diagnostics restored=row_count;
  perform set_config('sas.restore_mode','off',true);
  if restored=0 then raise exception 'A record with this ID already exists.'; end if;

  update public.deleted_records
  set status='restored',restored_by=auth.uid(),restored_at=now()
  where id=item.id;
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(item.organisation_id,auth.uid(),'record.restored',item.table_name,item.original_id,'success',
    jsonb_build_object('deleted_record_id',item.id,'record_label',item.record_label,'restored_data',item.original_data));
  return item.table_name;
end
$function$;

create or replace function public.purge_deleted_record(p_deleted_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $function$
declare item public.deleted_records%rowtype;
begin
  if not public.is_active_user() or not public.is_system_admin() then
    raise exception 'Administrator permission required.';
  end if;
  select * into item from public.deleted_records
  where id=p_deleted_id and organisation_id=public.current_organisation_id()
  for update;
  if item.id is null then raise exception 'Deleted record was not found.'; end if;
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(item.organisation_id,auth.uid(),'record.permanently_deleted',item.table_name,item.original_id,'success',
    jsonb_build_object('deleted_record_id',item.id,'record_label',item.record_label,'deleted_at',item.deleted_at,'original_data',item.original_data));
  delete from public.deleted_records where id=item.id;
  return item.table_name;
end
$function$;

revoke all on function public.restore_deleted_record(uuid) from public, anon;
revoke all on function public.purge_deleted_record(uuid) from public, anon;
grant execute on function public.restore_deleted_record(uuid) to authenticated;
grant execute on function public.purge_deleted_record(uuid) to authenticated;

create or replace function public.global_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  current_data jsonb;
  previous_data jsonb;
  payload jsonb;
  org_id uuid;
  row_id uuid;
  actor uuid;
  label text;
begin
  if current_setting('sas.restore_mode',true)='on' then
    if tg_op='DELETE' then return old; end if;
    return new;
  end if;
  if tg_op='DELETE' then
    previous_data:=to_jsonb(old);
    payload:=previous_data;
  else
    current_data:=to_jsonb(new);
    payload:=current_data;
    if tg_op='UPDATE' then previous_data:=to_jsonb(old); end if;
  end if;
  if tg_op='UPDATE' and (current_data-'updated_at') is not distinct from (previous_data-'updated_at') then
    return new;
  end if;
  org_id:=(payload->>'organisation_id')::uuid;
  row_id:=(payload->>'id')::uuid;
  select auth.uid() into actor;
  if actor is not null and not exists(select 1 from public.profiles where id=actor) then actor:=null; end if;
  label:=coalesce(payload->>'title',payload->>'name',payload->>'subject',payload->>'display_name',payload->>'full_name',payload->>'employee_number',payload->>'request_number',row_id::text);

  if tg_op='DELETE' then
    insert into public.deleted_records(organisation_id,table_name,original_id,record_label,original_data,deleted_by)
    values(org_id,tg_table_name,row_id,label,previous_data,actor);
  end if;
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(org_id,actor,'record.'||lower(tg_op),tg_table_name,row_id,'success',
    jsonb_strip_nulls(jsonb_build_object('label',label,'old',previous_data,'new',current_data)));
  if tg_op='DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function public.global_audit_row_change() from public, anon, authenticated;

do $block$
declare item record;
begin
  for item in
    select distinct c.table_name
    from information_schema.columns c
    join information_schema.columns i
      on i.table_schema=c.table_schema and i.table_name=c.table_name and i.column_name='id' and i.data_type='uuid'
    join information_schema.tables t
      on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
    where c.table_schema='public'
      and c.column_name='organisation_id'
      and c.table_name not in ('audit_logs','deleted_records','webhook_events')
  loop
    execute format('drop trigger if exists global_audit_row_change on public.%I',item.table_name);
    execute format(
      'create trigger global_audit_row_change after insert or update or delete on public.%I for each row execute function public.global_audit_row_change()',
      item.table_name
    );
  end loop;
end
$block$;

-- Managers may see purchase requests from their direct reports, while the
-- existing Accountant+Manager rule still controls first-stage approval.
drop policy if exists "purchase request participants can view" on public.purchase_requests;
create policy "purchase request participants can view"
on public.purchase_requests for select to authenticated
using (
  organisation_id=public.current_organisation_id()
  and public.is_active_user()
  and (
    requested_by=(select auth.uid())
    or public.is_system_admin()
    or public.has_any_permission(array['accounts.approve','accounts.manage','procurement.approve','procurement.manage'])
    or exists (
      select 1
      from public.employees report
      join public.employees manager on manager.profile_id=(select auth.uid())
      where report.id=purchase_requests.employee_id
        and report.organisation_id=purchase_requests.organisation_id
        and report.manager_id=manager.id
    )
  )
);

-- Explicit Data API grants are required for newly exposed tables.
grant select on public.deleted_records to authenticated;

commit;
