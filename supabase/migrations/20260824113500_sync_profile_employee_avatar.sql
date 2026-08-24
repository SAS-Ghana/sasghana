-- Keep the authenticated profile avatar and linked employee avatar aligned so the same
-- photo is available in dashboard headers, sidebars, account chips and My Profile.

-- Backfill profiles that are still missing an avatar but have one on the employee record.
update public.profiles p
set avatar_path = e.avatar_path
from public.employees e
where e.profile_id = p.id
  and nullif(trim(coalesce(e.avatar_path, '')), '') is not null
  and nullif(trim(coalesce(p.avatar_path, '')), '') is null;

create or replace function public.sync_employee_avatar_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.profile_id is not null
     and new.avatar_path is distinct from old.avatar_path then
    update public.profiles
    set avatar_path = new.avatar_path
    where id = new.profile_id
      and avatar_path is distinct from new.avatar_path;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_employee_avatar_to_profile on public.employees;
create trigger trg_sync_employee_avatar_to_profile
after update of avatar_path on public.employees
for each row execute function public.sync_employee_avatar_to_profile();

create or replace function public.sync_profile_avatar_to_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar_path is distinct from old.avatar_path then
    update public.employees
    set avatar_path = new.avatar_path
    where profile_id = new.id
      and avatar_path is distinct from new.avatar_path;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_avatar_to_employee on public.profiles;
create trigger trg_sync_profile_avatar_to_employee
after update of avatar_path on public.profiles
for each row execute function public.sync_profile_avatar_to_employee();

notify pgrst, 'reload schema';
