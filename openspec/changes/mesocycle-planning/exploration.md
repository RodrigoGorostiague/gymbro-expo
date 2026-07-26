## Exploration: Mesocycle feature as a first-class planning module

### Current State
GymBro currently treats `Routine` as the primary training object. In `types/index.ts`, a routine only stores template data (`id`, `name`, `muscleGroups`, `exercises`, `createdAt`, optional sharing metadata). `context/DataContext.tsx` loads routines from AsyncStorage, merges accepted shared routines into the same list, and exposes CRUD plus direct execution entry points. `app/(tabs)/routines/index.tsx` is the main tab and currently mixes the concepts in copy (`Mesociclos - carpetas de ejercicios`), but the implementation is still a reusable routine library. `app/routine/create.tsx` creates a bare routine template, `app/routine/[id].tsx` edits exercise/set structure, and `app/routine/execute/[id].tsx` executes one routine immediately with no calendar, week, block, or planning layer. Persistence in `utils/storage.ts` is flat and separate by concern (`@gymbro/routines`, `@gymbro/sessions`, profile-scoped attempts, shop state). Existing time logic is analytics-oriented only (`startOfWeek`, weekly goal rewards, historical comparisons) and does not represent future plans.

### Affected Areas
- `types/index.ts` - `Routine` is template-only today; a new mesocycle model must live beside it, not inside it.
- `context/DataContext.tsx` - central place that loads/saves routines and would likely need parallel mesocycle state/actions.
- `utils/storage.ts` - needs new storage keys and hydration rules for mesocycles.
- `app/(tabs)/_layout.tsx` - current tab navigation exposes routines, exercises, progress, and shop only; mesocycles need first-class navigation.
- `app/(tabs)/routines/index.tsx` - currently the routines home and already contains misleading mesocycle wording that must be corrected.
- `app/routine/create.tsx` - routine creation remains template creation; naming/copy should stop implying block planning.
- `app/routine/[id].tsx` - routine editing is exercise/set editing only, which reinforces the template boundary.
- `app/routine/execute/[id].tsx` - execution starts from a routine ID directly, so mesocycle sessions should initially resolve to routine execution rather than invent a second execution engine.
- `app/(tabs)/progress.tsx` - history/progress are attempt- and routine-based today; future mesocycle insights should layer on top instead of changing MVP execution metrics.
- `services/shareSync.ts` - shared routines are normalized separately, which matters because mesocycles will reference routines that may be local or shared.

### Approaches
1. **Extend Routine into a planning object** - add weeks, progression, goals, status, and scheduling fields directly onto `Routine`.
   - Pros: Fewer new screens and less initial plumbing.
   - Cons: Collapses template and plan responsibilities, breaks the current reusable-library mental model, complicates sharing, and makes one routine harder to reuse across multiple blocks.
   - Effort: Medium

2. **Create a separate Mesocycle module referencing routines** - keep routines as reusable templates and add mesocycles as planning entities with week/session entries that point to `routineId`.
   - Pros: Matches product intent, preserves routine reuse, supports the same routine appearing multiple times, gives a clean navigation boundary, and keeps execution/history flows stable.
   - Cons: Requires new types, storage, screens, and reference/orphan handling for shared or deleted routines.
   - Effort: Medium

### Recommendation
Use a separate Mesocycle module. The clean MVP is: routines stay a library of reusable workout templates, while mesocycles become a planning container with its own list/detail/editor flow. A mesocycle should own its planning metadata (`name`, `goal`, `status`, `durationWeeks`, optional start date) plus `weeks[]`, where each week contains planned sessions referencing `routineId` and storing planning-only metadata such as suggested order/day label, progression note, and optional session note. Execution should still launch the existing routine execution screen from the referenced routine. This preserves the stable routine engine while adding a true planning layer.

MVP boundary:
- First-class Mesocycles navigation entry.
- Mesocycle CRUD.
- Multi-week structure.
- Planned sessions that reference routines by ID and can repeat across weeks or within the same week.
- Manual planning fields: goal, block status, suggested order/day, progression note, optional start date.
- Read-only calendar-oriented presentation (week/day framing), not automatic scheduling.

Post-MVP, explicitly separate:
- Auto-scheduling from availability or training frequency.
- Completion/adherence tracking against a mesocycle plan.
- Mesocycle analytics overlays in progress views.
- Notifications/reminders tied to planned days.
- Smart progression suggestions or plan generation.
- Shared/exported mesocycles as a sync object distinct from shared routines.

### Risks
- Shared routine identity is synthetic in `DataContext` (`shared-${shareId}`), so mesocycle references need a stable strategy and a fallback when a shared routine is hidden, rejected, or removed.
- Current copy already teaches that routines are mesocycles, so shipping the module without relabeling will confuse users.
- Deleting or mutating routines can orphan planned mesocycle sessions unless reference validation is added.
- Adding mesocycle-aware execution/history too early would expand scope beyond the planning-first MVP.
- Flat AsyncStorage persistence means schema evolution and hydration rules should be planned up front to avoid another migration tangle.

### Ready for Proposal
Yes - the repo supports a clean first-class Mesocycle module if the proposal keeps MVP focused on planning structure and routine references, while leaving automation, adherence intelligence, and deeper analytics for later phases.
