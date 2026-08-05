-- SAS People: baseline master_data reference values and 2027 Ghana public holidays.
--
-- public.master_data (added in 20260727143000_dynamic_master_data_settings_rls.sql) powers the
-- dropdown lists on Settings > Master data, Expense categories, Leave types, etc. (see
-- app/settings-configuration-page.tsx and app/expense-management-page.tsx), but no migration has
-- ever inserted a row into it -- on a fresh organisation every one of those dropdowns is empty.
-- This migration seeds sensible starting values for the generic HR categories every organisation
-- needs, scoped to the existing "SAS Finance Group Ghana" organisation, idempotent via
-- ON CONFLICT on the table's (organisation_id, data_type, name) unique constraint.
--
-- Deliberately NOT seeded: master_data types "branch", "office_location" and "skill" -- these are
-- business-specific values that must come from SAS Finance Group, not be guessed.
--
-- This file is not applied automatically. Review it, then run `supabase db push` (or paste it into
-- the Supabase SQL editor) against the project yourself.

insert into public.master_data (organisation_id, data_type, name, description, sort_order, status)
select o.id, v.data_type, v.name, v.description, v.sort_order, 'active'
from public.organisations o
cross join (values
  ('job_title','Managing Director','Executive leadership',1),
  ('job_title','Finance Manager','Finance department leadership',2),
  ('job_title','Financial Analyst','Financial planning and analysis',3),
  ('job_title','Accountant','General accounting',4),
  ('job_title','Payroll Officer','Payroll processing and compliance',5),
  ('job_title','HR Manager','Human resources leadership',6),
  ('job_title','HR Officer','Human resources administration',7),
  ('job_title','Operations Manager','Operations leadership',8),
  ('job_title','Administrator','General administration',9),
  ('job_title','Software Engineer','Systems and applications development',10),

  ('employment_type','Full-time',null,1),
  ('employment_type','Part-time',null,2),
  ('employment_type','Contract',null,3),
  ('employment_type','Internship',null,4),
  ('employment_type','Temporary',null,5),

  ('document_category','Contract',null,1),
  ('document_category','Policy',null,2),
  ('document_category','Certificate',null,3),
  ('document_category','Identification',null,4),
  ('document_category','Payslip',null,5),
  ('document_category','Letter',null,6),
  ('document_category','Other',null,7),

  ('asset_category','Laptop',null,1),
  ('asset_category','Desktop Computer',null,2),
  ('asset_category','Monitor',null,3),
  ('asset_category','Mobile Phone',null,4),
  ('asset_category','SIM Card',null,5),
  ('asset_category','Access Card',null,6),
  ('asset_category','Furniture',null,7),
  ('asset_category','Vehicle',null,8),
  ('asset_category','Other Equipment',null,9),

  ('leave_category','Annual Leave',null,1),
  ('leave_category','Sick Leave',null,2),
  ('leave_category','Maternity Leave',null,3),
  ('leave_category','Paternity Leave',null,4),
  ('leave_category','Compassionate Leave',null,5),
  ('leave_category','Study Leave',null,6),
  ('leave_category','Unpaid Leave',null,7),

  ('employee_category','Permanent',null,1),
  ('employee_category','Probationary',null,2),
  ('employee_category','Contract',null,3),
  ('employee_category','National Service',null,4),
  ('employee_category','Intern',null,5),

  ('education_level','Basic Education Certificate (BECE)',null,1),
  ('education_level','Senior High School (WASSCE)',null,2),
  ('education_level','Diploma / HND',null,3),
  ('education_level','Bachelor''s Degree',null,4),
  ('education_level','Master''s Degree',null,5),
  ('education_level','Doctorate',null,6),
  ('education_level','Professional Certification',null,7)
) as v(data_type, name, description, sort_order)
where o.name = 'SAS Finance Group Ghana'
on conflict (organisation_id, data_type, name) do nothing;

-- public.company_holidays already has the 2026 Ghana calendar seeded in
-- 202607270002_performance_onboarding_calendar.sql. Extend it into 2027 so the calendar and
-- attendance/leave conflict checks keep working past year end. Farmers' Day is the first Friday of
-- December; the 2027-12-03 date below is calculated, not gazetted -- verify against the official
-- Ghana public holiday gazette before relying on it for payroll or attendance cut-offs.
insert into public.company_holidays(organisation_id, name, holiday_date, source)
select o.id, h.name, h.holiday_date, 'ghana_seed' from public.organisations o cross join (values
  ('New Year''s Day','2027-01-01'::date),('Constitution Day','2027-01-07'::date),
  ('Independence Day','2027-03-06'::date),('May Day','2027-05-01'::date),
  ('Africa Day','2027-05-25'::date),('Republic Day','2027-07-01'::date),
  ('Founders'' Day','2027-08-04'::date),('Kwame Nkrumah Memorial Day','2027-09-21'::date),
  ('Farmers'' Day','2027-12-03'::date),('Christmas Day','2027-12-25'::date),
  ('Boxing Day','2027-12-26'::date)
) h(name, holiday_date)
where o.name = 'SAS Finance Group Ghana'
on conflict do nothing;
