## Exploration: social-identity-and-graph

### Current State
GymBro has a local two-profile selector, not real authentication: `AuthContext` validates hard-coded credentials for `rodaja` and `brisas`, then stores that alias in AsyncStorage. The same two-value `UserProfile` type is the ownership key for local catalog/workout data and hard-coded Partner routing. Firebase is initialized only for Firestore; current rules allow unrestricted reads and writes. Existing sharing, push tokens, kisses, and the global chat FAB all assume the other fixed profile is the sole Partner.

Firebase Auth and Firestore are already installed. SDK 56 supports Expo Router's file-based routes; Firebase Auth supports React Native AsyncStorage persistence. This phase needs Firebase Auth identity, public profile documents keyed by Auth UID, and server-enforced graph invariants before any client social UI can be trusted.

The catalog-social-foundation change is present with implementation artifacts, but its formal review remains blocked. Treat catalog integrity as a prerequisite already implemented but not closed; do not include its review, verification, or archive work here.

### Affected Areas
- `context/AuthContext.tsx` — replace fixed credential/alias state with Firebase Auth session plus profile readiness.
- `types/index.ts` — retire the two-literal identity assumption from new social-domain models while preserving local-data migration compatibility.
- `utils/storage.ts` and `context/DataContext.tsx` — migrate profile-scoped local keys from aliases to stable authenticated identity without orphaning existing data.
- `services/kissSync.ts`, `services/shareSync.ts`, `constants/kiss.ts`, `context/KissContext.tsx`, `context/ShareContext.tsx`, `components/ChatFab.tsx` — remove hard-coded reciprocal Partner lookup; later sharing and messaging must resolve the accepted graph relationship and block state.
- `firestore.rules` — replace `if true` with authenticated, least-privilege access for profiles, relationships, requests, blocks, and existing collections.
- `app/_layout.tsx`, `app/index.tsx`, `app/(tabs)/_layout.tsx` — session gate, new social routes, and discovery/contacts entry point. Expo Router SDK 56 file routing supports this without external navigation packages.
- `app.json` and `package.json` — add the Expo SecureStore config/package only if it is selected for local sensitive state; Firebase Auth itself should use React Native AsyncStorage persistence.
- `tests/` — add unit tests for graph transition rules, block precedence, profile visibility filtering, pagination cursors, and auth/provider states; existing coverage does not cover authentication or social synchronization.

### Approaches
1. **Client-managed Firestore graph** — Have providers write requests, contacts, Partner changes, and blocks directly.
   - Pros: fewer moving parts; aligns with the current Firestore-only client.
   - Cons: cannot safely enforce one Partner, reciprocal state, demotion, or block precedence under concurrent clients; rules alone cannot reliably coordinate multi-document transitions.
   - Effort: Medium

2. **Firebase Auth + Firestore profiles with trusted graph commands** — Use Firebase Auth for UID identity and public profile documents; route request acceptance, Partner promotion/demotion, and blocking through trusted callable/backend commands with Firestore transactions. Client reads paginate indexed discovery/search results and submits commands.
   - Pros: atomic Partner-to-Bro demotion; authoritative block enforcement; rules can expose only permitted data; clean foundation for later content and live features.
   - Cons: requires a backend deployment surface, command contracts, indexes, rule tests, and migration from aliases.
   - Effort: High

### Recommendation
Choose Firebase Auth + Firestore profiles with trusted graph commands. Model public profiles separately from private account data; default profile fields to public with explicit per-field visibility. Store directed blocks as an authoritative denial relation, and resolve contacts through an undirected canonical pair key. Accepting a Partner request must transact: reject/cancel conflicting pending requests, demote both parties' prior Partners to Bros, establish the new reciprocal Partner edge, and preserve historical records. A block must transact: cancel pending contact, remove active discovery eligibility and graph access, and prevent future requests while retaining immutable history.

For discovery, use a backend-maintained, non-sensitive public projection with deterministic randomized buckets and indexed cursors. Firestore cannot safely provide a stable unbiased random ordered query directly; paginate by bucket/order fields, then filter the caller's contacts, pending relationships, and blocks server-side. Search aliases through a normalized prefix field and cursor pagination. Do not scan all public profiles on-device.

### Risks
- Current `UserProfile` aliases are embedded in persisted local ownership, Partner routing, notifications, themes, shares, and tests; UID migration needs an explicit one-time mapping and rollback-safe handling of unassigned legacy data.
- Existing Firestore rules are fully open and current Firestore writes trust client-supplied profile aliases; shipping discovery before Auth, rules, and trusted mutations would expose data and permit graph invariant violations.
- Partner demotion and block handling are cross-document, concurrent operations; non-transactional client writes can leave asymmetric or bypassable graph state.
- Random discovery, prefix search, and privacy filtering require deliberate read models/indexes; naive client-side filtering leaks hidden profiles and does not paginate correctly.
- The catalog-social-foundation dependency is implemented but formal-review blocked. This exploration intentionally does not claim verification or archive closure.

### Ready for Proposal
Yes — propose Phase 1 as a backend-backed identity and graph foundation, with an explicit legacy-alias migration, Firestore rules/indexes, trusted graph commands, and a review plan under the accepted single-PR 800-line budget. Keep content sharing, feed, joint workouts, duels, and economy out of scope; do not represent catalog review/verification/archive as complete.
