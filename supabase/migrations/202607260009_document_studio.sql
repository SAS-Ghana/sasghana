create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  name text not null,
  template_type text not null,
  subject text,
  content text not null,
  signature_path text,
  status text not null default 'active',
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organisation_id,name)
);

create table if not exists public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  template_id uuid references public.document_templates(id),
  employee_id uuid references public.employees(id),
  payroll_record_id uuid references public.payroll_records(id),
  title text not null,
  rendered_content text not null,
  signature_path text,
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

alter table public.document_templates enable row level security;
alter table public.generated_documents enable row level security;
create policy "organisation reads document templates" on public.document_templates for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "document managers manage templates" on public.document_templates for all
using(organisation_id=public.current_organisation_id() and (public.has_permission('documents.verify') or public.is_system_admin()))
with check(organisation_id=public.current_organisation_id() and (public.has_permission('documents.verify') or public.is_system_admin()));
create policy "organisation reads generated documents" on public.generated_documents for select
using(organisation_id=public.current_organisation_id() and public.is_active_user());
create policy "document managers generate documents" on public.generated_documents for insert
with check(organisation_id=public.current_organisation_id() and (public.has_permission('documents.verify') or public.is_system_admin()));

insert into public.document_templates(organisation_id,name,template_type,subject,content)
select o.id,t.name,t.template_type,t.subject,t.content from public.organisations o cross join(values
('SAS Appointment Letter','appointment_letter','Appointment as {{employee.position_title}}',
'{{today}}

Dear {{employee.full_name}},

APPOINTMENT AS {{employee.position_title}}

We are pleased to confirm your appointment with SAS Finance Group Ghana as {{employee.position_title}}, commencing on {{employee.start_date}}.

Your employment is governed by your employment contract, SAS policies, confidentiality obligations, and applicable Ghanaian law.

We welcome you to SAS Finance Group Ghana and look forward to your contribution.

For: SAS Finance Group Ghana

Authorised Signatory'),
('SAS Payroll Payslip','payslip','Payslip for {{payroll.pay_period}}',
'Employee: {{employee.full_name}}
Employee ID: {{employee.employee_number}}
Pay period: {{payroll.pay_period}}

Basic salary: {{payroll.basic_salary}}
Allowances: {{payroll.allowances}}
PAYE tax: {{payroll.paye_tax}}
Employee SSNIT: {{payroll.employee_ssnit}}
Tier 1: {{payroll.tier_one}}
Tier 2: {{payroll.tier_two}}
Tier 3: {{payroll.tier_three}}
Net pay: {{payroll.net_pay}}')
)t(name,template_type,subject,content)
where o.name='SAS Finance Group Ghana'
on conflict(organisation_id,name) do nothing;
