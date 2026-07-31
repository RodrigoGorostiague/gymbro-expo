# Design: Mesocycle Planning

## Technical Approach
Add a mesocycle domain beside routines in AsyncStorage and DataContext. Mesocycles are planning records only: they reference existing routines for execution, but never own workout logging. This matches the proposal and spec by separating planning (`Mesocycle`) from execution (`Routine` + existing `/routine/execute/[id]`).

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Planning model | New `Mesocycle` / `MesocycleWeek` / `PlannedSession` types in `types/index.ts` | Reusing `Routine` as a plan | Current routine screens/editors are exercise-template oriented; overloading them keeps the existing terminology bug alive. |
| Persistence | New AsyncStorage key and `load/saveMesocycles()` in `utils/storage.ts` | Embedding plan data in routines | Parallel storage preserves routine reuse, keeps delete boundaries clean, and matches existing storage helpers. |
| Shared routine identity | `PlannedSession` stores `routineId` plus snapshot metadata (`routineName`, optional `shareId`, `source`) | Storing only `routineId` | Shared routines use synthetic ids (`shared-${shareId}`) and can be hidden/unavailable; snapshot data preserves visible plan rows and supports graceful fallback. |
| Execution | Mesocycle detail launches existing `/routine/execute/[id]` only when the referenced routine resolves | New mesocycle workout flow | MVP stays planning-first and reuses proven attempt/session behavior. |

## Data Flow
`Mesocycle screens` -> `useData()` mesocycle actions -> `utils/storage.ts` AsyncStorage key
`Mesocycle detail` -> resolve planned session reference -> existing `getRoutine()` / `/routine/execute/[id]`
Unavailable reference -> render snapshot + warning, no navigation crash.

## File Changes

| File | Action | Description |
|---|---|---|
| `types/index.ts` | Modify | Add mesocycle entities and planning status/type helpers. |
| `utils/storage.ts` | Modify | Add mesocycle storage key, load/save helpers, and normalization. |
| `context/DataContext.tsx` | Modify | Add mesocycle state, CRUD actions, resolvers, and hydration with existing loading/error conventions. |
| `app/(tabs)/_layout.tsx` | Modify | Add first-class `mesocycles/index` tab and keep routines as library wording. |
| `app/_layout.tsx` | Modify | Register `mesocycle/create` and `mesocycle/[id]` stack routes. |
| `app/(tabs)/routines/index.tsx` | Modify | Remove mesocycle wording; describe routines as reusable templates. |
| `app/(tabs)/mesocycles/index.tsx` | Create | Mesocycle list with create CTA and planning status summary. |
| `app/mesocycle/create.tsx` | Create | MVP create form: name, goal, status, weeks, optional start date. |
| `app/mesocycle/[id].tsx` | Create | Detail/editor for weeks and planned sessions, plus execute CTA per resolved routine. |

## Interfaces / Contracts
```ts
export type MesocycleStatus = 'draft' | 'active' | 'completed' | 'archived';
export interface PlannedSessionRef { routineId: string; routineName: string; source: 'local' | 'shared'; shareId?: string; }
export interface PlannedSession { id: string; ref: PlannedSessionRef; dayLabel?: string; order: number; progressionNote?: string; note?: string; }
export interface MesocycleWeek { id: string; weekNumber: number; sessions: PlannedSession[]; }
export interface Mesocycle { id: string; name: string; goal: string; status: MesocycleStatus; weeks: MesocycleWeek[]; durationWeeks: number; startDate?: string; createdAt: string; }
```
`useData()` should expose `mesocycles`, CRUD methods, `getMesocycle(id)`, and `resolvePlannedRoutine(ref)`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Mesocycle storage normalization, save/load, unavailable reference resolution | Add Vitest coverage beside `tests/storage.test.ts`. |
| Integration | DataContext hydration and CRUD sequencing with mesocycles + routines | Extend mocked AsyncStorage tests for provider-facing helpers. |
| E2E | Route registration and execute-from-plan happy path | Manual Expo smoke test; typecheck with `npx tsc --noEmit`. |

## Threat Matrix
Reference file `references/threat-matrix.md` is missing in this repo. Fallback applicability for this change: Routing = Applicable (verify registered tab/stack routes, invalid id fallback, and execute CTA only for resolved routines); Shell/Subprocess/VCS automation/Executable-file classification/Process integration = N/A.

## Migration / Rollout
No migration required. Mesocycles use an additive storage key; existing routines, sessions, attempts, and share data remain untouched.

## Open Questions
- [ ] Should shared routines be selectable in MVP planning, or should mesocycle assignment be limited to local routines until hidden-share UX is clarified?
- [ ] Is `completed` vs `archived` meaningful in MVP, or should status start with `draft | active` only?
