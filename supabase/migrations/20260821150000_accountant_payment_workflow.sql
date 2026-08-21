-- SAS Finance Group: Accountant payment workflow
-- Manager approval -> Accounts payment -> Procurement action.

alter table public.purchase_requests
  add column if not exists accounts_reviewed_by uuid references public.profiles(id),
  add column if not exists accounts_reviewed_at timestamptz,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_reference text,
  add column if not exists payment_paid_by uuid references public.profiles(id),
  add column if not exists payment_paid_at timestamptz;

alter table public.expense_claims
  add column if not exists finance_reviewed_by uuid references public.profiles(id),
  add column if not exists finance_reviewed_at timestamptz,
  add column if not exists finance_comment text,
  add column if not exists payment_reference text,
  add column if not exists paid_by uuid references public.profiles(id),
  add column if not exists paid_at timestamptz;

alter table public.petty_cash_requests
  add column if not exists accounts_reviewed_by uuid references public.profiles(id),
  add column if not exists accounts_reviewed_at timestamptz,
  add column if not exists accounts_comment text,
  add column if not exists payment_reference text,
  add column if not exists issued_by uuid references public.profiles(id),
  add column if not exists issued_at timestamptz;

create or replace function public.is_accountant(p_profile_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.user_roles ur
    join public.roles r on r.id=ur.role_id
    where ur.profile_id=p_profile_id
      and lower(r.name) in ('accountant','finance officer','payroll officer')
  ) or exists(
    select 1 from public.user_permissions up
    join public.permissions p on p.id=up.permission_id
    where up.profile_id=p_profile_id and p.key like 'accounts.%'
  ) or exists(
    select 1 from public.user_permission_overrides uo
    join public.permissions p on p.id=uo.permission_id
    where uo.profile_id=p_profile_id and uo.granted and p.key like 'accounts.%'
  );
$$;

grant execute on function public.is_accountant(uuid) to authenticated;

create or replace function public.notify_role_members(
  p_organisation_id uuid,
  p_role_name text,
  p_title text,
  p_body text,
  p_category text,
  p_action_url text default null
) returns void
language plpgsql security definer set search_path=public
as $$
begin
  insert into public.notifications(organisation_id,recipient_id,title,body,category,priority,action_url)
  select p_organisation_id,ur.profile_id,p_title,p_body,p_category,'high',p_action_url
  from public.user_roles ur
  join public.roles r on r.id=ur.role_id
  join public.profiles pr on pr.id=ur.profile_id
  where pr.organisation_id=p_organisation_id
    and lower(r.name)=lower(p_role_name)
    and pr.status in ('active','password_change_required');
end;
$$;

create or replace function public.route_purchase_to_accounts()
returns trigger
language plpgsql security definer set search_path=public
as $$
begin
  if old.status='pending_manager'
     and new.status='pending_procurement'
     and new.accounts_reviewed_at is null then
    new.status := 'accounts_review';
    new.current_stage := 'accounts';
    new.payment_status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_route_purchase_to_accounts on public.purchase_requests;
create trigger trg_route_purchase_to_accounts
before update on public.purchase_requests
for each row execute function public.route_purchase_to_accounts();

create or replace function public.notify_accounts_on_purchase()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare v_manager_name text;
begin
  if new.status='accounts_review' and old.status is distinct from new.status then
    select display_name into v_manager_name from public.profiles where id=new.manager_reviewed_by;
    perform public.notify_role_members(
      new.organisation_id,'Accountant','Purchase request awaiting payment',
      coalesce(new.request_number,'Purchase request')||' — '||new.title||
      ' approved by '||coalesce(v_manager_name,'Manager')||' is ready for Accounts review.',
      'accounts','Purchase Approvals'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_accounts_on_purchase on public.purchase_requests;
create trigger trg_notify_accounts_on_purchase
after update on public.purchase_requests
for each row execute function public.notify_accounts_on_purchase();

create or replace function public.process_purchase_request_accounts(
  p_request_id uuid,
  p_action text,
  p_comment text default null,
  p_payment_reference text default null
) returns public.purchase_requests
language plpgsql security definer set search_path=public
as $$
declare
  v_row public.purchase_requests;
  v_actor uuid := auth.uid();
  v_manager_name text;
  v_requester_name text;
begin
  if not public.is_accountant(v_actor) and not exists(
    select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
    where ur.profile_id=v_actor and r.name='SAS System Administrator'
  ) then raise exception 'Accounts permission required'; end if;

  select * into v_row from public.purchase_requests where id=p_request_id for update;
  if not found then raise exception 'Purchase request not found'; end if;
  if v_row.status<>'accounts_review' then raise exception 'Purchase request is not awaiting Accounts'; end if;

  select display_name into v_manager_name from public.profiles where id=v_row.manager_reviewed_by;
  select display_name into v_requester_name from public.profiles where id=v_row.requested_by;

  if p_action='pay_and_send' then
    update public.purchase_requests
      set status='pending_procurement',current_stage='procurement',accounts_comment=p_comment,
          accounts_reviewed_by=v_actor,accounts_reviewed_at=now(),payment_status='paid',
          payment_reference=nullif(trim(p_payment_reference),''),payment_paid_by=v_actor,payment_paid_at=now(),updated_at=now()
      where id=p_request_id returning * into v_row;
    perform public.notify_role_members(
      v_row.organisation_id,'Procurement Officer','Purchase request funded and ready for Procurement',
      coalesce(v_row.request_number,'Purchase request')||' — '||v_row.title||
      ' was approved by '||coalesce(v_manager_name,'Manager')||' and paid by Accounts.',
      'procurement','Procurement Review'
    );
  elsif p_action='return' then
    update public.purchase_requests
      set status='pending_manager',current_stage='manager',accounts_comment=p_comment,
          accounts_reviewed_by=v_actor,accounts_reviewed_at=now(),payment_status='returned',updated_at=now()
      where id=p_request_id returning * into v_row;
  elsif p_action='reject' then
    update public.purchase_requests
      set status='denied',current_stage='closed',accounts_comment=p_comment,
          accounts_reviewed_by=v_actor,accounts_reviewed_at=now(),payment_status='rejected',updated_at=now()
      where id=p_request_id returning * into v_row;
  else
    raise exception 'Unsupported accounts action';
  end if;

  insert into public.audit_logs(organisation_id,actor_id,action,resource,resource_id,outcome,metadata)
  values(v_row.organisation_id,v_actor,'accounts_'||p_action,'purchase_requests',v_row.id,'success',
    jsonb_build_object('request_number',v_row.request_number,'manager_approved_by',v_manager_name,'payment_reference',p_payment_reference));

  insert into public.webhook_events(organisation_id,event_type,aggregate_type,aggregate_id,payload)
  values(v_row.organisation_id,'purchase_request.accounts_'||p_action,'purchase_request',v_row.id,
    jsonb_build_object('request_number',v_row.request_number,'status',v_row.status,
      'payment_status',v_row.payment_status,'manager_approved_by',v_manager_name,'requester',v_requester_name));
  return v_row;
end;
$$;

grant execute on function public.process_purchase_request_accounts(uuid,text,text,text) to authenticated;

-- Ensure the Accountant role carries the finance permissions already defined by SAS People.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where lower(r.name)='accountant'
  and p.key in (
    'accounts.view','accounts.create','accounts.edit','accounts.approve','accounts.manage',
    'payroll.run','payroll.approve','payroll.publish','tax.manage','budget.manage',
    'pettycash.manage','expenses.approve','procurement.view'
  )
on conflict do nothing;