drop policy if exists "organisation members read employee_onboarding" on public.employee_onboarding;
create policy "permission based onboarding access" on public.employee_onboarding for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('onboarding.manage') or public.has_permission('onboarding.review') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read employee_documents" on public.employee_documents;
create policy "permission based document access" on public.employee_documents for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('documents.verify') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read attendance_records" on public.attendance_records;
create policy "permission based attendance access" on public.attendance_records for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('attendance.manage') or public.has_permission('attendance.approve') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read leave_requests" on public.leave_requests;
create policy "permission based leave access" on public.leave_requests for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('leave.manage') or public.has_permission('leave.approve') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read performance_reviews" on public.performance_reviews;
create policy "permission based performance access" on public.performance_reviews for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('performance.manage') or public.has_permission('performance.review_team') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read assets" on public.assets;
create policy "permission based asset access" on public.assets for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('assets.manage') or
    exists(select 1 from public.employees e where e.id = assigned_employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read hr_requests" on public.hr_requests;
create policy "permission based HR request access" on public.hr_requests for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and (
    public.has_permission('employees.view_all') or
    exists(select 1 from public.employees e where e.id = employee_id and e.profile_id = auth.uid())
  )
);

drop policy if exists "organisation members read saved_reports" on public.saved_reports;
create policy "permission based report access" on public.saved_reports for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and public.has_permission('reports.view')
);

drop policy if exists "organisation members read system_settings" on public.system_settings;
create policy "permission based settings access" on public.system_settings for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and public.has_permission('settings.manage')
);

drop policy if exists "organisation members read security_events" on public.security_events;
create policy "permission based security access" on public.security_events for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and
  (public.has_permission('audit.view') or public.has_permission('security.manage'))
);

drop policy if exists "organisation members read notifications" on public.notifications;
create policy "users read own notifications" on public.notifications for select using (
  organisation_id = public.current_organisation_id() and recipient_id = auth.uid() and public.is_active_user()
);

drop policy if exists "organisation members read audit_logs" on public.audit_logs;
create policy "permission based audit access" on public.audit_logs for select using (
  organisation_id = public.current_organisation_id() and public.is_active_user() and public.has_permission('audit.view')
);
