drop policy if exists "system administrators manage profiles" on public.profiles;
create policy "system administrators manage profiles" on public.profiles for all
using(public.is_system_admin())
with check(organisation_id=public.current_organisation_id() and public.is_system_admin());
