# A read-first athlete profile

The own-profile screen now leads with identity and real training history instead of a form. The existing community privacy, cosmetic ownership, and normalized-save contracts remain unchanged. Both `/profile` and the Profile tab share this implementation.

## What changed

| Area | Implemented behavior |
| --- | --- |
| Athlete overview | Theme-gradient identity cover, equipped avatar/frame/title, biography, explicit draft label, real level/XP and accessible progressbar. No fabricated achievements. |
| Training story | Unique valid completed sessions, rolling 30-day count, total recorded minutes, latest session with history navigation. Explicitly owner-only and based on available history. Loading/error/retry and first-session states replace misleading zero totals. |
| Navigation | Four large labeled sections with icons and secondary descriptions; dedicated identity/personalization actions; useful progress, preferences, history, measurement and shop destinations. |
| Editing | Labeled alias/description fields; existing sharing/cosmetic options retained; one persistent save dock, confirmed discard of drafts against the latest confirmed same-account profile and visible saved status. Leaving a dirty editor remains guarded. |
| Recovery | Inline profile refresh error, retained last information, pull-to-refresh and retry. Rejected saves preserve the draft; normalized successful saves reconcile only unchanged fields. |
| Account safety | Editor keyed to authenticated account, mismatched profile excluded, obsolete async saves ignored after unmount; synchronous duplicate-save lock. |
| Preferences | Calm dedicated preferences page with clearer hierarchy and explicit device-local persistence explanation. Existing sensory settings are reused unchanged. |
| Accessibility | Wrapped layouts, bounded content width, labeled controls, selected tabs, live status, progress semantics and minimum-sized action targets. XP transition is bounded and uses the app's focus/foreground/reduced-motion policy. |

## Verification

- `npx vitest run tests/socialScreen.test.ts tests/profileOverview.test.ts`: **37 tests passed** across 2 files.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- Added tests cover invalid/future/duplicate history, duration sanitization, private read-first presentation, history loading/retry, real accessible XP, confirmed discard and account-switch isolation during save.
- Existing tests continue covering dirty drafts across refresh/navigation, normalized saves, edits made during saves, legacy/malformed preferences, cosmetic selection, privacy switches and category preservation.

## Review correction

Discard now reads the latest confirmed profile from a ref at confirmation time, falling back to the hydrated baseline only when no matching profile is available. This prevents a refresh received while dirty (or while the confirmation dialog is open) from being lost, including remotely changed privacy. Accepted saves also update that ref, and unmounted or actively saving editors ignore obsolete discard callbacks.

Regression evidence: the two new refresh/discard scenarios failed before the correction and passed afterward; both verify refreshed identity, biography and privacy, and assert a subsequent save retains the refreshed privacy values. Focused suite: 37 passed. TypeScript and diff check passed after correction.

## Boundaries and remaining checks

No dependencies, database migrations, pricing/catalog changes, public-profile projection changes, commits or deployments. Existing measurement and blocked-user destination behavior is preserved, not rewritten. Real-device keyboard, font scaling, reduced-motion and screen-reader QA remain required. Browser/native rendering is not claimed by the component tests.

Runtime harness: component interaction tests exercise the profile route through its existing provider mocks; an authenticated device session is still required for end-to-end backend and visual acceptance.

Rollback boundary: the profile route and preferences page, `components/ProfileOverview.tsx`, `utils/profileOverview.ts`, their tests and this document. No shared feed or data-provider behavior must be reverted.
