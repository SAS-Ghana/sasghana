-- Keep internal trigger and maintenance routines out of the exposed REST RPC surface.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn.signature);
  end loop;
end $$;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.insert_user_notification(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.generate_people_calendar_notifications() from public, anon, authenticated;
revoke execute on function public.purge_expired_chat_messages() from public, anon, authenticated;
revoke execute on function public.record_login_event(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.current_organisation_id() from anon;

-- Only aggregate values leave the database. As SECURITY INVOKER, normal RLS still applies.
create or replace function public.get_ai_assistant_context()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'employees', (select count(*) from public.employees),
    'pending_leave', (select count(*) from public.leave_requests where status = 'pending'),
    'expense_actions', (select count(*) from public.expense_claims where status in ('submitted','manager_approved','hr_approved','finance_review','returned')),
    'open_tasks', (select count(*) from public.tasks where status not in ('completed','closed','resolved','rejected','cancelled','archived')),
    'training_due', (select count(*) from public.employee_training where status not in ('completed','closed','resolved','rejected','cancelled','archived')),
    'reviews_due', (select count(*) from public.performance_reviews where status not in ('completed','closed','resolved','rejected','cancelled','archived')),
    'onboarding_active', (select count(*) from public.employee_onboarding where status not in ('completed','closed','resolved','rejected','cancelled','archived')),
    'open_tickets', (select count(*) from public.support_tickets where status not in ('completed','closed','resolved','rejected','cancelled','archived')),
    'expiring_documents', (select count(*) from public.employee_documents where expiry_date between current_date and current_date + 30),
    'payroll_drafts', (select count(*) from public.payroll_records where status in ('draft','calculated','approved')),
    'asset_requests', (select count(*) from public.asset_requests where status not in ('completed','closed','resolved','rejected','cancelled','archived','fulfilled')),
    'active_benefits', (select count(*) from public.employee_benefits where status = 'active'),
    'published_announcements', (select count(*) from public.announcements where status = 'published'),
    'refreshed_at', now()
  );
$$;

revoke all on function public.get_ai_assistant_context() from public, anon;
grant execute on function public.get_ai_assistant_context() to authenticated;
