-- SAS People: granular Book Library permission keys.
--
-- Deliberately not auto-granted to any role via role_permissions -- these are meant to be assigned
-- per user (any account type, including plain employees) through the existing "Edit access" dialog
-- in User & Account Management (app/account-management-page.tsx), which already lists every row in
-- public.permissions as a togglable checkbox and saves via the existing set_user_access RPC. System
-- administrators and anyone already holding documents.verify or settings.manage keep full access
-- regardless (see supabase/migrations/20260805120000_book_library.sql RLS policies).

insert into public.permissions(key, description) values
('library.view', 'View the Book Library catalog'),
('library.create', 'Add new books to the Book Library'),
('library.edit', 'Edit, archive or restore books in the Book Library'),
('library.upload', 'Upload cover images and content files to the Book Library')
on conflict(key) do update set description = excluded.description;
