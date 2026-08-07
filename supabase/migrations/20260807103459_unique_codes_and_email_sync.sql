-- Keep human-facing identifiers deterministic and prevent case-only duplicates.
create unique index if not exists employees_number_ci_uidx
  on public.employees (organisation_id, lower(trim(employee_number)));

create unique index if not exists employees_work_email_ci_uidx
  on public.employees (organisation_id, lower(trim(work_email)));

create unique index if not exists assets_code_ci_uidx
  on public.assets (organisation_id, lower(trim(asset_code)));

create unique index if not exists assets_name_ci_uidx
  on public.assets (organisation_id, lower(trim(description)));

create unique index if not exists assets_serial_ci_uidx
  on public.assets (organisation_id, lower(trim(serial_number)))
  where nullif(trim(serial_number), '') is not null;

create or replace function public.assign_automatic_business_codes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  code_prefix text;
  next_number integer;
begin
  if tg_table_name = 'employees' then
    new.employee_number := nullif(trim(new.employee_number), '');
    new.work_email := lower(trim(new.work_email));

    if tg_op = 'INSERT' and new.employee_number is null then
      perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text || ':employee-number', 0));
      select coalesce(max(employee_number::integer), 0) + 1
      into next_number
      from public.employees
      where organisation_id = new.organisation_id
        and employee_number ~ '^[0-9]+$';
      new.employee_number := lpad(next_number::text, 4, '0');
    end if;

    if exists (
      select 1 from public.employees existing
      where existing.organisation_id = new.organisation_id
        and lower(trim(existing.employee_number)) = lower(new.employee_number)
        and existing.id is distinct from new.id
    ) then
      raise exception 'Employee ID % is already in use. Choose another ID.', new.employee_number;
    end if;

    if exists (
      select 1 from public.employees existing
      where existing.organisation_id = new.organisation_id
        and lower(trim(existing.work_email)) = new.work_email
        and existing.id is distinct from new.id
    ) then
      raise exception 'Work email % is already assigned to another employee.', new.work_email;
    end if;
  elsif tg_table_name = 'assets' then
    new.description := trim(new.description);
    new.category := trim(new.category);
    new.serial_number := nullif(trim(new.serial_number), '');
    new.asset_code := nullif(upper(trim(new.asset_code)), '');

    if tg_op = 'INSERT' and new.asset_code is null then
      code_prefix := upper(regexp_replace(new.category, '[^A-Za-z0-9]+', '', 'g'));
      code_prefix := coalesce(nullif(left(code_prefix, 3), ''), 'AST');
      perform pg_advisory_xact_lock(hashtextextended(new.organisation_id::text || ':asset:' || code_prefix, 0));
      next_number := 1;
      while exists (
        select 1 from public.assets existing
        where existing.organisation_id = new.organisation_id
          and lower(existing.asset_code) = lower(code_prefix || '-' || lpad(next_number::text, 4, '0'))
      ) loop
        next_number := next_number + 1;
      end loop;
      new.asset_code := code_prefix || '-' || lpad(next_number::text, 4, '0');
    end if;

    if exists (
      select 1 from public.assets existing
      where existing.organisation_id = new.organisation_id
        and lower(trim(existing.asset_code)) = lower(new.asset_code)
        and existing.id is distinct from new.id
    ) then
      raise exception 'Asset code % is already in use.', new.asset_code;
    end if;

    if exists (
      select 1 from public.assets existing
      where existing.organisation_id = new.organisation_id
        and lower(trim(existing.description)) = lower(new.description)
        and existing.id is distinct from new.id
    ) then
      raise exception 'An asset named % already exists. Use a distinct asset name.', new.description;
    end if;

    if new.serial_number is not null and exists (
      select 1 from public.assets existing
      where existing.organisation_id = new.organisation_id
        and lower(trim(existing.serial_number)) = lower(new.serial_number)
        and existing.id is distinct from new.id
    ) then
      raise exception 'Serial number % is already registered.', new.serial_number;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists employees_assign_business_code on public.employees;
create trigger employees_assign_business_code
before insert or update of employee_number, work_email on public.employees
for each row execute function public.assign_automatic_business_codes();

drop trigger if exists assets_assign_business_code on public.assets;
create trigger assets_assign_business_code
before insert or update of asset_code, category, description, serial_number on public.assets
for each row execute function public.assign_automatic_business_codes();

create or replace function public.sync_employee_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles profile
  set email = lower(trim(new.work_email)),
      updated_at = now()
  where profile.organisation_id = new.organisation_id
    and (profile.employee_id = new.id or profile.id = new.profile_id)
    and profile.email is distinct from lower(trim(new.work_email));
  return new;
end;
$$;

drop trigger if exists employees_sync_profile_email on public.employees;
create trigger employees_sync_profile_email
after insert or update of work_email, profile_id on public.employees
for each row execute function public.sync_employee_profile_email();

update public.profiles profile
set email = lower(trim(employee.work_email)),
    updated_at = now()
from public.employees employee
where profile.organisation_id = employee.organisation_id
  and (profile.employee_id = employee.id or profile.id = employee.profile_id)
  and nullif(trim(employee.work_email), '') is not null
  and profile.email is distinct from lower(trim(employee.work_email));

revoke all on function public.assign_automatic_business_codes() from public, anon, authenticated;
revoke all on function public.sync_employee_profile_email() from public, anon, authenticated;
