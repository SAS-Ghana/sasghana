-- Keep the employee-facing account email synchronized without breaking username
-- authentication. Supabase Auth must always receive auth.users.email, even when
-- profiles.email is the employee's newer work/contact email.
create or replace function public.resolve_login_email(login_name text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $function$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(login_name))
     or lower(p.email) = lower(trim(login_name))
     or lower(u.email) = lower(trim(login_name))
  limit 1
$function$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;
