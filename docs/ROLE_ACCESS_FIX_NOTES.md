# Role, dashboard and benefit access fixes

The production Supabase project and this repository now include:

- benefit plan management for users with `benefits.manage`
- editable roles after account creation
- editable custom permissions after account creation
- editable dashboard access after account creation
- linked employee record management
- preferred dashboard selection
- personal self-service access for administrators, HR and managers
- organisation-scoped access controls
- icon-based grouped navigation
- direct routing to the modern Settings centre

The account editor saves access through the `set_user_access` security-definer function. The function validates the current administrator or access manager and prevents cross-organisation changes.
