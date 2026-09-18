# Implementación aprobada — 18 de septiembre de 2026

El flujo de `routine/create` y `routine/[id]` ahora utiliza `RoutineEditor`. La rutina nueva se guarda completa en una sola operación; no se crea primero una plantilla vacía.

## Protección del trabajo

- Borrador local por usuario y rutina, con nombre, ejercicios, series, valores de texto sin normalizar y versión base. No depende de la identidad cambiante de `getRoutine`.
- Escrituras serializadas, recuperación al remontar y estados distintos para escritura pendiente, confirmación local y error. Una lectura corrupta no sobrescribe la copia existente.
- Persistencia local y guardado remoto son acciones diferentes. Al fallar cualquiera, el formulario se conserva. La salida se protege mientras hay escritura pendiente, error local o guardado remoto.
- Al guardar una rutina utilizada se devuelve y abre la nueva versión. Un identificador estable permite reintentar la misma operación; las comparaciones ignoran el orden de claves de JSONB.
- Un borrador con una versión base antigua no sobrescribe una rutina que cambió. El usuario puede conservarlo o descartar explícitamente los cambios locales y recuperar la versión guardada.
- Las claves de los campos incluyen ejercicio y serie: se soportan rutinas antiguas que repiten identificadores de serie en ejercicios diferentes.

La recuperación conserva el contenido, no la posición de scroll ni el foco del teclado. Deshacer está disponible para la última eliminación/reemplazo hasta la siguiente edición; no es un historial durable.

## Interacción

Selector con búsqueda sin acentos, filtros opcionales de músculo/equipo y selección múltiple en orden de pulsación. Lista virtualizada. Acciones principales al pie, fuera del scroll. Tarjetas plegables; la primera se abre inicialmente. Se puede reemplazar y mover ejercicios, duplicar/mover/eliminar series, eliminar un ejercicio y deshacer.

Se reutiliza `EffortTargetControl` sin cambiar su interacción de RIR/RPE. El tipo mantiene botones C/efectiva/F; no hay selectores desplegables. Los grupos musculares se deducen de los ejercicios si no se eligieron manualmente.

## Secuencia y técnicas

`normalizeSessionSetNumbers` es compartido por editor y ejecución. Las series numéricas se renumeran desde 1, excluyendo C y F. La normalización no cambia IDs, carga, repeticiones ni esfuerzo.

Backoff conserva su lugar en la secuencia efectiva y usa descanso normal. Los grupos anteriores se conservan como Backoff. Drop set tiene un campo independiente, etiquetas D1.1/D1.2 y no activa descanso entre miembros contiguos. Mover una de sus partes mueve el bloque completo. Si una eliminación/conversión deja una parte aislada, se convierte en serie ordinaria. Duplicar una parte permite ampliar el bloque. También puede convertirse una serie existente con el botón Drop set; conserva su identidad y su valor escrito y añade la segunda parte. Desactivar la técnica conserva las series como ordinarias.

Agregar Backoff o Drop copia los valores visibles; el usuario ajusta la carga descendente. No se impone una reducción porcentual ni se alteran cargas existentes automáticamente. El cómputo histórico de cumplimiento/recompensas sigue siendo por serie física; las etiquetas no redefinen esa política.

## Tiempo y carga

Las prescripciones admiten repeticiones o duración en segundos; los segundos se almacenan en `durationSeconds`, nunca en `reps`. La carga puede ser externa, corporal sin pesaje obligatorio, lastre o asistencia. `loadBasis` describe la prescripción y no reescribe la definición del catálogo.

La compatibilidad necesaria alcanza snapshots de ejecución, captura del intento, sesión, edición del registro, resumen e intercambio/importación de plantillas individuales y conjuntas. El esfuerzo objetivo nunca se convierte automáticamente en esfuerzo realizado.

Los resultados temporizados y el lastre no se mezclan con los récords existentes de carga externa. El resumen muestra segundos; las gráficas especializadas de progresión por duración quedan fuera de este cambio de rutinas.

## Migración y verificación

La migración `supabase/migrations/20260918120000_routine_prescription_modalities.sql` amplía validadores de plantillas, publicaciones y resultados conjuntos, valida cumplimiento temporal y preserva la revisión previa a publicar. Debe desplegarse junto con esta versión de la app. Se comprobó en PostgreSQL local dentro de una transacción terminada con ROLLBACK; no se aplicó en producción.

Pruebas nuevas: combinaciones C/efectiva/F, identidad y valores tras renumerar, eliminación de última serie, decimales, bloques drop, captura de duración/carga corporal, recuperación tras remontar, aislamiento por cuenta, escrituras ordenadas, fallo local y reintento, selección múltiple, doble guardado, versiones e idempotencia con claves JSONB reordenadas, transporte/importación, ejecución temporal y descanso de drops.

Verificación automatizada: TypeScript sin errores, exportación web completada, 310 pruebas de las áreas afectadas aprobadas, 9 pruebas del paquete de contratos aprobadas y comprobaciones SQL locales aprobadas. La suite completa deja un fallo en `tests/socialScreen.test.ts`, en la expectativa de textos de una tarjeta de récord ajena al editor; esa tarjeta y esa prueba ya tenían modificaciones previas en el workspace y no se cambiaron para este trabajo.

Pendiente de verificación manual en dispositivo: teclado Android/iOS, fuentes grandes, gestos de navegación y lectura TalkBack/VoiceOver. No se atribuyen resultados de usabilidad ni mejoras porcentuales sin medirlos.
