# Supabase beta operations

GymBro's social backend uses Supabase Free only for the real-user beta. Do not treat it as a production availability or backup commitment.

## Configuration and secrets

- Copy `.env.example` locally and set only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Expo embeds `EXPO_PUBLIC_*` values in the client bundle, so they must never contain a service-role key or any private secret.
- Store service-role keys only in Supabase Edge Function secrets or CI. They are never committed, placed in `app.json`, or read by the mobile app.
- Run `npx supabase start`, `npx supabase db reset`, and `npx supabase test db` for the local stack. Link/deploy only after a maintainer configures a hosted project; this work unit performs neither action.

## Beta operations

- Free projects may pause after inactivity and have finite database, egress, and active-user quotas. Assign an operational owner, monitor the Supabase dashboard, and record recovery contact/runbook evidence before inviting beta users.
- On a pause, restore availability using the project owner account, verify Auth and database health, then run authorized smoke checks. Do not invent or commit credentials while recovering.
- All database changes are forward-only migrations. To correct this migration, add a new compensating, data-preserving migration; do not edit production manually or destructively roll back identity/graph records.

## Authorization boundary

Client roles have no direct graph writes. The `graph_*` authenticated RPCs derive the actor from `auth.uid()`, lock both members, reject blocks/self actions, and make graph transitions transactional. A future Edge Function may call only these approved RPCs; it must not accept a caller UID in its payload.
