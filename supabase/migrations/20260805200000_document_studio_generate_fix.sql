-- DocumentStudio.generate() has always inserted template_id/generated_content into
-- public.employee_documents, but those columns only ever existed on the separate, unused
-- generated_documents table from the same original migration -- every "Generate" click has been
-- failing with a column-does-not-exist error. Adding the columns to employee_documents (the table the
-- app actually writes to) preserves the intended feature instead of just dropping the fields.

alter table public.employee_documents add column if not exists template_id uuid references public.document_templates(id);
alter table public.employee_documents add column if not exists generated_content text;
