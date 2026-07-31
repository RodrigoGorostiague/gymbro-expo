# PR3 Copy Inventory: Shop, Partner, Sharing, and Final Audit

Line numbers identify the reviewed PR3 baseline. `Translate` covers visible, audible, notification, and surfaced fallback copy; `Preserve` protects names and stable values; `Unreachable` requires evidence.

| # | File:line | Surface | Disposition | Reviewed copy / target or evidence |
|---:|---|---|---|---|
| 1 | `app/(tabs)/shop.tsx:79` | status | Translate | Por defecto · incluido |
| 2 | `app/(tabs)/shop.tsx:81` | status | Translate | Desbloqueado |
| 3 | `app/(tabs)/shop.tsx:85` | status | Translate | Previsualizando |
| 4 | `app/(tabs)/shop.tsx:88` | status | Translate | Activo |
| 5 | `app/(tabs)/shop.tsx:140` | action | Translate | Tema base |
| 6 | `app/(tabs)/shop.tsx:141` | action | Translate | Quitar tema |
| 7 | `app/(tabs)/shop.tsx:142` | action | Translate | Equipar |
| 8 | `app/(tabs)/shop.tsx:144` | action | Translate | Comprar |
| 9 | `app/(tabs)/shop.tsx:145` | status | Translate | Sin gemas |
| 10 | `app/(tabs)/shop.tsx:173` | help | Translate | Cómo ganar gemas |
| 11 | `app/(tabs)/shop.tsx:175` | dynamic reward | Translate | `{setComplete}` preserved in Spanish copy |
| 12 | `app/(tabs)/shop.tsx:176` | dynamic reward | Translate | `{routineComplete}` preserved in Spanish copy |
| 13 | `app/(tabs)/shop.tsx:177` | dynamic reward | Translate | `{weeklyGoalImprovement}` preserved in Spanish copy |
| 14 | `app/(tabs)/shop.tsx:192` | confirmation | Translate | Tema activo; ¿Volver al tema de tu perfil? |
| 15 | `app/(tabs)/shop.tsx:202` | purchase | Translate | item name/price preserved in Spanish question |
| 16 | `app/(tabs)/shop.tsx:222` | heading | Translate | Tienda |
| 17 | `app/(tabs)/shop.tsx:223` | guidance | Translate | Selecciona un tema para previsualizarlo |
| 18 | `app/(tabs)/shop.tsx:229` | balance | Translate | Tus gemas |
| 19 | `app/(tabs)/shop.tsx:245` | dynamic value | Preserve | `gems` numeric value |
| 20 | `components/CombineWithPartnerCard.tsx:32` | heading | Translate | partner name preserved |
| 21 | `components/CombineWithPartnerCard.tsx:34` | explanation | Translate | neutral partner/theme guidance |
| 22 | `components/CombineWithPartnerCard.tsx:54` | profile name | Preserve | `rodaja` |
| 23 | `components/CombineWithPartnerCard.tsx:59` | profile name | Preserve | `brisas` |
| 24 | `components/CombineWithPartnerCard.tsx:88` | toggle | Translate | partner name preserved |
| 25 | `components/CombineWithPartnerCard.tsx:100` | state | Translate | Activado / Desactivado |
| 26 | `components/CombineWithPartnerCard.tsx:109` | status | Translate | Modo dual activo en toda la aplicación |
| 27 | `components/ThemePreviewBar.tsx:37` | alert | Translate | item price/name preserved |
| 28 | `components/ThemePreviewBar.tsx:41` | confirmation | Translate | item price/name preserved |
| 29 | `components/ThemePreviewBar.tsx:62` | label | Translate | Vista previa |
| 30 | `components/ThemePreviewBar.tsx:63` | theme name | Preserve | `item.name` from reviewed metadata |
| 31 | `components/ShareRoutineModal.tsx:25` | surfaced fallback | Translate | unexpected sharing error |
| 32 | `components/ShareRoutineModal.tsx:63` | heading | Translate | Compartir rutina |
| 33 | `components/ShareRoutineModal.tsx:64` | user name | Preserve | `routine.name` byte-for-byte |
| 34 | `components/ShareRoutineModal.tsx:67` | warning | Translate | Ya compartiste esta rutina |
| 35 | `components/ShareRoutineModal.tsx:71` | action | Translate | partner profile preserved |
| 36 | `components/ChatFab.tsx:182` | accessibility | Translate | partner message meaning retained |
| 37 | `components/ChatFab.tsx:202` | accessibility | Translate | long-press purpose retained |
| 38 | `components/ChatFab.tsx:203` | accessibility | Translate | menu options retained |
| 39 | `constants/kiss.ts:11` | notification | Translate | neutral partner kiss message |
| 40 | `constants/kiss.ts:17` | notification | Translate | neutral encouragement message |
| 41 | `constants/kiss.ts:23` | notification | Translate | neutral warning message |
| 42 | `constants/kiss.ts:29` | notification | Translate | neutral departure message |
| 43 | `constants/kiss.ts:40` | profile mapping | Preserve | `rodaja` / `brisas` values |
| 44 | `constants/kiss.ts:45` | API identity | Preserve | Firebase collection values |
| 45 | `constants/kiss.ts:53` | notification | Translate | routine name/from preserved; `contigo` |
| 46 | `constants/kiss.ts:57` | notification | Translate | accepted routine name/from preserved |
| 47 | `constants/kiss.ts:61` | notification | Translate | rejected routine name/from preserved |
| 48 | `constants/welcome.ts:1` | welcome | Translate | three neutral, correctly accented messages |
| 49 | `constants/encouragement.ts:1` | encouragement | Translate | three neutral, complete messages |
| 50 | `constants/shopThemes.ts:13` | theme IDs | Preserve | profile and shop IDs unchanged |
| 51 | `constants/shopThemes.ts:79` | theme name | Translate | Lila suave; sentence case |
| 52 | `constants/shopThemes.ts:257` | description | Translate | Noche lila |
| 53 | `constants/shopThemes.ts:336` | categories | Translate | Spanish labels; `y` instead of `&` |
| 54 | `context/ShopContext.tsx:92` | preview alert | Translate | professional expiry message |
| 55 | `context/ShopContext.tsx:170` | reward alert | Translate | counts and gems preserved |
| 56 | `context/KissContext.tsx:84` | configuration alert | Translate | Sincronización no configurada |
| 57 | `context/KissContext.tsx:104` | runtime hint | Translate | Expo Go proper name preserved |
| 58 | `context/KissContext.tsx:107` | sent alert | Translate | partner/emoji preserved |
| 59 | `context/ShareContext.tsx:95` | surfaced error | Translate | unavailable receiver routine |
| 60 | `utils/storage.ts:343` | surfaced catalog error | Translate | Edítalos primero |
| 61 | `utils/storage.ts:377` | surfaced loading error | Translate | routine loading not finished |
| 62 | `utils/storage.ts:493` | surfaced history error | Translate | missing attempt |
| 63 | `utils/workoutAttempts.ts:72` | surfaced edit error | Translate | immutable attempt structure |
| 64 | `context/*Context.tsx` | provider invariant | Unreachable | hook errors only execute outside required provider; never rendered |
| 65 | `services/{kissSync,shareSync}.ts` | logs/identity | Preserve | English diagnostics and enum/API values never cross presentation boundary |
