# Design: GymBro Web Platform

## Technical Approach

Build `/home/rodaja/Workspace/gymbro-web` as a Vite, React 19, strict-TypeScript SPA over GymBro-owned Supabase RPCs. React Router controls browser navigation; TanStack Query owns server state; React Hook Form plus Zod owns validated drafts; Supabase JS is isolated behind typed adapters. The mobile repository remains authoritative for migrations, generated contracts, and compatibility. This implements all five delta specs without importing Expo UI, execution, push, or shop behavior.

## Architecture Decisions

| Option | Tradeoff | Decision and rationale |
|---|---|---|
| SPA vs Expo Web/SSR | Rebuilds UI; avoids native coupling and unnecessary authenticated-page SSR | Vite SPA deployed to Cloudflare Pages, with environment-driven Supabase and auth URLs. |
| Feature/domain/infrastructure boundaries vs global contexts | More modules; explicit ownership and test seams | Use `src/app`, `src/features`, `src/domain`, `src/infrastructure`; server projections remain authorization truth. |
| Shared source vs versioned package | Release coordination; prevents copy drift | GymBro publishes SemVer `@gymbro/contracts`; web pins an exact version and validates runtime payloads. |
| Whole-library V1 vs independent CAS V2 | New migration/mobile rollout; prevents unrelated and stale overwrites | Add routine and mesocycle storage revisions plus V2 load/save RPCs. Storage revisions are concurrency tokens; `version`/`versionOf` remain immutable content lineage. |
| Reuse shop themes vs presentation manifest | Duplicated rendering; avoids commerce leakage | Contracts export presentation IDs/manifests; web renders semantic DOM/CSS with accessible fallback. |

## Data Flow

```text
Route → feature form/query → Zod contract → typed Supabase RPC
                                      ↓
GymBro migration → actor-bound projection/CAS → Query cache or conflict UI
```

Publication writes snapshot an immutable plan version. The unified feed projection checks current visibility (`private|circle|community`), block state, deletion/moderation, and copy permission. Copy RPCs atomically remap IDs, preserve provenance, and deduplicate by actor plus publication.

## File Changes

| File | Action | Description |
|---|---|---|
| `packages/contracts/{package.json,src/**}` | Create | Generated DB types, DTOs, Zod schemas, pure rules, presentation manifests. |
| `supabase/migrations/*_training_library_revisions_v2.sql` | Create | Independent revisions and actor-bound V2 CAS RPCs. |
| `supabase/migrations/*_plan_publications.sql` | Create | Publications, reports, visibility/copy/provenance, unified feed RPCs. |
| `supabase/tests/{training_library_v2,plan_publications}.sql` | Create | pgTAP authorization, CAS, moderation, idempotency tests. |
| `services/trainingLibrary.ts`, `context/DataContext.tsx`, `tests/trainingLibrary.test.ts` | Modify | Migrate mobile reads/writes to V2 before web writes. |
| `/home/rodaja/Workspace/gymbro-web/src/{app,features,domain,infrastructure}/**` | Create | Routes, UI, features, pure models, RPC adapters. |
| `/home/rodaja/Workspace/gymbro-web/{vite.config.ts,vitest.config.ts,playwright.config.ts,wrangler.toml}` | Create | Build, tests, and Cloudflare Pages configuration. |

## Interfaces / Contracts

```ts
type RevisedCollection<T> = { revision: number; items: T[] };
type SaveCAS<T> = { expectedRevision: number; items: T[] };
type CASResult<T> = { revision: number; items: T[] }; // conflict returns current state
type PlanPublication = { id: string; kind: 'routine'|'mesocycle'; sourceVersionId: string; visibility: 'private'|'circle'|'community'; copyAllowed: boolean };
```

V2 RPCs load/save routines and mesocycles independently. DTO schemas reject unknown fields. Publication copies retain source author/publication/version IDs but receive owner-local IDs. Reports target publications/comments; only authors delete their content and manual moderators hide/remove reports—no admin panel.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | schemas, lineage/revision separation, theme fallback, route parser | Vitest |
| Integration | auth/forms/cache conflicts/RPC mappings | Testing Library + MSW |
| Database | ownership, stale CAS, blocks, visibility, reports, copy idempotency | pgTAP |
| E2E | auth/recovery, protected planning, publication/copy, keyboard flow | Playwright |

## Threat Matrix

| Boundary | Applicability | Safe/failure behavior | Planned RED tests |
|---|---|---|---|
| Browser routes | Applicable | Allowlisted relative routes only; callback/recovery validate Supabase state; protected routes wait for bootstrap; invalid, replayed, external (`//`, `/\\`, absolute) notification URLs fail closed to a safe route. | Invalid/expired/replayed callback and recovery; unauthenticated protected route; unsupported route; each external URL form. |
| Documentation-like paths | N/A — no execution classification | None | None |
| Git repository selection | N/A — no VCS automation | None | None |
| Commit state | N/A — no commit automation | None | None |
| Push state | N/A — no push automation | None | None |
| PR commands | N/A — no PR automation | None | None |

## Migration / Rollout

Add migrations and publish contracts; deploy V2-compatible mobile; verify telemetry/pgTAP; then enable web reads, web writes, publications, and Cloudflare Pages in stages. V1 remains temporarily readable for rollback; disable web/publication entry points without deleting independent copies. Every delivery work unit targets under 800 changed lines. The complete single PR requires explicit workload authorization before apply.

## Open Questions

- [ ] What production hostname should be allowlisted for Cloudflare Pages auth callback and recovery URLs?
