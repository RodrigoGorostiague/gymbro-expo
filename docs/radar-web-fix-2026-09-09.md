# Browser-safe muscle distribution radar

The full muscle distribution radar now uses SVG on web and preserves Skia on native. Opening an empty or populated own/public profile no longer requires CanvasKit for this chart. No package, app bootstrap, backend or profile-draft behavior changed.

## Cause and decision

The previous shared component imported Skia before web CanvasKit initialization and constructed `Skia.PathBuilder` paths before its empty-state return. This could crash the screen even with no exercise history. [Skia's official web guidance](https://shopify.github.io/react-native-skia/docs/getting-started/web/) requires CanvasKit initialization before importing Skia.

A simple SVG drawing layer avoids adding WASM loading, network failure recovery, or a global app-start dependency. The app already uses `react-native-svg` for the mini radar, which was unaffected. Expo's native module resolution selects the separate `.native.tsx` Skia layer; the web/default module imports no Skia.

## Preserved behavior

- Shared geometry, 90-day summary, empty state, reference comparison, theme palette and point-selection detail.
- Existing focus/reduced-motion-aware chart reveal and accessible text/button labels.
- Native Skia rings, axes, reference outline, gradient fill and focus glow.
- Web SVG uses equivalent geometry, gradient and layered stroke emphasis rather than a Skia blur; its viewBox scales with the existing labels on narrow layouts.

The shared full chart covers the owner profile and public social profile. No public-profile data or privacy projection changed. Other Skia/Victory visualizations are outside this fix.

## Evidence

- `npx vitest run tests/muscleDistributionRadarWeb.test.ts`: **2 failures before implementation**, both caused by unavailable CanvasKit.
- `npx vitest run tests/muscleDistributionRadarWeb.test.ts tests/muscleDistributionRadar.test.ts tests/socialScreen.test.ts tests/socialProfileScreen.test.ts`: **47 passed** after implementation.
- Web tests reject any Skia import, then exercise empty/populated/reference/point-focus/narrow-layout behavior.
- Native drawing test verifies Skia canvas, path count, gradient and focused glow.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.
- `npx expo export --platform web --output-dir /tmp/gymbro-radar-web-20260909`: passed.
- Temporary SPA QA server: `http://127.0.0.1:8769/profile`; actual authenticated browser acceptance is delegated to the parent. Component tests and export do not substitute for visual acceptance.

## Rollback boundary

Revert only the radar wrapper/drawing-layer files, radar tests, SVG test-stub additions and this document. The ongoing seven-file profile modernization is independent and must remain intact. No commits or deployments were created.
