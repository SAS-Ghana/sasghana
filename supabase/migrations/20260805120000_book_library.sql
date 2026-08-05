-- SAS People: Book Library archive for the admin platform.
--
-- A bookshop-style catalog of reference material (policy manuals, finance handbooks, training
-- guides, etc.): title, author, a reference/citation, category, description, and content that is
-- either pasted text or an uploaded file (Word/PDF/image), plus a separate cover image. Status
-- drives the archive workflow the same way announcements/recruitment already use status
-- ('draft' -> 'published' -> 'archived').
--
-- Storage bucket + policies follow the exact pattern already used for employee-media/hr-media in
-- 202607260005_people_experience_payroll.sql. RLS mirrors the existing document_templates policies
-- in 20260727143000_dynamic_master_data_settings_rls.sql (read: any active org member; manage:
-- documents.verify or settings.manage) rather than introducing a new permission key.
--
-- This file is not applied automatically. Review it, then run `supabase db push` (or paste it into
-- the Supabase SQL editor) against the project yourself.

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  author text,
  reference text,
  category text not null default 'general',
  description text,
  content_text text,
  content_path text,
  content_mime text,
  cover_path text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists library_books_org_status_idx
  on public.library_books (organisation_id, status, title);

alter table public.library_books enable row level security;

drop policy if exists "organisation members read library books" on public.library_books;
create policy "organisation members read library books"
on public.library_books for select to authenticated
using (organisation_id = current_organisation_id() and is_active_user());

drop policy if exists "authorised users manage library books" on public.library_books;
create policy "authorised users manage library books"
on public.library_books for all to authenticated
using (
  organisation_id = current_organisation_id() and is_active_user() and
  (is_system_admin() or has_permission('documents.verify') or has_permission('settings.manage'))
)
with check (
  organisation_id = current_organisation_id() and is_active_user() and
  (is_system_admin() or has_permission('documents.verify') or has_permission('settings.manage'))
);

grant select, insert, update, delete on public.library_books to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'library-books', 'library-books', false, 20971520,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "authenticated library books read" on storage.objects;
create policy "authenticated library books read" on storage.objects for select to authenticated
using (bucket_id = 'library-books' and public.is_active_user());

drop policy if exists "authorised users manage library book files" on storage.objects;
create policy "authorised users manage library book files" on storage.objects for all to authenticated
using (
  bucket_id = 'library-books' and
  (public.is_system_admin() or public.has_permission('documents.verify') or public.has_permission('settings.manage'))
)
with check (
  bucket_id = 'library-books' and
  (public.is_system_admin() or public.has_permission('documents.verify') or public.has_permission('settings.manage'))
);

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'library_books') then
    execute 'alter publication supabase_realtime add table public.library_books';
  end if;
end $$;
