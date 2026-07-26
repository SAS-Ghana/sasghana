insert into public.permissions(key,description) values
('community.view','View employee community posts'),
('meetings.view','View assigned meetings'),
('benefits.view_self','View own benefits'),
('hiring.view','View open vacancies and candidate stages')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where
  (r.name='Human Resources Administrator' and p.key in
    ('hiring.manage','benefits.manage','compensation.manage','community.manage','community.view','meetings.manage','meetings.view'))
  or (r.name='HR Officer' and p.key in
    ('hiring.manage','benefits.manage','community.manage','community.view','meetings.manage','meetings.view'))
  or (r.name in ('Department Head','Line Manager') and p.key in
    ('community.view','meetings.manage','meetings.view','hiring.view'))
  or (r.name='Employee' and p.key in
    ('community.view','meetings.view','benefits.view_self','hiring.view'))
  or (r.name in ('Auditor','Compliance Officer') and p.key in ('community.view','meetings.view'))
on conflict do nothing;
