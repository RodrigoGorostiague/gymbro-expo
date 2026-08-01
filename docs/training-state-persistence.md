# Training State Persistence

All authenticated, mutable training data is server-owned in `training_states`: custom exercise definitions, workout attempts, historical sessions, and the active-workout draft (including timers and lineage). Routines and mesocycles remain in `training_libraries`.

The clean-slate rollout reads only valid custom exercise definitions from legacy library keys and their staged journal, imports them through `import_legacy_custom_definitions`, then deletes all local routine, mesocycle, attempt, session, active-draft, reward-recovery, and legacy training-library runtime keys. If that remote import fails, source keys remain solely for retry and are never used as training runtime fallback. No routine, mesocycle, attempt, session, draft, or reward value is recovered from AsyncStorage.

Bundled normalized catalog data remains locally cached because it is immutable system content. Non-training local state such as authentication, shop preferences, themes, and social UI preferences is outside this migration.

The clean-slate forward migration is `20260801080200_clean_slate_training_data.sql`. Deploy it with `npx supabase db push` only after explicit authorization. It clears remote routines, mesocycles, attempts, sessions, and active drafts while preserving custom definitions, bundled exercises, and muscle groups. Rolling back the client requires restoring the prior client build before removing remote reads; migrations are forward-only and must not be edited or reset.
