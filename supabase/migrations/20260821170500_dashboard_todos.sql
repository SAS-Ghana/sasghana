create table if not exists public.dashboard_todos (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  owner_profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','completed','archived')),
  due_at timestamptz,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  archived_at timestamptz
);

create index if not exists dashboard_todos_owner_idx on public.dashboard_todos(owner_profile_id,status,created_at desc);
create index if not exists dashboard_todos_org_idx on public.dashboard_todos(organisation_id,status,due_at);

create table if not exists public.dashboard_todo_history (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.dashboard_todos(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists dashboard_todo_history_todo_idx on public.dashboard_todo_history(todo_id,created_at desc);

alter table public.dashboard_todos enable row level security;
alter table public.dashboard_todo_history enable row level security;

drop policy if exists dashboard_todos_select_own on public.dashboard_todos;
create policy dashboard_todos_select_own on public.dashboard_todos for select to authenticated
using (owner_profile_id = auth.uid() or created_by = auth.uid());

drop policy if exists dashboard_todos_insert_own on public.dashboard_todos;
create policy dashboard_todos_insert_own on public.dashboard_todos for insert to authenticated
with check (owner_profile_id = auth.uid() and coalesce(created_by, auth.uid()) = auth.uid());

drop policy if exists dashboard_todos_update_own on public.dashboard_todos;
create policy dashboard_todos_update_own on public.dashboard_todos for update to authenticated
using (owner_profile_id = auth.uid() or created_by = auth.uid())
with check (owner_profile_id = auth.uid() or created_by = auth.uid());

drop policy if exists dashboard_todos_delete_own on public.dashboard_todos;
create policy dashboard_todos_delete_own on public.dashboard_todos for delete to authenticated
using (owner_profile_id = auth.uid() or created_by = auth.uid());

drop policy if exists dashboard_todo_history_select_own on public.dashboard_todo_history;
create policy dashboard_todo_history_select_own on public.dashboard_todo_history for select to authenticated
using (exists(select 1 from public.dashboard_todos t where t.id = todo_id and (t.owner_profile_id = auth.uid() or t.created_by = auth.uid())));

create or replace function public.touch_dashboard_todo()
returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at := now();
  if new.status = 'completed' and old.status is distinct from 'completed' then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  if new.status = 'archived' and old.status is distinct from 'archived' then new.archived_at := now(); end if;
  if new.status <> 'archived' then new.archived_at := null; end if;
  return new;
end;$$;

drop trigger if exists trg_touch_dashboard_todo on public.dashboard_todos;
create trigger trg_touch_dashboard_todo before update on public.dashboard_todos for each row execute function public.touch_dashboard_todo();

create or replace function public.log_dashboard_todo_history()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_action text;
begin
  if tg_op = 'INSERT' then v_action := 'created';
  elsif tg_op = 'DELETE' then v_action := 'deleted';
  elsif new.status = 'completed' and old.status is distinct from 'completed' then v_action := 'completed';
  elsif old.status = 'completed' and new.status is distinct from 'completed' then v_action := 'reopened';
  elsif new.status = 'archived' and old.status is distinct from 'archived' then v_action := 'archived';
  else v_action := 'edited'; end if;

  insert into public.dashboard_todo_history(todo_id,organisation_id,actor_profile_id,action,old_data,new_data)
  values(coalesce(new.id,old.id),coalesce(new.organisation_id,old.organisation_id),auth.uid(),v_action,
    case when tg_op='INSERT' then null else to_jsonb(old) end,
    case when tg_op='DELETE' then null else to_jsonb(new) end);
  return coalesce(new,old);
end;$$;

drop trigger if exists trg_dashboard_todo_history on public.dashboard_todos;
create trigger trg_dashboard_todo_history after insert or update or delete on public.dashboard_todos for each row execute function public.log_dashboard_todo_history();

grant select,insert,update,delete on public.dashboard_todos to authenticated;
grant select on public.dashboard_todo_history to authenticated;