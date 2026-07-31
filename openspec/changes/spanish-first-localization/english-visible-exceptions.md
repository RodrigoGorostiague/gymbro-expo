# Reviewed English-Visible Exceptions

The reachable audit covers Expo Router screens, rendered components, display metadata, notifications, and errors crossing presentation boundaries. The PR3 static test rejects reviewed English and regional copy.

| Finding | Classification | Evidence |
|---|---|---|
| `GymBro` | Proper name | Product name in notification titles and login branding |
| `rodaja`, `brisas` | Profile/user names | Stable `UserProfile` values and displayed profile names; user data is preserved |
| `Expo Go`, `Firebase`, `Firestore` | Proper/technical names | Platform/service names; surrounding user copy is Spanish |
| `kg`, `lb`, `%`, `C`, `F` | Symbols/accepted values | Units and set-type values required by parsers and persisted data |
| `YYYY-MM-DD`, `HH:MM` | Accepted format tokens | Existing parser guidance; formatting behavior is unchanged |
| `external-load`, `bodyweight`, `assisted` | Technical enum values | Storage/analytics identity; Spanish labels remain at presentation sites |
| `pending`, `accepted`, `rejected` | API enum values | Firestore share status contract; UI labels are Spanish |
| `routine_share`, `routine_accepted`, `routine_rejected` | API values | Notification routing identity; notification title/body are Spanish |
| `white`, `black`, theme/category IDs | Storage identity | Persisted IDs remain unchanged; names/descriptions shown to users are reviewed Spanish |
| Expo Router paths | Route identity | Never rendered as copy; changing them would break navigation |
| AsyncStorage/Firebase keys | Storage/API identity | Never rendered; changing them would break persisted/remote data |
| English `console.*` diagnostics | Technical-only | Only development logs in share synchronization; specification requires logs unchanged |
| `use* must be used within *Provider` | Unreachable invariant | Throws only for invalid provider wiring; required providers wrap every reachable route |
| English source comments | Technical-only | Not bundled as user-visible text and do not cross a presentation boundary |

No reviewed reachable English or regional/voseo interface copy remains. User-created routine, exercise, variant, and profile names remain byte-for-byte unchanged.
