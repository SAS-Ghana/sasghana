-- Ensure manager-like roles never land on the generic Dashboard route.
update public.profiles p
set preferred_dashboard = 'Manager Dashboard'
where coalesce(p.preferred_dashboard, '') in ('', 'Dashboard')
  and (
    lower(coalesce(p.account_type,'')) = 'manager'
    or exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.profile_id = p.id
        and lower(r.name) ~ '(manager|supervisor|team lead|department head|accountant|finance officer|payroll officer)'
    )
  );

create or replace function public.normalize_dashboard_preference_for_profile(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  select case
    when lower(coalesce(p.account_type,'')) = 'administrator'
      or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=p.id and r.name='SAS System Administrator')
      then 'Administrator Dashboard'
    when lower(coalesce(p.account_type,'')) = 'hr'
      or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=p.id and lower(r.name) ~ '(human resources|(^|\W)hr(\W|$))')
      then 'HR Dashboard'
    when lower(coalesce(p.account_type,'')) in ('manager','accountant')
      or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=p.id and lower(r.name) ~ '(manager|supervisor|team lead|department head|accountant|finance officer|payroll officer)')
      then 'Manager Dashboard'
    when lower(coalesce(p.account_type,'')) = 'auditor'
      or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=p.id and lower(r.name) ~ '(auditor|read only)')
      then 'Audit Dashboard'
    else 'My Info'
  end
  into v_mode
  from public.profiles p
  where p.id = p_profile_id;

  update public.profiles
  set preferred_dashboard = v_mode
  where id = p_profile_id
    and coalesce(preferred_dashboard,'') in ('', 'Dashboard');
end;
$$;

grant execute on function public.normalize_dashboard_preference_for_profile(uuid) to authenticated;

create or replace function public.normalize_dashboard_preference_on_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.normalize_dashboard_preference_for_profile(coalesce(new.profile_id, old.profile_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_normalize_dashboard_preference_user_roles on public.user_roles;
create trigger trg_normalize_dashboard_preference_user_roles
after insert or update or delete on public.user_roles
for each row execute function public.normalize_dashboard_preference_on_role_change();

notify pgrst, 'reload schema';
