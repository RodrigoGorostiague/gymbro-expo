# PR1 Copy Inventory — Progress and History

Authoritative scope: reachable progress dashboard, filters/charts, legacy-history resolution, session history/detail, and session presentation errors. Every `Translate` row was reviewed in context; repeated line numbers identify distinct literals at the same call site.

| # | File:line | Surface | Disposition | Reviewed copy or exception |
|---:|---|---|---|---|
| 1 | `app/(tabs)/progress.tsx:27` | Visible/tab | Translate | `Resumen` |
| 2 | `app/(tabs)/progress.tsx:27` | Visible/tab | Translate | `Músculos` |
| 3 | `app/(tabs)/progress.tsx:28` | Visible/tab | Translate | `Ejercicios` |
| 4 | `app/(tabs)/progress.tsx:28` | Visible/tab | Translate | `Rutinas` |
| 5 | `app/(tabs)/progress.tsx:51` | Visible/title | Translate | `Mi progreso` |
| 6 | `app/(tabs)/progress.tsx:58` | Dynamic | Translate | Session count uses `sesiones de entrenamiento`; counts unchanged |
| 7 | `app/(tabs)/progress.tsx:62` | Visible/header | Translate | Legacy-history resolution heading |
| 8 | `app/(tabs)/progress.tsx:62` | Dynamic | Translate | Ownerless session count and profile interpolation |
| 9 | `app/(tabs)/progress.tsx:62` | Accessibility | Translate | Assignment consequence; profile preserved |
| 10 | `app/(tabs)/progress.tsx:62` | Visible/action | Translate | `Asignar a {owner}` |
| 11 | `app/(tabs)/progress.tsx:62` | Accessibility | Translate | Irreversible-deletion confirmation hint |
| 12 | `app/(tabs)/progress.tsx:62` | Alert/title | Translate | Legacy session deletion question |
| 13 | `app/(tabs)/progress.tsx:62` | Alert/body | Translate | Permanent deletion consequence |
| 14 | `app/(tabs)/progress.tsx:62` | Alert/action | Translate | `Cancelar` |
| 15 | `app/(tabs)/progress.tsx:62` | Alert/action | Translate | `Eliminar permanentemente` |
| 16 | `app/(tabs)/progress.tsx:62` | Visible/action | Translate | `Eliminar permanentemente` |
| 17 | `app/(tabs)/progress.tsx:69` | Visible/header | Translate | `Resumen` |
| 18 | `app/(tabs)/progress.tsx:70` | Visible/header | Translate | `Exposición muscular ponderada` |
| 19 | `app/(tabs)/progress.tsx:72` | Dynamic/chart | Translate | Load-mode and indicator display labels; enum values unchanged |
| 20 | `app/(tabs)/progress.tsx:72` | Dynamic/chart | Translate | `conteo` fallback and `frente a` comparison |
| 21 | `app/(tabs)/progress.tsx:79` | Visible/header | Translate | `Historial` |
| 22 | `app/(tabs)/progress.tsx:84` | Accessibility | Translate | Edit label; routine name preserved |
| 23 | `app/(tabs)/progress.tsx:85` | Accessibility | Translate | Completed-session detail hint |
| 24 | `app/(tabs)/progress.tsx:97` | Visible/action | Translate | `Editar sesión` |
| 25 | `components/progress/Filters.tsx:15` | Visible/input | Translate | Historical-options placeholder |
| 26 | `components/progress/Filters.tsx:15` | Dynamic | Translate | Historical marker; option label preserved |
| 27 | `components/progress/Filters.tsx:20` | Visible/action | Translate | `Borrar filtro` |
| 28 | `app/session/[id].tsx:111` | Validation/error | Translate | Date/time validation; format tokens preserved |
| 29 | `app/session/[id].tsx:119` | Validation/error | Translate | Required workout duration |
| 30 | `app/session/[id].tsx:124` | Validation/error | Translate | Non-negative workout duration |
| 31 | `app/session/[id].tsx:128` | Validation/error | Translate | Required rest duration |
| 32 | `app/session/[id].tsx:133` | Validation/error | Translate | Whole non-negative rest seconds |
| 33 | `app/session/[id].tsx:143` | Validation/error | Translate | Required set weight; exercise name preserved |
| 34 | `app/session/[id].tsx:146` | Validation/error | Translate | Required repetitions; exercise name preserved |
| 35 | `app/session/[id].tsx:151` | Validation/error | Translate | Non-negative weight; exercise name preserved |
| 36 | `app/session/[id].tsx:154` | Validation/error | Translate | Whole non-negative repetitions; exercise name preserved |
| 37 | `app/session/[id].tsx:175` | Validation/error | Translate | Bounded unknown-validation fallback |
| 38 | `app/session/[id].tsx:183` | Alert/title | Translate | Updated-session confirmation |
| 39 | `app/session/[id].tsx:183` | Alert/body | Translate | Historical-session save confirmation |
| 40 | `app/session/[id].tsx:184` | Alert/action | Translate | `Aceptar` |
| 41 | `app/session/[id].tsx:187` | Error | Translate | Bounded save fallback |
| 42 | `app/session/[id].tsx:196` | Alert/title | Translate | Completed-session deletion question |
| 43 | `app/session/[id].tsx:197` | Alert/body | Translate | Permanent deletion and reward invariants |
| 44 | `app/session/[id].tsx:199` | Alert/action | Translate | `Cancelar` |
| 45 | `app/session/[id].tsx:201` | Alert/action | Translate | `Eliminar` |
| 46 | `app/session/[id].tsx:210` | Error | Translate | Bounded deletion fallback |
| 47 | `app/session/[id].tsx:224` | Loading | Translate | Session loading state |
| 48 | `app/session/[id].tsx:236` | Empty/error | Translate | Session-not-found heading |
| 49 | `app/session/[id].tsx:237` | Empty/error | Translate | Already-deleted explanation |
| 50 | `app/session/[id].tsx:249` | Navigation | Translate | `← Progreso` |
| 51 | `app/session/[id].tsx:257` | Visible/help | Translate | Historical-only edit scope |
| 52 | `app/session/[id].tsx:264` | Visible/header | Translate | Session details |
| 53 | `app/session/[id].tsx:267` | Visible/label | Translate | `Fecha` |
| 54 | `app/session/[id].tsx:269` | Accessibility | Translate | Completion date |
| 55 | `app/session/[id].tsx:278` | Visible/label | Translate | `Hora` |
| 56 | `app/session/[id].tsx:280` | Accessibility | Translate | Completion time |
| 57 | `app/session/[id].tsx:289` | Visible/label | Translate | Workout duration in minutes |
| 58 | `app/session/[id].tsx:291` | Accessibility | Translate | Workout duration in minutes |
| 59 | `app/session/[id].tsx:297` | Visible/label | Translate | Rest duration in seconds |
| 60 | `app/session/[id].tsx:299` | Accessibility | Translate | Rest duration in seconds |
| 61 | `app/session/[id].tsx:316` | Dynamic/label | Translate | Set number; index unchanged |
| 62 | `app/session/[id].tsx:318` | Visible/label | Translate | `Completada` |
| 63 | `app/session/[id].tsx:320` | Accessibility | Translate | Exercise, set number, completion state |
| 64 | `app/session/[id].tsx:331` | Visible/label | Translate | Weight; `kg` preserved |
| 65 | `app/session/[id].tsx:333` | Accessibility | Translate | Exercise, set number, weight |
| 66 | `app/session/[id].tsx:341` | Visible/label | Translate | `Repeticiones` |
| 67 | `app/session/[id].tsx:343` | Accessibility | Translate | Exercise, set number, repetitions |
| 68 | `app/session/[id].tsx:357` | Visible/action | Translate | `Guardar cambios` |
| 69 | `app/session/[id].tsx:359` | Visible/action | Translate | `Eliminar sesión` |
| 70 | `app/session/[id].tsx:360` | Visible/help | Translate | Reward invariance note |
| 71 | `context/DataContext.tsx:140` | Error fallback | Translate | Workout-data load fallback |
| 72 | `context/DataContext.tsx:152` | Surfaced error | Translate | Authentication required for quarantine resolution |
| 73 | `context/DataContext.tsx:290` | Surfaced error | Translate | Authentication required for session creation |
| 74 | `context/DataContext.tsx:309` | Surfaced error | Translate | Session not found |
| 75 | `context/DataContext.tsx:312` | Surfaced error | Translate | Session identity invariant |
| 76 | `context/DataContext.tsx:315` | Surfaced error | Translate | Invalid completion date/time |
| 77 | `context/DataContext.tsx:318` | Surfaced error | Translate | Whole non-negative workout seconds |
| 78 | `context/DataContext.tsx:321` | Surfaced error | Translate | Whole non-negative rest seconds |
| 79 | `context/DataContext.tsx:324` | Surfaced error | Translate | Exercise-structure invariant |
| 80 | `context/DataContext.tsx:336` | Surfaced error | Translate | Exercise-structure invariant |
| 81 | `context/DataContext.tsx:344` | Surfaced error | Translate | Set-structure invariant |
| 82 | `context/DataContext.tsx:347` | Surfaced error | Translate | Non-negative set weight |
| 83 | `context/DataContext.tsx:350` | Surfaced error | Translate | Whole non-negative repetitions |
| 84 | `context/DataContext.tsx:353` | Surfaced error | Translate | Invalid set completion state |
| 85 | `context/DataContext.tsx:395` | Surfaced error | Translate | Session not found on deletion |
| 86 | `app/session/[id].tsx:272` | Input format | Preserve | `YYYY-MM-DD` parser contract |
| 87 | `app/session/[id].tsx:283` | Input format | Preserve | `HH:MM` parser contract |
| 88 | `app/(tabs)/progress.tsx:25` | Technical | Preserve | Scope enum values |
| 89 | `app/(tabs)/progress.tsx:62` | Technical | Preserve | Quarantine actions `assign` and `delete` |
| 90 | `app/(tabs)/progress.tsx:72` | Technical | Preserve | Load-mode and indicator enum values |
| 91 | `app/(tabs)/progress.tsx:86` | Route | Preserve | `/session/[id]` and `id` parameter |
| 92 | `app/(tabs)/progress.tsx:94` | Date/unit | Preserve | `es` formatter, date value, and `min` symbol |
| 93 | `components/LineChart.tsx:74` | Unit/value | Preserve | Numeric chart value and supplied unit |
| 94 | `context/DataContext.tsx:114` | Identity | Preserve | Profile enum values `rodaja` and `brisas` |
| 95 | `context/DataContext.tsx:375` | Sorting | Unreachable | ISO timestamp sorting has no presentation copy |

## Reviewed English exceptions

- Technical identifiers, enum literals, routes, test descriptions, and source comments are not public UI.
- `YYYY-MM-DD`, `HH:MM`, `kg`, `lb`, `%`, `min`, and `rep` are accepted format/unit symbols.
- User-generated routine and exercise names are interpolated unchanged, even when they contain English.
