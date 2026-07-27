-- SAS People: organisation-scoped master data, dynamic settings and approval workflows.
-- Applied to production through the connected Supabase project and committed here for reproducibility.

create table if not exists public.master_data (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  data_type text not null,
  name text not null,
  description text,
  code text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, data_type, name)
);

create index if not exists master_data_org_type_status_idx
  on public.master_data (organisation_id, data_type, status, sort_order, name);

alter table public.master_data enable row level security;

drop policy if exists "organisation members read master data" on public.master_data;
create policy "organisation members read master data"
on public.master_data for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());

drop policy if exists "authorised users manage master data" on public.master_data;
create policy "authorised users manage master data"
on public.master_data for all to authenticated
using (
  organisation_id = current_organisation_id() and is_active_user() and
  (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage') or has_permission('documents.verify'))
)
with check (
  organisation_id = current_organisation_id() and is_active_user() and
  (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage') or has_permission('documents.verify'))
);

grant select, insert, update, delete on public.master_data to authenticated;

-- Shared departments: all active organisation members read; authorised HR/admin/manager roles manage.
drop policy if exists "system administrators manage departments" on public.departments;
drop policy if exists "organisation members read departments" on public.departments;
drop policy if exists "authorised users manage departments" on public.departments;
create policy "organisation members read departments"
on public.departments for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());
create policy "authorised users manage departments"
on public.departments for all to authenticated
using (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage')))
with check (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage')));
grant select, insert, update, delete on public.departments to authenticated;

-- Shared branches.
drop policy if exists "administrators manage branches" on public.branches;
drop policy if exists "organisation members read branches" on public.branches;
drop policy if exists "authorised users manage branches" on public.branches;
create policy "organisation members read branches"
on public.branches for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());
create policy "authorised users manage branches"
on public.branches for all to authenticated
using (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage')))
with check (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('departments.manage') or has_permission('settings.manage')));
grant select, insert, update, delete on public.branches to authenticated;

-- Settings are readable by all active members so branding, theme and locale apply everywhere.
drop policy if exists "permission based settings access" on public.system_settings;
drop policy if exists "system administrators manage system_settings" on public.system_settings;
drop policy if exists "organisation members read system settings" on public.system_settings;
drop policy if exists "authorised users manage system settings" on public.system_settings;
create policy "organisation members read system settings"
on public.system_settings for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());
create policy "authorised users manage system settings"
on public.system_settings for all to authenticated
using (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('settings.manage')))
with check (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('settings.manage')));
grant select, insert, update, delete on public.system_settings to authenticated;

-- HR and admins can edit document and letter templates.
alter table public.document_templates add column if not exists description text;
alter table public.document_templates add column if not exists category text default 'general';
alter table public.document_templates add column if not exists header_content text;
alter table public.document_templates add column if not exists footer_content text;
alter table public.document_templates add column if not exists template_css text;
alter table public.document_templates add column if not exists merge_fields jsonb not null default '[]'::jsonb;
alter table public.document_templates add column if not exists version integer not null default 1;
alter table public.document_templates add column if not exists primary_colour text;
alter table public.document_templates add column if not exists secondary_colour text;
alter table public.document_templates add column if not exists background_colour text;

drop policy if exists "document managers manage templates" on public.document_templates;
drop policy if exists "organisation reads document templates" on public.document_templates;
create policy "organisation reads document templates"
on public.document_templates for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());
create policy "document managers manage templates"
on public.document_templates for all to authenticated
using (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('documents.verify') or has_permission('settings.manage')))
with check (organisation_id = current_organisation_id() and is_active_user() and (is_system_admin() or has_permission('documents.verify') or has_permission('settings.manage')));

-- Employee edits remain approval requests; employees never update protected employee rows directly.
create or replace function public.review_employee_change_request(request_id uuid, decision text, note text default null)
returns public.employee_change_requests
language plpgsql
security invoker
set search_path = public
as $$
declare
  request_row public.employee_change_requests;
  target_profile uuid;
begin
  if not (is_system_admin() or has_permission('employees.update')) then
    raise exception 'Not authorised';
  end if;
  if decision not in ('approved','rejected') then raise exception 'Invalid decision'; end if;
  select * into request_row from public.employee_change_requests
   where id=request_id and organisation_id=current_organisation_id() and status='pending' for update;
  if request_row.id is null then raise exception 'Pending request not found'; end if;
  if decision='approved' then
    if request_row.field_name not in ('first_name','middle_name','last_name','preferred_name','phone','personal_email','residential_address','digital_address','emergency_contact_name','emergency_contact_phone','emergency_contact_relationship','skills','qualifications','biography','linkedin_url','passport_photo_path') then
      raise exception 'Field is not employee-editable';
    end if;
    execute format('update public.employees set %I=$1, updated_at=now() where id=$2 and organisation_id=$3',request_row.field_name)
      using request_row.new_value,request_row.employee_id,request_row.organisation_id;
  end if;
  update public.employee_change_requests set status=decision,reviewed_by=auth.uid(),reviewed_at=now(),review_note=note,updated_at=now() where id=request_id returning * into request_row;
  select profile_id into target_profile from public.employees where id=request_row.employee_id;
  if target_profile is not null then
    insert into public.notifications(organisation_id,recipient_id,title,body,category)
    values(request_row.organisation_id,target_profile,'Profile change '||decision,coalesce(note,'Your profile change request was '||decision||'.'),'profile_change');
  end if;
  return request_row;
end $$;
revoke all on function public.review_employee_change_request(uuid,text,text) from public;
grant execute on function public.review_employee_change_request(uuid,text,text) to authenticated;

-- Chat view exposes usernames and display names without weakening message RLS.
create or replace view public.chat_messages_with_sender with (security_invoker=true) as
select m.*, p.username as sender_username, p.display_name as sender_display_name
from public.chat_messages m join public.profiles p on p.id=m.sender_id;
grant select on public.chat_messages_with_sender to authenticated;

-- Realtime shared configuration and communication tables.
do $$ declare t text; begin
  foreach t in array array['departments','branches','master_data','system_settings','document_templates','employee_change_requests','chat_messages','notifications'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;
