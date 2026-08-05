-- app/approval-workflows-page.tsx has read/written public.approval_workflows since it was built, but
-- no migration ever created the table -- every load/save has been failing outright. This is the
-- concrete cause of "Approval Workflows doesn't work." Note this table remains a reference/settings
-- record only; it is not wired into how leave/expense/change-request approvals actually behave (those
-- stay hardcoded in their own tables/RPCs) -- see the simplified page copy for the honest explanation.

create table if not exists public.approval_workflows (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  workflow_type text not null,
  description text,
  status text not null default 'active' check (status in ('active','draft','inactive','archived')),
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.approval_workflows enable row level security;
create index if not exists approval_workflows_org_status_idx on public.approval_workflows(organisation_id, status);

create policy "organisation members read approval workflows" on public.approval_workflows for select
using (organisation_id = public.current_organisation_id() and public.is_active_user());
create policy "workflow managers write approval workflows" on public.approval_workflows for all
using (public.is_system_admin() or public.has_permission('settings.manage'))
with check (public.is_system_admin() or public.has_permission('settings.manage'));
