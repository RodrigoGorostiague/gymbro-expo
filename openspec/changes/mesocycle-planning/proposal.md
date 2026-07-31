# Proposal: Mesocycle Planning

## Intent
Add mesocycles as a first-class planning module so users can organize multi-week training blocks without redefining routines as plans. This fixes terminology drift, preserves routine reuse, and gives users a clear place to plan goals, weekly structure, and progression notes.

## Scope

### In Scope
- Mesocycle CRUD with name, goal, status, duration/weeks, optional start date.
- Week-based planning structure with planned sessions that reference existing routines by `routineId`.
- Planning metadata per session: suggested order/day label, progression note, optional note.
- First-class mesocycle navigation and detail/editor flow.
- Routine reference validation/fallbacks for deleted, hidden, or unavailable routines.
- Routine screens relabeled so routines remain reusable workout templates.

### Out of Scope
- Auto-scheduling from availability or frequency.
- Completion/adherence tracking, analytics overlays, reminders, AI progression, or mesocycle sharing/export.

## Capabilities

### New Capabilities
- `mesocycle-planning`: Create, edit, view, and delete multi-week training plans built from reusable routines.
- `mesocycle-navigation`: Access mesocycles as a distinct product area with dedicated list/detail flows.

### Modified Capabilities
- None.

## Approach
Keep `Routine` template-only. Add a separate mesocycle domain and persistence layer beside routines. Mesocycles store planning metadata and `weeks[]` session references; execution still launches the existing routine execution flow from the referenced routine. MVP stays planning-first, not scheduling- or adherence-first.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `types/index.ts` | Modified | Add mesocycle models beside routines |
| `context/DataContext.tsx` | Modified | Parallel mesocycle state/actions |
| `utils/storage.ts` | Modified | Mesocycle storage keys/hydration |
| `app/(tabs)/_layout.tsx` | Modified | First-class mesocycle navigation |
| `app/(tabs)/routines/index.tsx` | Modified | Remove mesocycle wording from routine library |
| `app/mesocycle/*` | New | Mesocycle detail/editor screens |
| `app/(tabs)/mesocycles/*` | New | Mesocycle list screen |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Orphaned routine references | Med | Validate refs and show unavailable-state fallback |
| User confusion from old copy | High | Relabel routines and mesocycles consistently |
| Scope creep into tracking/analytics | Med | Enforce planning-only MVP boundary |

## Rollback Plan
Disable mesocycle navigation, ignore mesocycle storage keys, and keep routine execution/library flows unchanged.

## Dependencies
- Existing routine CRUD/execution remains the source of workout content.

## Success Criteria
- [ ] Users can create and manage a mesocycle with weeks and routine-based planned sessions.
- [ ] Routines remain reusable templates and can appear multiple times across plans.
- [ ] MVP clearly excludes automation, adherence, and analytics roadmap work.

## Proposal Question Round
Assumptions to confirm later: mesocycle status is planning-only in MVP, planned sessions do not record completion, and routine deletion should degrade gracefully rather than block deletion.
