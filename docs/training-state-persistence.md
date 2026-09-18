# Training State Persistence

All authenticated, mutable training data is server-owned in `training_states`: custom exercise definitions, workout attempts, historical sessions, and the active-workout draft (including timers and lineage). Routines and mesocycles remain in `training_libraries`.

## Historical clean-slate rollout

The historical clean-slate rollout reads only valid custom exercise definitions from legacy library keys and their staged journal, imports them through `import_legacy_custom_definitions`, then deletes all local routine, mesocycle, attempt, session, active-draft, reward-recovery, and legacy training-library runtime keys. If that remote import fails, source keys remain solely for retry and are never used as training runtime fallback. That legacy recovery path does not restore routines, mesocycles, attempts, sessions, drafts, or rewards from AsyncStorage. It is separate from the new capability-gated journal described below.

Bundled normalized catalog data remains locally cached because it is immutable system content. Non-training local state such as authentication, shop preferences, themes, and social UI preferences is outside this migration.

The historical clean-slate migration is `20260801080200_clean_slate_training_data.sql`. It clears remote routines, mesocycles, attempts, sessions, and active drafts while preserving custom definitions, bundled exercises, and muscle groups. This destructive historical migration is not an offline activation or recovery procedure; do not replay it to enable the new feature. Preserve historical migration files and pending journals.

## Current exception: capability-gated active solo journal

Server ownership remains authoritative for confirmed history, gems and XP. When `offline_workout_capability` is available, an already-started solo workout also uses a new owner-scoped AsyncStorage journal for active edits, recovery, cancellation and immutable pending completion. It does not restore legacy runtime keys or make the general training library available offline. Synchronization uses atomic expected-draft comparison and the existing server reward idempotency boundary; pending data never falls back to unconditional legacy writes.

The first slice is implemented and independently validated. The authorized additive migration was applied locally and to the linked server on 2026-09-10; both histories are aligned at 121/121 with no pending migrations. **Physical airplane-mode/app-kill tests remain pending.** See [offline workout scope, activation and validation](offline-workout-2026-09-09.md) for deployment evidence and backup caveats. Never replay the historical clean-slate reset to activate or recover offline work.
