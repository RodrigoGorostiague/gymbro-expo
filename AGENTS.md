# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Implementation Workflow

GymBro does not use the native Gentle AI SDD runtime lifecycle for implementation work.

- Do not invoke `gentle-ai sdd-attempt`, `gentle-ai sdd-continue`, or native SDD runtime/review gates.
- Treat `openspec/changes/content-sharing-community-feed/` as a normal implementation plan and reference, not an active native SDD lifecycle.
- Leave `.git/gentle-ai/sdd-runtime/` entirely untouched as historical evidence. Its verified backup is `/home/rodaja/gymbro-ledger-backups/sdd-runtime-20260801T004933Z.tar`.
- Continue with normal scoped implementation, tests, and user-authorized review or commit behavior. Do not automatically retry or reset native SDD work.
