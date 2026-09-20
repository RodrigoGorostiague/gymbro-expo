# Consolidación y guía funcional — 20 de septiembre de 2026

Estado: implementación local verificada, migración de rangos desplegada en local y beta remota; aceptación física y distribución de cliente pendientes. Referencia central: [roadmap](roadmap.md).

## Cambios de producto

- Entrenar ofrece una invitación opcional al primer entrenamiento. La checklist aparece tras aceptar; un historial confirmado previo evita invitaciones automáticas a usuarios habituales.
- Más incluye **Cómo usar GymBro**, con rutinas, series, registro, resultados y mesociclos. La ayuda se expande dentro del editor para conservar campos, navegación y temporizadores.
- La guía distingue rutina guardada, sesión registrada y resultado revisado. Usa la validación del editor vigente y los resultados de series válidas confirmadas; una sesión parcial cuenta, una sesión pendiente, ajena, futura o sin series válidas no.
- La guía revalida su destino al pulsar. Varias rutinas requieren elección explícita; las rutinas incompletas siguen en edición. Durante entrenamiento activo, conflicto o recuperación no ofrece comenzar otro entrenamiento.
- Preferencias locales por UID: invitación, temas ocultos, rutina elegida, resultado revisado y lectura del tema de mesociclos. No se copian cargas, medidas, credenciales ni otros datos del entrenamiento.
- Lecturas tardías y callbacks de otra cuenta no cambian estado ni navegan. Un fallo de lectura oculta la invitación automática; un fallo de escritura explícita conserva la elección en memoria y muestra un mensaje. Escrituras/lecturas/borrado están serializados por cuenta.
- La ayuda sigue el editor unificado actual: ya no enseña el antiguo flujo de crear una rutina vacía y después añadir ejercicios en otra pantalla. Se ofrece entrenamiento solo desde una rutina persistida y validada; editar campos retira ese acceso hasta guardar.
- El resumen personal solo muestra la sesión cuando el historial de la cuenta actual está listo. Se evita mostrar una sesión de una hidratación anterior y marcarla como revisada durante carga/error/cambio de cuenta.
- La cabecera de ayuda y navegación se desplaza con las bibliotecas; no ocupa una zona fija que quite espacio a listas en teléfonos pequeños. Los títulos de ayuda usan texto del tema para mejorar contraste sobre los fondos existentes. El cierre de mesociclos devuelve foco al botón del tema.

La guía no cambia el registro de intentos, timers, recompensas, publicación ni reglas del calendario. Los rangos eran cambios preexistentes al inicio de esta sesión: se verificaron junto con el conjunto, no se atribuye su implementación original a la guía.

## Organización

- `utils/functionalGuidance.ts`: selector y validación del avance.
- `services/functionalGuidance.ts`: persistencia y limpieza explícita por cuenta.
- `context/FunctionalGuidanceContext.ts`, `components/FunctionalGuidanceProvider.tsx`: aislamiento y coordinación. El provider se monta dentro de DataProvider y se reinicia por UID.
- `components/FunctionalGuidanceCard.tsx`, `TrainingHelp.tsx`, `WorkoutGuidance.tsx`, `app/help/training.tsx`: superficies de la guía.
- Entrenar, Más, editor, ejecución, resumen personal y mesociclos contienen las integraciones.

No hay flujo de eliminación de cuenta en el código inspeccionado; el servicio proporciona `removeGuidancePreferences(owner)` para su futura integración. Cerrar sesión no borra preferencias locales, pero desmonta el estado en memoria de esa cuenta. La preferencia no se sincroniza entre dispositivos y puede desaparecer al reinstalar.

## Verificación

| Comprobación | Resultado y alcance |
|---|---|
| Base previa a cambios nuevos | 999 pruebas generales; TypeScript sin errores |
| Suite general después de la guía | **1020 aprobadas**, 30 omitidas, 142 archivos aprobados y 2 omitidos; incluye cambios locales preexistentes |
| Última corrección de foco accesible | **187 pruebas en 10 archivos aprobadas**: guía, editor, reentrada, offline, planificación, navegación y récords |
| TypeScript final | `npx tsc --noEmit`, sin errores |
| SQL específico de rangos | **17 pruebas aprobadas** con `RANK_SQL_TEST=1` en una base aislada: paridad, privacidad, pausas, gemas, reintentos, transportes y reaplicación |
| SQL después de aplicar migración | **810 aserciones en 37 archivos aprobadas**, `npx supabase test db` |
| Expo | Exportaciones Android, iOS y web completas; no son APK/IPA instalados |
| Web independiente | **188 pruebas aprobadas**, build de producción completado en el repositorio hermano |
| Visual de ayuda | Exportación web real: apertura, expansión y cierre de temas a 360 y 320 px; títulos legibles tras ajuste; no prueba nativa ni de cuenta autenticada |
| Higiene | `git diff --check` sin errores |

La suite general se ejecutó antes de la última corrección acotada de foco; después se repitieron las 187 pruebas relevantes, TypeScript y exportaciones. Las 30 pruebas SQL optativas omitidas en la suite general no se cuentan como aprobadas allí: las 17 de rangos se ejecutaron aparte; las 13 optativas de volumen no se repitieron en esta sesión.

Logs: `/tmp/gymbro-consolidation-baseline-tests.log`, `gymbro-consolidation-final-tests.log`, `gymbro-guidance-final-focused.log`, `gymbro-consolidation-final-tsc.log`, `gymbro-consolidation-rank-sql.log`, `gymbro-consolidation-pgtap.log`, `gymbro-consolidation-export.log`, `gymbro-web-consolidation-tests.log`, `gymbro-web-consolidation-build.log`. La exportación se conserva en `/tmp/gymbro-consolidation-export`. `/tmp` es evidencia temporal; los resultados se resumen aquí para que no dependan de conservar esos archivos.

## Migración de rangos

La consulta inicial confirmó que `20260919120000_muscle_rank_profiles.sql` era la única pendiente en local y remoto. Después de las pruebas aisladas:

1. Se guardaron schema y datos de ambas bases en `/home/rodaja/gymbro-ledger-backups/consolidation-20260920/`, directorio privado. Se verificaron la salida satisfactoria del CLI, tamaños, presencia de tablas de entrenamiento/recompensas y SHA-256; se conservó una copia exacta de la migración y un manifiesto.
2. Ambos dry-runs limitaron el cambio a esa migración; no incluyeron seeds ni roles.
3. Se aplicó primero localmente y luego al proyecto vinculado de beta. No se reiniciaron las bases ni se borraron datos existentes.
4. Los dry-runs posteriores reportaron `upToDate: true` y ninguna migración pendiente en ambos entornos. Las 810 aserciones SQL locales pasaron con la migración aplicada.

Los dumps de datos advierten sobre claves foráneas circulares; **no se ensayó una restauración**. La existencia del respaldo y su integridad de archivos no certifican una restauración automática. No se realizó una prueba de premios con cuentas reales remotas. La migración no acredita premios masivos retroactivos.

Logs del despliegue: `/tmp/gymbro-consolidation-db-local.log`, `gymbro-consolidation-db-remote.log`, `gymbro-consolidation-postflight-local.log`, `gymbro-consolidation-postflight-remote.log`.

## Entrega y límites

Los cambios de cliente están sin commit; no se creó una release, PR, APK/IPA ni hosting web. Se preservó el trabajo previo del árbol y el runtime SDD histórico no se tocó. La web tiene cambios propios sin integrar; se ejecutaron sus verificaciones sin editar su código fuente.

La aceptación en Android/iOS y la ronda con usuarios nuevos siguen pendientes en [esta matriz](beta-acceptance-2026-09-20.md). No había dispositivos conectados. Siguiente acción: usar esa matriz con un build identificable y cerrar los problemas observados antes de distribuir la próxima versión.

Para retirar únicamente la guía: quitar provider/integraciones, componentes/contexto/selector/servicio nuevos y su ayuda; conservar rangos, mapas y demás cambios preexistentes. Para modificar el backend ya desplegado usar una migración compensatoria que preserve registros y premios, nunca eliminar la migración aplicada ni restaurar toda la base como rollback rutinario.
