# Dynamic settings, master data and RLS rollout

This branch introduces the shared database and frontend foundations for organisation-wide configuration in SAS People.

## Included

- Organisation-scoped RLS for departments, branches, master data, system settings and document templates.
- Reusable `master_data` table for job titles, employment types, leave categories, asset categories, document categories and future options.
- Employee profile-change approval function and notifications.
- Chat view exposing sender username and display name.
- Realtime publication for shared configuration tables.
- Dynamic organisation configuration service for company identity, theme, document colours, currency and locale.
- Reusable dropdown component with an `Other` input path.
- Card-based settings centre covering organisation, appearance, regional settings, master data, documents, working hours, security and backup.

## Required integration follow-up

The application shell should load `OrganisationConfig` after authentication, call `applyOrganisationTheme`, render `SettingsConfigurationPage` for authorised settings users and replace existing hardcoded selects with `DynamicSelect`.

Chat queries should use `chat_messages_with_sender` and display `sender_username` rather than the generic `Team member` label.

Employees must continue to submit changes through `employee_change_requests`; only HR/admin reviewers call `review_employee_change_request`.
