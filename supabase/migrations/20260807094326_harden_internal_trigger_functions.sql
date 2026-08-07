-- Trigger-only functions do not need to be exposed through PostgREST.
revoke all on function public.calculate_attendance_overtime() from public, anon, authenticated;
revoke all on function public.create_overtime_approval_request() from public, anon, authenticated;
revoke all on function public.notify_task_activity() from public, anon, authenticated;

-- The cutoff is executed by pg_cron/database owners, never directly by a browser client.
revoke all on function public.process_attendance_cutoff() from public, anon, authenticated;
