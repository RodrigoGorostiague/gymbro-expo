# Body evolution

More → Body Evolution combines today's optional weight, measurements and pose photos. The existing profile/measurements route remains an alias so Progress links continue to work.

## Rules

- One calendar group per day. New numeric values merge atomically by owner, day and metric type.
- Only today can be created/completed. The server checks the supplied IANA time zone against its clock; new records retain their calendar key when the device time zone changes.
- Legacy measurements are not rewritten or deduplicated. They are grouped by device-local date, and repeated values remain visible with an explanatory label.
- Existing numeric history stays private in Supabase. Photos remain in account-scoped device document storage, indexed in AsyncStorage.
- One saved photo per pose/day. Replacement requires confirmation; taking a photo does not save it until explicitly confirmed.
- Gallery saving is attempted after the internal copy commits. Denial/failure does not discard the internal photo.
- Deleting a photo/record does not delete gallery copies. Deleting the full record spans remote numbers and local photos: on partial failure the screen reloads surviving data and supports retry.
- Onboarding writes through the same atomic daily API.

## Capture and comparison

Four vector guides: front double biceps, front legs, back, and left profile/glutes. Guides describe positioning, not ideal proportions. Front camera is default; the rear camera is available. A ten-second visible/audible countdown leaves both hands free. Backgrounding cancels the countdown. A separate double tone signals completed capture. Confirmations crossing midnight are rejected rather than backdated.

Select a pose and two dates in History. The vertical divider reveals two full-size, undistorted images. Accessible adjustment actions and explicit earlier/middle/recent buttons avoid requiring a dragging gesture. Optional view-only alignment translates/uniformly scales the recent image without modifying originals. Elapsed calendar days are not presented as verified training time.

## Privacy and limitations

The gallery can sync to cloud services depending on device settings. GymBro cannot promise that exported photos remain exclusively on the phone. Device backups may also include app documents. Account separation is not an encryption guarantee. Photos are not automatically recovered in GymBro after reinstall or on another device; numeric records remain in the account. Camera capture is native-only; web supports numeric history but explains that capture requires Android/iOS.

The pre-existing legacy `record_body_metric` RPC remains unchanged for backwards compatibility; current onboarding and the new view use `save_body_day`. Legacy clients can still append timestamped rows, which the new history preserves.

## Deployment

The migration `supabase/migrations/20260917180000_body_evolution.sql` was applied and registered in local Supabase only. Apply it to other environments before using the new numeric flow. Rebuild native binaries for the new camera/media-library plugins and permissions. Dependencies were selected by `expo install` against the existing SDK 57; the required SDK 56 docs were also consulted. No SDK downgrade was performed.

## Verification

- Vitest: calendar boundaries, duplicate preservation, batch persistence, local photo account isolation/replacement/failures, progressive measurement UI, confirmed deletion, countdown cancellation, and accessible comparison.
- pgTAP: atomic batches, current-day enforcement, daily uniqueness, legacy retention, owner isolation, and deletion.
- TypeScript and Expo web/Android export.
- Still requires device QA: real front/rear orientation, audible capture with phone settings, framing, permission denial, low storage, accessibility text scaling, and gallery export on iOS/Android.
