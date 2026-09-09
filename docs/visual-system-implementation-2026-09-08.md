# Visual modernization: publications, identity, scenes and charts

Implemented four connected visual work units without changing backend payloads, wallet catalogs, purchased identifiers, dependencies, or the preceding UX modernization. This ledger covers the incremental visual changes after the 604-test baseline in `/tmp/gymbro-visual-baseline-20260908/`.

## Try the result

1. Open Community: individual sessions emphasize duration and exercise count; joint sessions emphasize actual participants; milestones use their actual event data. Reactions and detail navigation are separate targets. Open a shared recap for matching presentation and expandable safe exercise details.
2. Open Shop → Themes: eight family previews lead to one focused variant card. The collection toggle retains owned legacy themes; variants retain original purchase/equip flows.
3. Open Shop → Backgrounds: preview Forja, Aurora, Cumbre or Órbita and choose **Usar … en este dispositivo**. Restore the paid/account selection with **Usar fondo de mi colección**.
4. Open Progress or an exercise history chart: touch a point or use its labeled accessible button to inspect the same exact recorded values.

## Work units and coverage

| Unit | Implemented behavior | Main review boundary |
|---|---|---|
| Publications | Editorial duration hero, structural author-family texture, secondary facts, safe disclosure, independent bounded reaction, group participant hero, real milestone composition, coherent social detail | `WorkoutPublicationCard`, `PublicationReaction`, `JointWorkoutFeedCard`, `CommunityMilestoneCard`, social recap route, `WorkoutRecapAnalysis` |
| Eight families | Eight curated previews, deliberate variant selection, one actionable focused card, owned legacy collection, family geometry and procedural textures on shared cards/backgrounds | `themeFamilies`, `ThemeFamilyDiscovery`, `ThemeFamilyTexture`, `GlassCard`, shop route |
| Four scenes | Four distinct deterministic SVG compositions, shared motion policy, local persistence, preview timeout, failure rollback, account-background restoration | `useLocalAtmosphere`, `ProceduralAtmosphere`, `AtmospherePicker`, `BackgroundEngine`, `ThemeContext`, shop route |
| Charts | Shared typography, surfaces and timing; semantic legends; unit-separated scales; real touch selection plus accessible equivalent; zero-baseline bars, linear lines, live selected detail, bounded data transitions and static mini-radars | `chartDesign`, `ChartInspector`, line/progress/radar components, progress route |

### Exact family mapping

Catalog lookup is intentionally separate from discovery. No original catalog entry, price, ownership record or frame mapping was deleted or renamed. Automated coverage requires every one of the 65 shop/profile identifiers exactly once.

| Family | Representative | Structural identity | Retained variants |
|---|---|---|---|
| Esencial | `white` | Precise rails, restrained 12px corners | white, black, arena, cafe, pizarra |
| Forja | `cobre` | Diagonal steel, angular 6px corners, double border | red, cobre, volcan, nucleo, fenix, frame-heavy-duty, frame-hierro-fe-disciplina, frame-yo-soy-el-huno, frame-fuerza-rinoceronte, frame-fuerza-gorila, frame-this-is-sparta, frame-fuerza-tigre, profile-rodaja |
| Aurora | `aurora-boreal` | Ribbon curves, soft 32px surfaces | lila-suave, lavanda, sakura, cielo, aurora, aurora-boreal, frame-holy-fit, frame-banzai, profile-brisas |
| Prisma | `prisma` | Triangular facets, 16px surfaces, double border | lila-neon, violeta, cyberpunk, prisma, caramelo-acido, holograma, frame-neon-gym, frame-ruby-fit |
| Bosque | `bosque` | Organic stems, 26px surfaces | green, leaf, menta, bosque, jade-imperial, frame-celtic-spirit, frame-fuerza-cocodrilo, frame-medjay-core |
| Cumbre | `snowflake` | Mountain contours, sharp 4px surfaces | blue, oceano, snowflake, tormenta, frame-valhalla-training, frame-fuerza-elefante, seleccion-argentina |
| Órbita | `eclipse` | Orbital rings, rounded 40px surfaces | moon, star, medusa, eclipse, frame-fuerza-pantera |
| Podio | `frame-campeon-indiscutible` | Competition stripes, double-frame texture, 3px border | yellow, sun, coral, boca, river, atardecer, frame-campeon-indiscutible, frame-alfa, frame-spqr, frame-elegante-sport |

Existing palette colors and author identity remain authoritative. Texture/geometry add differentiation beyond hue; they do not create replacement ownership. Static bounded SVG textures avoid a Skia canvas or animation timer for each scrolling theme tile.

### Background integration and explicit tradeoff

The four atmospheres are **free device-local preferences**, not paid merchandise. Their names and scope are stated before activation. AsyncStorage stores only a validated local identifier; UI state updates after persistence succeeds. A failed write leaves the prior choice active and displays an error.

Precedence: temporary account preview → selected local atmosphere → equipped account background. Clearing the local override does not unequip or remove owned Banzai/Sakura. Choosing an already-equipped paid background while an atmosphere is active explicitly restores that background; choosing another owned background awaits confirmed account equip before clearing the local override. Remote failure preserves the local scene. If local persistence then fails, the UI states which account background was selected and offers the existing restore action as a retry; it does not claim a two-store rollback.

- Forja: layered steel plates, luminous seams, rising ember layer.
- Aurora: polar ridge/moon with three drifting luminous ribbons.
- Cumbre: layered mountains, snowcap and drifting cloud layer.
- Órbita: shaded planet, sparse stars and a rotating tilted orbital ring.

One animated layer per mounted scene, deterministic geometry, no remote asset fetch, no new sensor use. The picker mounts only its selected preview and removes it after 12 seconds. Inactive paid previews remain static. Shared animation policy covers foreground, focus, calm mode and OS reduced motion; static artwork remains visible.

**Not implemented by design:** profile/cross-device sync or paid scene SKUs. Existing SQL rejects unknown catalog IDs and unowned equips; deploying a new paid catalog was not authorized. No migration is needed for these local preferences. Existing frontend background prices and SQL seed prices differ; production pricing was not inspected or changed.

### Truthful publication and chart semantics

Public workout payloads do not identify weight unit or load mode. New heroes therefore use duration, exercise count and actual participant count—not invented PRs, comparisons or kilograms. Shared exercise rows preserve their numeric recorded load with an explicit unit/mode limitation; aggregate workload and volume deltas are withheld rather than asserting kilograms. Milestone volume copy does not invent a unit. Owner-only raw sessions are never substituted for public payloads.

Comparison panels partition different units into separate charts. Current/prior set comparison uses the same valid-set metric. Progress totals retain separate workload units; movement-pattern summaries no longer claim a mixed sum is kilograms. Line interpolation is linear to avoid artificial overshoot. Selected textual values come directly from actual data, never animation interpolation. Radar accessible detail reports real values/reference percentages; compact feed radars remain static to avoid repeated scroll reveals.

## Verification

Automated interaction tests use React Test Renderer with native/rendering stubs. They verify state, callbacks, ownership boundaries and supplied animation policy—not rendered GPU timing or physical touch ergonomics.

| Evidence | Result |
|---|---|
| Baseline | 93 files / 604 tests passed |
| Theme family catalog test | All 65 original IDs covered once, eight structures, unchanged lookup identity |
| Chart/radar/profile focused run | 3 files / 6 tests passed; touch selection, equivalent accessible values, separated units, static mode |
| Local atmosphere focused run | 1 file / 2 tests passed; persistence, failed-write rollback, single preview, timeout, retry, restore |
| Discovery/publication focused run | 2 files / 5 tests passed; focused legacy variant, eight tiles, four distinct scenes, static/active lifecycle, independent reaction |
| Paid-background restore route | `npm test -- tests/shopScreen.test.ts`: 1 file / 5 tests passed, including restore without purchase/unequip |
| Interim full suite | 97 files / 611 tests passed after correcting stale unit assertions and unmounting leaked background test renderers |
| Final verification | `npm test`: 97 files / 612 tests passed, exit 0; `npx tsc --noEmit`: passed, exit 0; `git diff --check`: passed, exit 0. Logs: `/tmp/gymbro-visual-full.log`, `/tmp/gymbro-visual-tsc.log`. No native-device validation claim |

The background test cleanup removes leaked prior renderers that otherwise subscribed after the test changed global platform state. It does not relax the one-subscription assertion. Public recap tests now explicitly reject unsupported `kg` and fabricated volume-delta labels.

## Rollback and remaining validation

Rollback these work units against the visual baseline—not against HEAD, which includes the previously approved UX implementation. Publications can be reverted together with their tests/social detail composition. Themes require reverting family helpers, shared card decoration and shop discovery together. Scenes require reverting local store, picker, renderer integration and theme-context precedence together. Chart components, their shared tokens/inspector and unit-aware callers form one rollback boundary. No schema or data rollback is required.

Physical-device checks remain: OLED/light palette contrast, reduced-motion settings toggled while mounted, VoiceOver/TalkBack focus order, touch inspection in a scrolling screen, low-power/background transitions, scene GPU cost and long-session battery impact, purchased-frame visual identity, font scaling and small-screen clipping. An independent immutable Expo export is planned after source handoff. Native visual quality/performance is not proven by component tests or a web bundle.

## References

- [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) — exact project SDK documentation checked before implementation.
- [Reanimated accessibility](https://docs.swmansion.com/react-native-reanimated/docs/guides/accessibility/) — system reduced motion remains part of the shared policy.
- [Expo Haptics](https://docs.expo.dev/versions/v56.0.0/sdk/haptics/) — haptics are optional supplementary feedback, never a sole success signal.


## Bounded correction: confirmed account equip before local clear

The initial route cleared device ambience before a fire-and-forget remote equip. This could discard the visible local selection despite a rejected server write. `ShopContext.equipBackground` now returns a caught, server-confirmed boolean and suppresses stale-account wallet responses. The owned-background route waits before clearing local state, blocks duplicate taps synchronously, and ignores completion after account change or unmount. It also preserves a newly changed local choice while equip was pending.

Remote rejection leaves local persistence untouched and explains retry. Remote success followed by local-clear failure leaves the device scene active, accurately names the confirmed account background, and directs the user to **Usar fondo de mi colección**. Already-equipped restoration still avoids purchase and unequip. No server schema, catalog, ownership or pricing change.

Correction boundary: `app/(tabs)/shop.tsx`, `context/ShopContext.tsx`, their two existing tests, and this ledger only. Tests cover rejected equip, confirmation-before-clear, local-clear failure, restore, duplicate taps, account switch in flight, and context server/stale-response contracts. Final correction verification: `npm test -- tests/shopScreen.test.ts tests/shopContext.test.ts`: 2 files / 13 tests passed; `npm test`: 97 files / 614 tests passed; `npx tsc --noEmit` and `git diff --check`: passed. All commands exited 0. Logs: `/tmp/gymbro-equip-focused.log`, `/tmp/gymbro-equip-full.log`, `/tmp/gymbro-equip-tsc.log`. Source stable for independent confirmation.

## Independent final delivery evidence

The targeted verifier confirmed the original atmosphere-loss finding corrected: remote rejection retains the local scene, remote success precedes local clearance, and partial local failure remains explicit and recoverable. No broader scope was reopened.

| Check | Result | Evidence |
|---|---|---|
| `npm test` | PASS, exit 0 — 97 files / 614 tests | `/tmp/gymbro-visual-final-tests.log` |
| `npx tsc --noEmit` | PASS, exit 0 | `/tmp/gymbro-visual-final-tsc.log` |
| `git diff --check` | PASS, exit 0 | `/tmp/gymbro-visual-final-diff-check.log` |
| `CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir /tmp/gymbro-visual-final-20260908` | PASS, exit 0 — 49 exported files; HTML-referenced assets exist | `/tmp/gymbro-visual-final-export.log`, `/tmp/gymbro-visual-final-assets.log` |

Final source snapshots were identical across 682 tracked and untracked source/config/test/assets files before and after verification: SHA256 `ec84f696046f911e4f3388b432c3167405a255c54e16a303e51fd7a336b057ab`. Evidence: `/tmp/gymbro-visual-final-source-evidence.log`.

The incremental visual change is 37 source/test paths relative to the preserved pre-visual baseline, not the entire uncommitted repository diff. Manifest: `/tmp/gymbro-visual-final-incremental-manifest.json`; exact diff: `/tmp/gymbro-visual-final-incremental.diff`. Documentation is recorded separately and excluded from source stability hashes. This section is documentation-only; no production bytes changed after verification.

These results supersede the 612-test candidate and interim exports. Native rendering, touch ergonomics, accessibility output and GPU/battery performance remain unverified on physical devices. No commit, deployment, new dependency or backend catalog change was performed.
