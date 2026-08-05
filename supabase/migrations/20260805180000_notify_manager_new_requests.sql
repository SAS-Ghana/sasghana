-- notify_employee_workflow() (202607260006_automations.sql) only ever notifies the employee who owns
-- a task/leave record -- nothing tells a manager/HR/admin when an employee submits a new request, so
-- their notification bell looked empty even though the delivery mechanism itself works correctly.
-- This adds the missing "new request submitted" notification, sent to the employee's direct manager.

create or replace function public.notify_manager_of_new_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  recipient uuid;
  requester_name text;
  notification_title text;
  notification_body text;
  notification_category text;
begin
  select mgr.profile_id, trim(concat(e.first_name, ' ', e.last_name))
    into recipient, requester_name
    from public.employees e
    left join public.employees mgr on mgr.id = e.manager_id
    where e.id = new.employee_id;

  if recipient is null then return new; end if;

  if tg_table_name = 'leave_requests' then
    notification_title := 'New leave request';
    notification_body := coalesce(requester_name, 'An employee') || ' submitted a ' || coalesce(new.leave_type, 'leave') || ' request.';
    notification_category := 'leave';
  elsif tg_table_name = 'expense_claims' then
    notification_title := 'New expense claim';
    notification_body := coalesce(requester_name, 'An employee') || ' submitted an expense claim.';
    notification_category := 'expense';
  elsif tg_table_name = 'asset_requests' then
    notification_title := 'New asset request';
    notification_body := coalesce(requester_name, 'An employee') || ' requested an asset.';
    notification_category := 'asset';
  elsif tg_table_name = 'transfer_requests' then
    notification_title := 'New transfer request';
    notification_body := coalesce(requester_name, 'An employee') || ' requested a transfer.';
    notification_category := 'transfer';
  else
    return new;
  end if;

  insert into public.notifications(organisation_id, recipient_id, title, body, category)
  values (new.organisation_id, recipient, notification_title, notification_body, notification_category);
  return new;
end $$;

drop trigger if exists notify_manager_new_leave on public.leave_requests;
create trigger notify_manager_new_leave after insert on public.leave_requests
for each row execute function public.notify_manager_of_new_request();

drop trigger if exists notify_manager_new_expense on public.expense_claims;
create trigger notify_manager_new_expense after insert on public.expense_claims
for each row execute function public.notify_manager_of_new_request();

drop trigger if exists notify_manager_new_asset_request on public.asset_requests;
create trigger notify_manager_new_asset_request after insert on public.asset_requests
for each row execute function public.notify_manager_of_new_request();

drop trigger if exists notify_manager_new_transfer on public.transfer_requests;
create trigger notify_manager_new_transfer after insert on public.transfer_requests
for each row execute function public.notify_manager_of_new_request();
