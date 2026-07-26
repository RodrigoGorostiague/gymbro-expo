# PR2 Copy Inventory: Navigation, Training, and Catalog

Disposition is `Translate` for interface copy and `Preserve` for names, symbols, routes, identifiers, and accepted values. Line numbers identify the reviewed pre-translation PR2 baseline.

| # | File:line | Surface | Disposition | Reviewed copy / target |
|---:|---|---|---|---|
| 1 | `app/index.tsx:45` | alert | Translate | Error; Usuario o contraseña incorrectos |
| 2 | `app/(tabs)/_layout.tsx:95` | navigation | Translate | Rutinas |
| 3 | `app/(tabs)/_layout.tsx:104` | navigation | Translate | Ejercicios |
| 4 | `app/(tabs)/_layout.tsx:113` | navigation | Translate | Progreso |
| 5 | `app/(tabs)/_layout.tsx:125` | navigation | Translate | Tienda |
| 6 | `app/(tabs)/routines/index.tsx:36` | alert | Translate | ¡Bienvenida! |
| 7 | `app/(tabs)/routines/index.tsx:37` | alert action | Translate | Gracias 💕 |
| 8 | `app/(tabs)/routines/index.tsx:43` | destructive alert | Translate | Eliminar rutina; ¿Eliminar "{name}"? |
| 9 | `app/(tabs)/routines/index.tsx:44` | alert action | Translate | Cancelar |
| 10 | `app/(tabs)/routines/index.tsx:45` | alert action | Translate | Eliminar |
| 11 | `app/(tabs)/routines/index.tsx:53` | heading | Translate | Mis rutinas |
| 12 | `app/(tabs)/routines/index.tsx:54` | subtitle | Translate | Mesociclos — carpetas de ejercicios |
| 13 | `app/(tabs)/routines/index.tsx:68` | action | Translate | + Nueva |
| 14 | `app/(tabs)/routines/index.tsx:76` | empty state | Translate | Aún no tienes rutinas |
| 15 | `app/(tabs)/routines/index.tsx:79` | empty state | Translate | Crea tu primera rutina como un mesociclo con ejercicios y series. |
| 16 | `app/(tabs)/routines/index.tsx:97` | dynamic name | Preserve | `item.name` byte-for-byte |
| 17 | `app/(tabs)/routines/index.tsx:101` | status | Translate | Compartida |
| 18 | `app/(tabs)/routines/index.tsx:106` | dynamic count | Translate | `{count} ejercicio(s)` |
| 19 | `app/(tabs)/routines/index.tsx:123` | metadata | Preserve | muscle-group label lookup |
| 20 | `app/(tabs)/routines/index.tsx:174` | status | Translate | Compartida |
| 21 | `app/(tabs)/routines/index.tsx:176` | status | Translate | Pendiente de aceptación |
| 22 | `app/(tabs)/routines/index.tsx:177` | dynamic action | Translate | Compartir con `{partner}` |
| 23 | `app/(tabs)/routines/index.tsx:220` | action | Translate | ▶ Entrenar |
| 24 | `app/routine/create.tsx:24` | validation | Translate | Ingresa un nombre para la rutina. |
| 25 | `app/routine/create.tsx:26` | validation | Translate | Selecciona al menos un grupo muscular. |
| 26 | `app/routine/create.tsx:47` | heading | Translate | Nueva rutina |
| 27 | `app/routine/create.tsx:47` | subtitle | Translate | Nombre y grupos musculares |
| 28 | `app/routine/create.tsx:51` | placeholder | Translate | Ej.: Día de empuje, Piernas, Cuerpo completo... |
| 29 | `app/routine/create.tsx:65` | field label | Translate | Grupos musculares |
| 30 | `app/routine/create.tsx:81` | action | Translate | Crear rutina |
| 31 | `app/routine/create.tsx:83` | action | Translate | Cancelar |
| 32 | `app/routine/[id].tsx:81` | validation | Translate | Selecciona al menos un grupo muscular. |
| 33 | `app/routine/[id].tsx:91` | alert | Translate | Guardado; Rutina actualizada |
| 34 | `app/routine/[id].tsx:159` | action | Translate | ▶ Ejecutar |
| 35 | `app/routine/[id].tsx:173` | heading | Translate | Editar rutina |
| 36 | `app/routine/[id].tsx:174` | subtitle | Translate | Ejercicios y series |
| 37 | `app/routine/[id].tsx:177` | field label | Translate | Nombre |
| 38 | `app/routine/[id].tsx:178` | placeholder | Translate | Nombre de la rutina |
| 39 | `app/routine/[id].tsx:182` | field label | Translate | Grupos musculares |
| 40 | `app/routine/[id].tsx:194` | user-created name | Preserve | `exercise.name` byte-for-byte |
| 41 | `app/routine/[id].tsx:196` | user-created variant | Preserve | `exercise.variant` byte-for-byte |
| 42 | `app/routine/[id].tsx:219` | explanatory copy | Translate | Solo puedes editar las series. |
| 43 | `app/routine/[id].tsx:222` | column label | Translate | Serie |
| 44 | `app/routine/[id].tsx:223` | column label | Translate | Peso |
| 45 | `app/routine/[id].tsx:224` | column label | Translate | Repeticiones |
| 46 | `app/routine/[id].tsx:235` | unit placeholder | Preserve | kg |
| 47 | `app/routine/[id].tsx:244` | placeholder | Translate | repeticiones |
| 48 | `app/routine/[id].tsx:259` | action | Translate | + Serie |
| 49 | `app/routine/[id].tsx:265` | action | Translate | + Agregar ejercicio |
| 50 | `app/routine/[id].tsx:270` | action | Translate | Guardar rutina |
| 51 | `app/routine/[id].tsx:284` | route | Preserve | `/exercise/create` |
| 52 | `app/routine/execute/[id].tsx:37` | set label | Translate | Calentamiento |
| 53 | `app/routine/execute/[id].tsx:38` | set label | Translate | Serie al fallo |
| 54 | `app/routine/execute/[id].tsx:39` | dynamic set label | Translate | Serie `{tipo}` |
| 55 | `app/routine/execute/[id].tsx:106` | alert | Translate | Descanso terminado |
| 56 | `app/routine/execute/[id].tsx:107` | alert | Translate | Continúa con la próxima serie. |
| 57 | `app/routine/execute/[id].tsx:108` | alert action | Translate | Entendido |
| 58 | `app/routine/execute/[id].tsx:157` | validation | Translate | Datos incompletos; ingresa peso y repeticiones. |
| 59 | `app/routine/execute/[id].tsx:164` | encouragement alert | Translate | ¡Serie!; ¡Vamos! |
| 60 | `app/routine/execute/[id].tsx:183` | user-created name | Preserve | exercise name snapshot |
| 61 | `app/routine/execute/[id].tsx:196` | technical invariant | Preserve | Authentication required. never surfaces directly |
| 62 | `app/routine/execute/[id].tsx:214` | error | Translate | No se pudo guardar el entrenamiento |
| 63 | `app/routine/execute/[id].tsx:215` | error | Translate | Revisa el almacenamiento e inténtalo de nuevo. |
| 64 | `app/routine/execute/[id].tsx:224` | confirmation | Translate | Finalizar entrenamiento; ¿Terminaste el entrenamiento? |
| 65 | `app/routine/execute/[id].tsx:225` | alert action | Translate | Seguir |
| 66 | `app/routine/execute/[id].tsx:226` | alert action | Translate | Finalizar |
| 67 | `app/routine/execute/[id].tsx:236` | navigation | Translate | ← Cancelar |
| 68 | `app/routine/execute/[id].tsx:237` | subtitle | Translate | Configura el entrenamiento antes de iniciar |
| 69 | `app/routine/execute/[id].tsx:240` | field label | Translate | Temporizador de descanso (segundos) |
| 70 | `app/routine/execute/[id].tsx:246` | numeric placeholder | Preserve | 90 |
| 71 | `app/routine/execute/[id].tsx:249` | explanatory copy | Translate | El descanso se reinicia al completar una serie. |
| 72 | `app/routine/execute/[id].tsx:254` | action | Translate | Iniciar entrenamiento |
| 73 | `app/routine/execute/[id].tsx:266` | completion | Translate | ¡Entrenamiento completado! |
| 74 | `app/routine/execute/[id].tsx:268` | dynamic duration | Translate | Tiempo: `{duration}` |
| 75 | `app/routine/execute/[id].tsx:271` | dynamic reward | Preserve | `+{earnedGems} gemas` |
| 76 | `app/routine/execute/[id].tsx:275` | navigation | Translate | Volver a rutinas |
| 77 | `app/routine/execute/[id].tsx:292` | timer label | Translate | Cronómetro |
| 78 | `app/routine/execute/[id].tsx:298` | timer label | Translate | Descanso |
| 79 | `app/routine/execute/[id].tsx:311` | dynamic progress | Translate | Series completadas: `{done}/{total}` |
| 80 | `app/routine/execute/[id].tsx:318` | fallback name | Translate | Sin nombre |
| 81 | `app/routine/execute/[id].tsx:342` | set metadata | Translate | Sin repeticiones / Bloque `{n}` |
| 82 | `app/routine/execute/[id].tsx:346` | status | Translate | ✓ Hecha |
| 83 | `app/routine/execute/[id].tsx:353` | field label | Translate | Peso (kg) |
| 84 | `app/routine/execute/[id].tsx:365` | field label | Translate | Repeticiones al fallo |
| 85 | `app/routine/execute/[id].tsx:372` | field label | Translate | Repeticiones |
| 86 | `app/routine/execute/[id].tsx:390` | action | Translate | Finalizar serie |
| 87 | `app/routine/execute/[id].tsx:402` | action | Translate | Finalizar entrenamiento |
| 88 | `app/(tabs)/exercises/index.tsx:26` | destructive alert | Translate | Eliminar ejercicio; ¿Eliminar "{name}" del catálogo? |
| 89 | `app/(tabs)/exercises/index.tsx:37` | error | Translate | No se pudo eliminar |
| 90 | `app/(tabs)/exercises/index.tsx:38` | error fallback | Translate | Inténtalo nuevamente. |
| 91 | `app/(tabs)/exercises/index.tsx:52` | heading | Translate | Ejercicios |
| 92 | `app/(tabs)/exercises/index.tsx:53` | subtitle | Translate | Catálogo global para reutilizar en rutinas |
| 93 | `app/(tabs)/exercises/index.tsx:54` | action | Translate | + Nuevo |
| 94 | `app/(tabs)/exercises/index.tsx:62` | filter | Translate | Todos |
| 95 | `app/(tabs)/exercises/index.tsx:82` | empty state | Translate | No hay ejercicios todavía |
| 96 | `app/(tabs)/exercises/index.tsx:83` | empty state | Translate | Crea ejercicios con grupos musculares, variante y series por defecto. |
| 97 | `app/(tabs)/exercises/index.tsx:94` | user-created name | Preserve | `item.name` byte-for-byte |
| 98 | `app/(tabs)/exercises/index.tsx:96` | dynamic metadata | Translate | variant · `{count}` serie(s) |
| 99 | `app/(tabs)/exercises/index.tsx:100` | action | Translate | Editar |
| 100 | `app/(tabs)/exercises/index.tsx:114` | action | Translate | Eliminar |
| 101 | `app/exercise/create.tsx:75` | error fallback | Translate | Inténtalo nuevamente. |
| 102 | `app/exercise/create.tsx:93` | validation | Translate | El nombre no puede estar vacío. |
| 103 | `app/exercise/create.tsx:97` | validation | Translate | Selecciona al menos un grupo muscular. |
| 104 | `app/exercise/create.tsx:105` | validation | Preserve | set values C, F, or positive number |
| 105 | `constants/muscleGroups.ts:19` | display metadata | Translate | `fullBody` → Cuerpo completo; value preserved |

Reviewed reachable helper copy also remains Spanish in `components/{AppNavBar,ExercisePicker,LogoutButton,UI}.tsx` and `components/login/**`. Sharing, partner, shop, notifications, progress/history, and the final English audit remain outside PR2.
