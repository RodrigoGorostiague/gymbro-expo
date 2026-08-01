# Apply Progress: Social Identity and Graph

## Work Units

- `supabase-social-schema-and-rls` — completed under a maintainer-approved `size:exception`.
- `supabase-relationship-graph-commands` — completed as the bounded automatic-continuation work unit; native attempt generation 2, ordinal 2, passed with 200 changed lines under the 800-line maximum (evidence revision `sha256:61605ecdd9b65f3dff31f2d50e8be36d8a8f363bc67e4dda3518a782ecbc7faa`).
- `supabase-auth-and-uid-client` — completed as the bounded client identity work unit; Supabase Auth owns the active UID, local alias data is copied with a copy/verify/marker journal, and no local `.env` was read or changed.
- `hosted-supabase-graph-smoke` — completed as one bounded hosting smoke work unit; the linked beta project has both social migrations, `social-graph` is active, and an unauthenticated POST is rejected with HTTP 401. No product source or secrets were changed or read.
- `supabase-discovery-rpcs` — completed as the bounded discovery work unit; server-owned `list_directory`/`search_aliases` keyset RPCs with self, block, relationship, and pending-request exclusions are deployed to the linked beta, and the existing Community directory/search connects to them without client changes.
- `social-realtime-lifecycle` — completed as the bounded 800-line Realtime lifecycle work unit; the authenticated client authorizes only RLS-scoped Postgres Changes, reconnects on foreground through the shared AppState client, removes channels on unmount, and invalidates Community state without consuming event payloads.
- `social-firebase-isolation-and-authorization-coverage` — completed as the bounded Phase 4 integration work unit; the authenticated tree no longer mounts legacy Firebase Kiss/Share providers or the Chat FAB, protected social boundary coverage was added, and a safe two-account validation script was recorded.

## Completed Tasks

- [x] 1.1 Local Supabase structure, client dependency, environment placeholders, and beta operations documentation.
- [x] 1.2 SQL authorization tests for anonymous access, hidden categories, normalized aliases, direct graph writes, and blocked projections.
- [x] 1.3 Forward-only social identity schema with profiles, safe public projections, indexes, RLS, Realtime publication, and owner profile updates.
- [x] 1.4 Graph SQL coverage for request acceptance/rejection, self and blocked commands, Partner replacement/demotion, competing transitions, cleanup, idempotency, and atomic failure.
- [x] 1.6 JWT-verifying Edge Function adapter that rejects caller identity input, invokes only approved graph RPCs, and returns trusted summaries.
- [x] 2.1 Auth hydration/sign-out and UID migration tests.
- [x] 2.2 UID ownership types, scoped catalog/session keys, and a source-preserving alias migration journal.
- [x] 2.3 Public-variable Supabase client, persisted React Native session, AppState refresh, email/password auth, and session-gated login navigation.
- [x] 1.5 Cursor-validated `list_directory`/`search_aliases` RPCs with server-side privacy and block exclusions, plus pgTAP discovery coverage.
- [x] 3.1 Social graph client boundary tests; server-side continuation, exclusion, and malformed-cursor criteria are covered by `supabase/tests/social_discovery.sql`.
- [x] 3.2 Authorized Realtime lifecycle for safe social projections and relationship state, reconnect support, channel cleanup, and Community invalidation.
- [x] 3.3 Community directory/search and profile screens, now backed by the deployed discovery RPCs.
- [x] 4.1 Legacy Firebase partner listeners and Chat FAB unmounted from the authenticated tree without a replacement feature.
- [x] 4.2 Protected social-boundary coverage for legacy-provider isolation, unauthenticated Realtime, trusted graph commands, and local RLS/direct-write SQL checks.
- [x] 4.3 Typecheck, focused suites, local SQL integration, and safe Expo export completed; the two-account script is recorded for an operator with disposable accounts and devices.

## Work Unit Evidence

| Evidence | Exact result |
|---|---|
| RED test | `npx supabase db reset --local --no-seed && npx supabase test db supabase/tests/relationship_graph.sql` initially exited 1: duplicate request raised `23505` and `graph_summary` was absent. |
| Focused test | The same command after the migration exited 0; `relationship_graph.sql` passed 28 pgTAP tests. |
| Full local SQL suite | `npx supabase test db` exited 0; 2 SQL files / 34 pgTAP tests passed. |
| Static compatibility | `npx tsc --noEmit` exited 0 after excluding Deno Edge Function source from Expo's TypeScript project. |
| Runtime harness | `npx supabase functions serve social-graph --no-verify-jwt` compiled and served the local function; an unauthenticated `POST /functions/v1/social-graph` returned `{"error":"authentication required"}` with HTTP 401. No hosted project, credential, deployment, or secret was used. |
| Rollback boundary | Revert `supabase/migrations/20260731200000_relationship_graph_commands.sql`, `supabase/functions/social-graph/index.ts`, `supabase/tests/relationship_graph.sql`, and the `tsconfig.json` Deno exclusion. For any applied database correction, add a forward-only compensating migration; never destructively roll back graph records. |

### Work Unit Evidence: `supabase-auth-and-uid-client`

| Evidence | Exact result |
|---|---|
| Focused test | `npx vitest run tests/authContext.test.ts tests/storageMigration.test.ts` exited 0: 2 files and 4 tests passed. |
| Static compatibility | `npx tsc --noEmit` exited 0. |
| Runtime harness | `EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 npx expo export --platform android` exited 0 and exported the Android bundle. This intentionally prevented dotenv loading and public-variable inlining, proving the safe missing-configuration path bundles without reading local secrets. |
| Rollback boundary | Revert `services/supabase.ts`, `context/AuthContext.tsx`, `app/index.tsx`, `components/login/LoginFormPanel.tsx`, UID-related storage/type changes, `react-native-url-polyfill`, and the two focused tests. Existing alias source keys remain intact; remove only UID destination keys/markers if an explicit compensating local rollback is required. |

### Work Unit Evidence: `hosted-supabase-graph-smoke`

| Evidence | Exact result |
|---|---|
| Focused deployment preflight | `npx supabase migration list --linked` exited 0. Local and remote both contain `20260731190000` and `20260731200000`; the linked beta schema is current before the function deployment. |
| Deployment | `npx supabase functions deploy social-graph` exited 0 and deployed only `social-graph` to the linked project. |
| Runtime harness | `npx supabase functions list` exited 0 and reported `social-graph` as `ACTIVE`, version `1`. An unauthenticated POST to `/functions/v1/social-graph` with a non-secret JSON graph-command payload returned `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` and HTTP `401`. No API, service-role, JWT, or other secret key was supplied. |
| Rollback boundary | Hosted `social-graph` deployment only. Re-deploy the previously approved `social-graph` revision or disable that function if a rollback is required; no product source, migration, configuration, or local environment file changed in this work unit. |

### Work Unit Evidence: `supabase-discovery-rpcs`

| Evidence | Exact result |
|---|---|
| RED test | `npx supabase db reset --local --no-seed && npx supabase test db supabase/tests/social_discovery.sql` initially exited 1: `function public.list_directory(unknown, integer) does not exist`, 0 of 16 planned tests ran. |
| Focused test | The same command after the migration exited 0; `social_discovery.sql` passed 16 pgTAP tests covering exclusion of self/relationships/pending requests/both block directions, hidden-category projection, bounded pages, cursor continuation without duplicates, end-of-directory, malformed and wrong-shape cursor rejection, anonymous denial (42501), server-side prefix normalization, blank-prefix rejection, search continuation, excluded-only prefix, and malformed search cursors. |
| Full local SQL suite | `npx supabase test db` exited 0; 3 SQL files / 50 pgTAP tests passed. |
| Deployment | `npx supabase db push` exited 0 and applied only `20260731210000_social_discovery_rpcs.sql`; `npx supabase migration list --linked` reports local and remote matched on `20260731190000`, `20260731200000`, and `20260731210000`. No secret, credential, or environment file was read or changed. |
| Client connection | `npx vitest run tests/socialGraph.test.ts` exited 0 (2 tests) and `npx tsc --noEmit` exited 0. The existing Community directory/search calls the deployed RPCs with `{cursor, page_size}` and `{prefix, cursor, page_size}`; no client change was required. |
| Rollback boundary | Revert `supabase/migrations/20260731210000_social_discovery_rpcs.sql` and `supabase/tests/social_discovery.sql`. For any applied hosted correction, add a forward-only compensating migration that drops or replaces the two functions; never destructively roll back identity or graph records. |

### Work Unit Evidence: `social-realtime-lifecycle`

| Evidence | Exact result |
|---|---|
| Focused test | `npx vitest run tests/socialGraph.test.ts` exited 0: 1 file and 4 tests passed. It verifies session-token authorization before subscription, seven RLS-scoped table filters, payload-free Community invalidation, and `removeChannel` cleanup on provider unmount. |
| Schema authorization/runtime harness | `npx supabase test db` exited 0: 3 SQL files and 50 pgTAP tests passed. Existing RLS policies authorize public projections and relationship participants only; this work unit adds only those three graph tables to the Realtime publication. |
| Deployment | `npx supabase db push` exited 0 and applied only `20260731220000_social_realtime_graph_publication.sql` to the linked beta. No environment file, credential, or secret was read or changed. |
| Static compatibility | `npx tsc --noEmit` exited 0. |
| Rollback boundary | Revert `services/supabase.ts`, `services/socialGraph.ts`, `context/SocialContext.tsx`, `app/social/index.tsx`, `app/social/[uid].tsx`, `tests/socialGraph.test.ts`, and `supabase/migrations/20260731220000_social_realtime_graph_publication.sql`. For the deployed publication change, apply a forward-only compensating migration that removes only `relationships`, `relationship_requests`, and `blocks` from `supabase_realtime`; do not alter social records. |

## Work Unit Evidence: `social-firebase-isolation-and-authorization-coverage`

| Evidence | Exact result |
|---|---|
| RED test | `npx vitest run tests/supabaseRls.test.ts` initially exited 1: `app/_layout.tsx` still mounted `KissProvider` and `ShareProvider`. |
| Focused test | `npx vitest run tests/supabaseRls.test.ts tests/socialGraph.test.ts tests/authContext.test.ts tests/storageMigration.test.ts` exited 0: 4 files and 11 tests passed. |
| Local authorization integration | `npx supabase test db` exited 0: 3 SQL files and 53 pgTAP tests passed, including anonymous/cross-user projection denial and direct graph-write denial. |
| Static compatibility | `npx tsc --noEmit` exited 0. |
| Runtime harness | `EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 npx expo export --platform android` exited 0 and exported the Android bundle without loading local environment files. |
| Manual two-account validation | Recorded in `docs/social-two-account-test.md`; not performed because this apply session was not supplied two disposable authenticated accounts and two interactive devices/emulators. The script covers request, Bro acceptance, Partner acceptance, blocking, and authorized Realtime refresh. |
| Deployment/secrets/usage evidence | No hosted deployment, credentials, secrets, or local environment files were read, printed, changed, or used. |
| Rollback boundary | Revert `app/_layout.tsx`, `app/(tabs)/_layout.tsx`, `tests/supabaseRls.test.ts`, and `docs/social-two-account-test.md`. This restores only legacy partner/listener mounting and removes only Phase 4 evidence/documentation; it does not alter Supabase graph records or migrations. |

## Remaining Tasks

None. All 15 tasks are complete.

### Completed Bounded Native Attempt: `social-community-relationship-projections`

The prior `social-realtime-lifecycle` attempt was complete, so this maintainer-authorized continuation reset the attempt boundary and started a new bounded native work unit. It changes only Community relationship projections, RPC client state, and their coverage; the diff is under the 800-line maximum.

| Evidence | Exact result |
|---|---|
| RED tests | `npx vitest run tests/socialGraph.test.ts` initially exited 1 because `getCirclePage` did not exist. `npx supabase test db supabase/tests/social_discovery.sql` initially exited 1 because `list_circle` did not exist and alias search still excluded relationships and requests. |
| Focused tests | `npx vitest run tests/socialGraph.test.ts` exited 0: 1 file and 4 tests passed. `npx supabase test db supabase/tests/social_discovery.sql` exited 0: 1 SQL file and 19 pgTAP tests passed. |
| Full SQL suite | `npx supabase test db` exited 0: 3 SQL files and 53 pgTAP tests passed. |
| Static compatibility | `npx tsc --noEmit` exited 0. |
| Runtime harness | `EXPO_NO_DOTENV=1 EXPO_NO_CLIENT_ENV_VARS=1 npx expo export --platform android` exited 0 and exported the Android bundle without loading local environment files. |
| Deployment | `npx supabase db push` exited 0 and applied only `20260731230000_social_relationship_projections.sql`; `npx supabase migration list --linked` confirms local and remote migrations match through `20260731230000`. |
| Rollback boundary | Revert `app/social/index.tsx`, `context/SocialContext.tsx`, `services/socialGraph.ts`, `tests/socialGraph.test.ts`, `supabase/tests/social_discovery.sql`, and `supabase/migrations/20260731230000_social_relationship_projections.sql`. For the deployed RPC correction, use a forward-only compensating migration to restore the earlier `search_aliases` behavior and remove only `list_circle`/`list_requests`; do not modify graph records. |

Community now keeps Discover restricted to eligible new connections, projects accepted Partner/Bro relationships as My Circle, projects pending inbound/outbound requests as Requests, and returns non-blocked existing connections in alias search with a server-owned status. Block and privacy predicates remain enforced inside the RPC projection.

### Superseded Attempt Record: `social-discovery-and-relationship-ui`

The earlier blocked record predates the deployed discovery RPCs. Its server dependency is resolved and its Community UI is now extended by `social-community-relationship-projections`; it is retained only as historical evidence, not an active blocker.

## Deviations

The two-account scenario was recorded but not executed: interactive validation needs operator-provisioned disposable accounts and two devices/emulators, which were not available in this session. The completed automated and local authorization checks do not substitute for that manual device validation.
