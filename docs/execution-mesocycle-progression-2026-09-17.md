# Execution and mesocycle progression

The right header action opens a finalization menu with Save session and Cancel workout. Closing the menu keeps training. Opening it does not pause elapsed or rest timers, and a complete workout also requires an explicit save choice. Both per-series copying actions and the duplicate bottom finalization action are removed.

Old paused drafts resume automatically when reopened, excluding their paused interval and restoring remaining rest. Pending finalizations and joint cancellation recovery keep their existing persistence contracts. Mesocycle calendar pause is unchanged.

## Continuity

The existing launch selector prefills actual weights and repetitions from the latest eligible earlier occurrence of the same routine in the same mesocycle. Each performed compatible series has a previous-performance reference, including recorded actual effort when present. The target effort remains prescribed; today's actual effort starts unrecorded. No values are written into historical attempts or future calendar snapshots. Resumed drafts retain their saved inputs. References on resume are limited to attempts completed before the draft started.

Explicit different prescriptions, units, modes and variants prevent propagation. Session-only variant substitutions cannot carry into the original exercise. Skipped/invalid series in the latest attempt do not fall back to older attempts. Unknown legacy measured effort is not fabricated. Existing limits still apply to rebuilt routine/set identities and identical re-entered prescriptions that have no explicit override provenance.

## Progress

The mesocycle summary retains adherence, effective series and muscular volume. Its evolution section displays all comparable exercise groups with per-exposure week/date, load, repetitions, series and separate RIR/RPE ranges and coverage. The first/last comparison includes load and repetitions, plus volume for external loads. Closed blocks expand the balance by default.

Comparisons require the same routine, exercise occurrence, recorded variant, load mode, unit and performed series structure. Changed structure and partial sessions with different completed series form separate groups. Legacy missing variants do not generate cross-session comparisons. Bodyweight and assistance keep their labels and do not masquerade as external-load volume. Missing effort is labeled explicitly. Only the active owner's attempts are included, using one authoritative latest attempt per planned slot.

No automatic load increases, effort inference or strength-improvement claims are made. No new database migration is needed; this uses existing actual-effort persistence.

## Validation

Automated coverage includes removed controls, menu dismissal, save/cancel and joint cancellation recovery, legacy pause recovery, independent series edits, three-week continuity, prior actual effort versus current targets/results, deload protection, owner/slot filtering and incompatible comparison groups. TypeScript and the repository test suite are the required checks. Physical-device rendering and authenticated backend roundtrips are not covered by these tests.
