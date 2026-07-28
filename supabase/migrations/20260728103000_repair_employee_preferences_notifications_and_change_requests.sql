alter table public.user_preferences add column if not exists created_at timestamptz not null default now();
alter table public.user_preferences add column if not exists text_size text not null default 'medium';
alter table public.user_preferences add column if not exists ui_density text not null default 'comfortable';

do $$ begin
  alter table public.user_preferences add constraint user_preferences_text_size_check check (text_size in ('small','medium','large'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.user_preferences add constraint user_preferences_ui_density_check check (ui_density in ('compact','comfortable'));
exception when duplicate_object then null; end $$;

alter table public.employee_change_requests alter column requested_by set default auth.uid();

alter table public.notifications add column if not exists notification_type text generated always as (category) stored;
alter table public.notifications add column if not exists status text generated always as (case when is_read then 'read' else 'unread' end) stored;

create or replace function public.submit_employee_change_request(p_field_name text,p_new_value text,p_reason text default null)
returns public.employee_change_requests
language plpgsql
security definer
set search_path=public
as $$
declare
  v_profile public.profiles%rowtype;
  v_employee public.employees%rowtype;
  v_row public.employee_change_requests%rowtype;
begin
  select * into v_profile from public.profiles where id=auth.uid();
  if v_profile.id is null or not public.is_active_user() then raise exception 'Active profile required'; end if;
  if v_profile.employee_id is null then raise exception 'Your login is not linked to an employee record'; end if;
  select * into v_employee from public.employees where id=v_profile.employee_id and organisation_id=v_profile.organisation_id;
  if v_employee.id is null then raise exception 'Employee record not found'; end if;
  if coalesce(trim(p_field_name),'')='' or coalesce(trim(p_new_value),'')='' then raise exception 'Field and requested value are required'; end if;
  insert into public.employee_change_requests(organisation_id,employee_id,requested_by,field_name,old_value,new_value,reason,status)
  values(v_profile.organisation_id,v_profile.employee_id,auth.uid(),p_field_name,to_jsonb(v_employee)->>p_field_name,p_new_value,nullif(trim(p_reason),''),'pending')
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.submit_employee_change_request(text,text,text) to authenticated;
create index if not exists user_preferences_updated_at_idx on public.user_preferences(updated_at desc);
create index if not exists notifications_recipient_created_idx on public.notifications(recipient_id,created_at desc);
create index if not exists employee_change_requests_requested_by_idx on public.employee_change_requests(requested_by,created_at desc);