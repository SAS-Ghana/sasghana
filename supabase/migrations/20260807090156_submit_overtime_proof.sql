create or replace function public.submit_my_overtime_proof(
  p_request_id uuid,
  p_proof text
)
returns public.attendance_overtime_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.attendance_overtime_requests;
  v_recipient uuid;
begin
  if not public.is_active_user() or public.current_employee_id() is null then
    raise exception 'An active employee account is required';
  end if;
  if nullif(trim(p_proof), '') is null then
    raise exception 'Overtime proof is required';
  end if;

  select * into v_request
  from public.attendance_overtime_requests
  where id = p_request_id
    and organisation_id = public.current_organisation_id()
    and employee_id = public.current_employee_id()
    and status = 'questions'
  for update;

  if not found then
    raise exception 'Overtime request is not available for proof submission';
  end if;

  update public.attendance_overtime_requests
  set employee_proof = trim(p_proof),
      status = 'pending',
      reviewed_by = null,
      reviewed_at = null,
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  for v_recipient in
    select id
    from public.profiles
    where organisation_id = v_request.organisation_id
      and status = 'active'
      and account_type in ('administrator', 'hr')
  loop
    insert into public.notifications(
      organisation_id,
      recipient_id,
      title,
      body,
      category,
      action_url,
      priority
    ) values (
      v_request.organisation_id,
      v_recipient,
      'Overtime proof received',
      'An employee submitted the requested overtime proof. Review the request in Attendance Management.',
      'attendance',
      'Attendance Management',
      'high'
    );
  end loop;

  return v_request;
end;
$$;

revoke all on function public.submit_my_overtime_proof(uuid, text) from public, anon;
grant execute on function public.submit_my_overtime_proof(uuid, text) to authenticated;
