## Exploration: GymBro desktop web platform

### Current State
The vision is coherent and technically viable: build a new sibling desktop-first web application that uses the existing GymBro Supabase project, authentication identities, RPCs, and data while treating the mobile app as the product baseline—not as a UI codebase to run unchanged in a browser.

**Stack and architecture.** GymBro mobile is an Expo SDK 56 / React 19 / React Native 0.85 TypeScript application using Expo Router. `app/_layout.tsx` composes large React contexts (`AuthProvider`, `DataProvider`, `ShopProvider`, `SocialProvider`, `ThemeProvider`) over screen routes. Contexts own client state and call thin service modules; services use `@supabase/supabase-js` RPCs. Vitest covers TypeScript logic, while pgTAP SQL tests exercise database authorization and invariants. The repository also owns Supabase migrations and Edge Functions.

**Backend, database, and identity.** Supabase Auth email/password sessions are authoritative. `profiles.id` is a foreign key to `auth.users.id`, so the same credentials and UUID identity work on another web client using the same Supabase URL and anon key. Profile bootstrap is an authenticated `ensure_own_profile` RPC. Web auth is therefore feasible, but must use browser session storage and web recovery/callback URLs rather than the mobile deep link and `detectSessionInUrl: false` configuration.

The database intentionally exposes sensitive data through authenticated, actor-bound `security definer` RPCs rather than direct table access. RLS, grants, blocks, relationship membership, profile privacy flags, and projection shaping remain server-enforced. The web app should consume those RPCs, never reproduce authorization in UI code or use a service-role key.

**Planning model and flows.** The canonical user planning library is one `training_libraries` row per owner with complete `routines` and `mesocycles` JSONB arrays. A routine contains identity/version lineage, name, muscle groups, exercises, and prescribed sets. A mesocycle contains identity/version lineage, goal, lifecycle status, 1–52 weeks, optional civil start date, and up to seven entries per week; entries are rest days or planned sessions that reference and snapshot a routine. Lifecycle states include draft, scheduled, active, paused, completed, cancelled, plus legacy archived. Mobile creates a routine shell first, then edits exercises; it creates a mesocycle shell, then plans weekly entries. Used routine or mesocycle prescriptions are versioned instead of mutated in place. Server validation protects references, uniqueness, completion eligibility, protected history, and the 52-week limit.

`load_training_library` and `save_training_library` make the same data immediately available to web. However, saves replace a full routines or mesocycles array. The newest RPC locks the owner row and enforces invariants, but has no revision/CAS check. Two devices editing the same collection can overwrite each other. Safe web authoring needs optimistic concurrency or item-scoped mutation RPCs before multi-device editing is considered robust.

**Circle, sharing, and activity.** The social graph is reciprocal: accepted relationships are stored once as `bro` or the current partner/GymCrush category; pending requests and blocks are separate. Circle lists include accepted relationships only. Blocking removes relationships and pending requests and excludes both directions from discovery and social access.

Private plan sharing already matches much of the requested product: a sender and recipient must have an accepted, unblocked relationship; the sender's routine/mesocycle privacy flag must permit sharing; the server captures an immutable snapshot; only the recipient can list and accept/reject it; acceptance atomically copies content with fresh IDs, rewrites mesocycle routine references, resets imported mesocycles to draft/no start date, records `sharedFrom`, and is idempotent. This is copy-on-accept—not collaborative editing or a live shared object.

The community feed merges completed workout recaps, milestones, joint-workout posts, and temporary workout-start activity. Recaps support details, reactions, comments, pagination, author deletion, and optional safe template payloads. Server projections restrict feed visibility to self or accepted, unblocked circle members; unrelated and blocked users receive nothing. Profile category visibility and social-insight flags independently suppress private fields. Workout execution creates much of this activity, but web can consume the resulting read/social projections without implementing execution.

**Visual language.** GymBro's identity is a theme-driven glassmorphic system: warm orange/red default branding, optional profile/shop palettes, multi-stop gradients, translucent glass surfaces, gradient borders, large rounded corners, bold high-weight type, avatars/frames/titles, ambient orbs, and decorative backgrounds. Pure palette data and asset identifiers are portable. Existing components are not: they depend on React Native, Expo Blur/Image/LinearGradient, Reanimated, haptics, native dimensions, and mobile navigation. Desktop should recreate the visual grammar with CSS variables, semantic tokens, responsive grid/navigation, restrained motion, and accessible DOM components. It may read the user's equipped theme and cosmetics, but the store itself stays absent.

### Affected Areas
- `package.json`, `app/_layout.tsx` — establish the Expo/React/context architecture that should inform, not dictate, the sibling app.
- `services/supabase.ts`, `context/AuthContext.tsx` — current Supabase client, session bootstrap, email/password flows, and mobile-only recovery behavior.
- `context/DataContext.tsx`, `services/trainingLibrary.ts` — routine/mesocycle orchestration, whole-array persistence, mutation queues, and cross-client concurrency risk.
- `types/index.ts`, `utils/mesocycles.ts`, `utils/mesocycleAnalytics.ts`, `utils/contentVersioning.ts` — portable domain contracts, lifecycle rules, scheduling semantics, and immutable versioning.
- `services/privatePlanSharing.ts`, `context/SocialContext.tsx` — existing private copy-on-accept sharing API and client integration.
- `services/socialGraph.ts`, `services/workoutRecapFeed.ts`, `app/community/feed.tsx` — circle, discovery, feed, activity, and engagement capabilities.
- `constants/theme.ts`, `constants/shopThemes.ts`, `components/GlassCard.tsx`, `components/UI.tsx` — reusable visual tokens versus mobile-specific rendering.
- `supabase/migrations/20260905160000_mesocycle_lifecycle_contract.sql` — latest planning invariants and persistence contract.
- `supabase/migrations/20260802110000_private_plan_sharing.sql`, `20260814190000_mesocycle_shared_origin.sql` — sharing authorization, snapshot/import semantics, and provenance.
- `supabase/tests/private_plan_sharing.sql`, `relationship_graph.sql`, `workout_recap_feed.sql`, `social_discovery.sql` — executable evidence for permission boundaries the web must preserve.

### Approaches
1. **Separate desktop React application over the existing Supabase RPC boundary** — create a sibling TypeScript web project with its own routing, browser auth adapter, query/cache layer, forms, and DOM design system; consume current RPCs and extract only platform-neutral contracts.
   - Pros: Clean desktop UX; independent deployment; same identities/data; preserves server authorization; excludes workout/store code cleanly; lowest long-term coupling.
   - Cons: Requires rebuilding UI and adding a deliberate contract-sharing/versioning mechanism; backend concurrency needs hardening.
   - Effort: Medium

2. **Promote Expo Web as the desktop platform** — extend the mobile repository's existing web target and reuse contexts/components directly.
   - Pros: Maximum immediate source reuse; existing routes and providers already compile toward web.
   - Cons: Violates the requested sibling boundary; imports workout/store/provider coupling; mobile portrait layout and native libraries are poor desktop foundations; independent release ownership remains difficult.
   - Effort: Medium initially, High to reach a strong desktop product

3. **Move both clients into a new monorepo with shared domain, API, and design packages first** — reorganize mobile and web around shared packages before delivering the web product.
   - Pros: Strongest compile-time reuse and unified contract evolution.
   - Cons: Large migration and regression surface unrelated to MVP; likely exceeds the 800-line review budget many times; delays user value and conflicts with keeping the new project outside the mobile repository.
   - Effort: High

### Recommendation
Choose approach 1. Build a separate desktop-first React/TypeScript sibling application and share the backend contract, not the mobile component tree. Default to a client-rendered authenticated application because current social/planning RPCs require a user; choose a server-rendering framework only if public/SEO pages become an explicit requirement.

Use four boundaries in the new project: **app/UI** (routes and desktop components), **features** (planning, circle, sharing, feed), **domain** (pure routine/mesocycle rules and schemas), and **infrastructure** (Supabase browser client plus typed RPC adapters). Use server-returned projections as authorization truth. A query/cache layer should own remote state; do not reproduce the mobile all-in-one Context architecture.

Share or extract only platform-neutral assets:
- versioned TypeScript domain types, runtime schemas, RPC input/output contracts, and generated Supabase database types;
- pure mesocycle scheduling/versioning/validation utilities, after removing storage and React Native dependencies;
- semantic theme tokens, palette IDs, avatar/frame/title identifiers, and approved brand assets.

Keep separate:
- React Native/Expo components, navigation, haptics, animation engines, notification runtime, SecureStore/AsyncStorage adapters;
- workout execution/draft/timer/joint-live flows;
- shop purchase/inventory UI and mobile-specific provider composition.

**MVP.** Existing-account sign-in/register/reset; authenticated profile bootstrap; desktop routine library and full prescription editing; mesocycle creation and weekly planning; circle list/discovery/request management; routine/mesocycle share-to-circle plus inbox accept/reject; read-focused community feed with recap detail and established reactions/comments; equipped avatar/frame/title/theme presentation; responsive accessibility and loading/error/empty states. Include backend optimistic concurrency (revision/CAS) or item-scoped mutation RPCs as a prerequisite to reliable editing.

**Non-goals.** Workout execution, active workout timers/drafts, joint workout participation/chat, push-device registration, store browsing/purchases, reward administration, anonymous/public plan links, real-time collaborative editing, and a mobile-repository rewrite.

**Phased expansion.** Phase 0: freeze/version RPC contracts, add browser auth redirects, and harden planning writes. Phase 1: auth plus routine/mesocycle planning. Phase 2: circle, private sharing, inbox, and feed engagement. Phase 3: richer analytics/profile insights, optional read-only live activity, notifications, and—only if validated—public share pages or collaboration.

**Interactive product questions.**
1. Is the first release primarily a powerful planning companion, or should community/feed be equally prominent in the main desktop navigation?
2. Does “share with my circle” mean the existing private request + independent copy flow, or do users need public links or collaboratively maintained plans?
3. Should MVP social be read-focused, or must it include circle discovery/requests, reactions, comments, and notifications from day one?
4. Should desktop mirror each user's equipped mobile theme exactly, or use a stable GymBro desktop shell with the equipped theme applied as accents?
5. Is email/password parity sufficient for launch, or are OAuth, magic links, and account-linking part of the web identity expectation?

### Risks
- Full-array JSONB saves can lose same-user changes across simultaneous mobile/web sessions; row locking alone does not prevent stale overwrite.
- RPC payloads are manually parsed and camelCase/snake_case mappings are not generated as a stable public contract, so clients can drift as migrations evolve.
- Supabase migrations currently live with the mobile repository; a sibling app needs explicit backend ownership, compatibility policy, and deployment sequencing.
- Sharing is snapshot/copy based. Calling it collaboration would create a false product promise and incompatible data model.
- Feed sources are heterogeneous and some represent workout execution or joint-live state; MVP must define which are display-only versus intentionally omitted.
- Theme catalogs and cosmetics are coupled to store-era constants/assets; web must consume presentation safely without accidentally importing store behavior.
- A single PR may be acceptable per strategy, but the 800-line budget is likely exceeded by project bootstrap plus auth, planning, social, design system, and tests; implementation planning should define reviewable internal work units even if delivery remains one PR.

### Ready for Proposal
Yes, after the orchestrator runs the interactive shaping round with the five questions above. The proposal should lead with “desktop planning and circle sharing on the same GymBro identity,” explicitly preserve copy-on-accept privacy semantics, make concurrency hardening a prerequisite, and keep workout execution and store behavior out of scope.
