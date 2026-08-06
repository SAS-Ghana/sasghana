-- Adds approximate login location (city/region/country) to the audit trail, and best-effort
-- device/IP capture on record-level edits (previously only login events carried a user agent).
--
-- Location is resolved client-side at login time and passed to record_login_event. Edit-trail
-- entries read best-effort request headers forwarded by the API layer.

alter table public.audit_logs
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text;

create or replace function public.record_login_event(
  login_name text,
  was_successful boolean,
  client_agent text default null,
  p_ip_address text default null,
  p_city text default null,
  p_region text default null,
  p_country text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target public.profiles%rowtype;
begin
  select p.*
    into target
  from public.profiles p
  where lower(p.username) = lower(trim(login_name))
     or lower(p.email) = lower(trim(login_name))
  limit 1;

  if target.id is null then
    return;
  end if;

  insert into public.audit_logs(
    organisation_id,
    actor_id,
    action,
    resource,
    resource_id,
    outcome,
    user_agent,
    ip_address,
    city,
    region,
    country,
    metadata
  )
  values(
    target.organisation_id,
    case when was_successful then target.id else null end,
    case when was_successful then 'auth.login_succeeded' else 'auth.login_failed' end,
    'profiles',
    target.id,
    case when was_successful then 'success' else 'failed' end,
    left(client_agent, 500),
    nullif(p_ip_address, '')::inet,
    nullif(p_city, ''),
    nullif(p_region, ''),
    nullif(p_country, ''),
    jsonb_build_object('username', target.username, 'email', target.email)
  );

  if was_successful then
    update public.profiles
       set last_login_at = now()
     where id = target.id;
  end if;
end
$$;

grant execute on function public.record_login_event(text, boolean, text, text, text, text, text)
  to anon, authenticated;

-- PostgreSQL does not allow CREATE OR REPLACE VIEW to rename or reposition existing columns.
-- Recreate the view explicitly so metadata and created_at retain their names and positions while
-- the new location fields are appended safely.
drop view if exists public.admin_activity_feed;

create view public.admin_activity_feed
with (security_invoker = true)
as
select
  a.id,
  a.organisation_id,
  a.actor_id,
  p.display_name as actor_name,
  p.username as actor_username,
  p.account_type,
  a.action,
  a.resource,
  a.resource_id,
  a.outcome,
  a.ip_address,
  a.user_agent,
  a.session_id,
  a.metadata,
  a.created_at,
  a.city,
  a.region,
  a.country
from public.audit_logs a
left join public.profiles p on p.id = a.actor_id;

grant select on public.admin_activity_feed to authenticated;

create or replace function public.audit_employee_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  req_agent text;
  req_ip text;
begin
  begin
    req_agent := left(current_setting('request.header.user-agent', true), 500);
  exception when others then
    req_agent := null;
  end;

  begin
    req_ip := split_part(current_setting('request.header.x-forwarded-for', true), ',', 1);
  exception when others then
    req_ip := null;
  end;

  insert into public.audit_logs(
    organisation_id,
    actor_id,
    action,
    resource,
    resource_id,
    outcome,
    user_agent,
    ip_address,
    metadata
  )
  values(
    new.organisation_id,
    auth.uid(),
    'employee_updated',
    'employees',
    new.id,
    'success',
    req_agent,
    nullif(trim(req_ip), '')::inet,
    jsonb_build_object(
      'changed_fields',
      (
        select coalesce(jsonb_agg(key), '[]'::jsonb)
        from jsonb_each(to_jsonb(new)) n
        where n.value is distinct from (to_jsonb(old) -> n.key)
      )
    )
  );

  return new;
end
$$;

drop trigger if exists audit_employee_changes_trigger on public.employees;
create trigger audit_employee_changes_trigger
after update on public.employees
for each row execute function public.audit_employee_changes();
