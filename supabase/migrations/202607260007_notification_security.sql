drop policy if exists "organisation access notification_preferences" on public.notification_preferences;
create policy "users read own notification preferences" on public.notification_preferences for select
using(profile_id=auth.uid() and public.is_active_user());
create policy "users update own notification preferences" on public.notification_preferences for update
using(profile_id=auth.uid() and public.is_active_user())
with check(profile_id=auth.uid() and organisation_id=public.current_organisation_id());

drop policy if exists "administrator manage notification_preferences" on public.notification_preferences;
create policy "administrators manage notification preferences" on public.notification_preferences for all
using(public.is_system_admin()) with check(organisation_id=public.current_organisation_id() and public.is_system_admin());

create policy "users mark own notifications read" on public.notifications for update
using(recipient_id=auth.uid() and public.is_active_user())
with check(recipient_id=auth.uid() and organisation_id=public.current_organisation_id());

drop policy if exists "organisation access backup_records" on public.backup_records;
create policy "backup managers read backup records" on public.backup_records for select
using(organisation_id=public.current_organisation_id() and public.has_permission('backups.manage'));
