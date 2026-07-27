# Enterprise UI and self-service rollout

This rollout changes the SAS People experience to a profile-first HR dashboard inspired by the supplied BambooHR reference while preserving SAS colours and organisation settings.

## Navigation

Use `enterpriseNavigation` and `EnterpriseSidebar` in the main application shell. Navigation is grouped by business function and uses icons instead of first-letter placeholders. Visibility remains permission driven.

## Personal services

Every authenticated account linked to an employee record, including administrators, HR users and managers, must have access to:

- My Profile
- Attendance and clock in/out
- Leave requests and balances
- Benefits
- Onboarding and training
- Documents and appointment letters
- Task assignments
- Performance feedback and review comments
- Announcements and comments

Administrative access must not remove self-service access.

## User account editing

The edit account dialog must load and save:

- linked employee record
- roles
- custom permissions
- dashboard access
- account type and status
- job title from dynamic master data
- preferred dashboard
- self-service enabled state

## Settings centre

Wire `SettingsConfigurationPage` into the main shell. The page must use card or tab navigation and persist company identity, colours, document colours, currency, locale and master data through Supabase.

## Master data and dropdowns

Use `DynamicSelect` for every controlled form field. Each dropdown must:

- query organisation master data
- be searchable
- include Other
- show a custom input when Other is selected
- allow HR/Admin to promote a custom value into master data where authorised
- subscribe to realtime changes

## Chat

Read messages from `chat_messages_with_sender` and render `sender_username` or `sender_display_name` rather than a generic Team member label.

## Backups

After a backup is downloaded, call `record_backup_download` with the matching backup record ID, file name and file size. Refresh history immediately.

## RLS

Employees may submit profile change requests but may not directly update protected employee fields. HR/Admin approvals apply the changes and create notifications. Organisation master data remains readable to active users and writable only to authorised HR, managers and administrators.
