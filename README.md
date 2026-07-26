# SAS People

Private employee management and onboarding portal for SAS Finance Group Ghana.

## Run locally

1. Copy `.env.example` to `.env.local` and add the Supabase project URL and anon key.
2. Run `npm install`.
3. Run `npm run dev`.

Public registration must remain disabled. Privileged account operations belong in Supabase Edge Functions and must never expose a service-role key to the browser.

## Validation

Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build`.

## Deployment

The web app is configured for direct-route fallback on Vercel. Set only public `VITE_*` values in the client environment. Keep service-role, mail, GitHub, and deployment credentials in their respective secret stores.
