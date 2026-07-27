alter table public.audit_logs
  add column if not exists ip_address inet,
  add column if not exists user_agent text,
  add column if not exists session_id text;

create or replace function public.record_login_event(login_name text, was_successful boolean, client_agent text default null)
returns void language plpgsql security definer set search_path=public,auth as $$
declare target public.profiles%rowtype;
begin
  select p.* into target from public.profiles p
  where lower(p.username)=lower(trim(login_name)) or lower(p.email)=lower(trim(login_name))
  limit 1;
  if target.id is null then return; end if;
  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,user_agent,metadata)
  values(target.organisation_id,case when was_successful then target.id else null end,
    case when was_successful then 'auth.login_succeeded' else 'auth.login_failed' end,
    'profiles',target.id,case when was_successful then 'success' else 'failed' end,
    left(client_agent,500),jsonb_build_object('username',target.username,'email',target.email));
  if was_successful then update public.profiles set last_login_at=now() where id=target.id; end if;
end $$;
grant execute on function public.record_login_event(text,boolean,text) to anon,authenticated;

create or replace view public.admin_activity_feed
with (security_invoker=true) as
select a.id,a.organisation_id,a.actor_id,p.display_name as actor_name,p.username as actor_username,
  p.account_type,a.action,a.resource,a.resource_id,a.outcome,a.ip_address,a.user_agent,a.session_id,
  a.metadata,a.created_at
from public.audit_logs a left join public.profiles p on p.id=a.actor_id;
grant select on public.admin_activity_feed to authenticated;
