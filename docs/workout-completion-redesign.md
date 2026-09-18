# Cierre de entrenamiento y revisión de récords

El cierre guarda primero la ejecución y acredita XP y gemas. Muestra una confirmación compacta, barra animada de nivel y recompensas con detalle desplegable. Luego permite revisar los récords de la sesión antes de publicar.

## Publicación según el perfil

El destino sigue siendo el círculo y se respetan las preferencias existentes del perfil. El cierre no agrega selección de audiencia, un interruptor para publicar la ejecución ni una alternativa de “terminar sin publicar”. Con publicación automática habilitada, “Confirmar y publicar” publica la ejecución y los récords elegidos; cero récords seleccionados sigue publicando la ejecución. Con esa preferencia deshabilitada, “Finalizar” completa el cierre sin publicar.

Todos los récords comparables de carga, repeticiones y volumen se preparan individualmente, incluyendo distintas particiones de carga/repeticiones. También se conserva el soporte previo de récords de peso corporal. No hay selección predeterminada ni un límite de un récord por sesión. Cada fila permite expandir la misma card que aparecerá en el feed. Hay selección individual, selección de todos y contador visible.

Los premios son independientes de la selección: no publicar un récord no elimina las gemas ganadas.

## Persistencia y publicación atómica

La migración `20260917140000_workout_publication_review.sql` crea una revisión privada mediante un trigger sobre el intento confirmado. Esto cubre todos los finalizadores, incluso los de sincronización online/offline. No modifica publicaciones históricas.

El publicador automático prepara el resumen, pero no lo publica antes de la confirmación. El servidor bloquea también el publicador anterior para las revisiones nuevas. Un intento todavía no confirmado no puede usar el camino de publicación histórica. Los candidatos se calculan una vez a partir de la evidencia inmutable; no se recalculan al abrir la pantalla.

La selección se guarda por usuario e intento en AsyncStorage, con escrituras serializadas. Antes de enviar, se persiste el comando exacto y se bloquea la selección. Una respuesta perdida permite reintentar ese comando; el servidor devuelve el resultado original y no duplica ni cambia publicaciones. La confirmación valida todos los IDs contra el dueño y la sesión y publica ejecución + récords en una transacción. Relee la privacidad del perfil al confirmar y filtra las plantillas según esas preferencias.

Entrenar muestra los cierres pendientes y permite retomarlos en `/session/completion/[id]`. En grupos se conserva el cierre individual y la cola existente, pero la barrera de publicación espera además las revisiones de todos los participantes finalizados.

## Animación y loader

La celebración usa los comprobantes de la sesión, reconstruye los XP anteriores y recorre los umbrales de nivel. El número aumenta al cruzarlos y las gemas se cuentan después. El cambio de rango se distingue del cambio de nivel. La secuencia dura 2,4 segundos, respeta movimiento reducido y no se repite al volver del historial o segundo plano.

La confirmación muestra `GymBroLoadingOverlay`, extraído del mismo componente de carga del inicio de sesión: mismo logo giratorio, tema y preferencia de movimiento. Un fallo libera el loader y permite reintentar; el guardado del entrenamiento no se revierte.

## Verificación y despliegue

Aplicar las migraciones `20260917120000_workout_completion_preview.sql` y `20260917140000_workout_publication_review.sql` junto con la versión de la aplicación. Aplicadas al Supabase local durante la implementación; no se desplegaron al remoto.

- TypeScript y exportación web de Expo.
- Pruebas de selección, persistencia, confirmación explícita, errores, reintentos, loader, navegación y finalización.
- `node scripts/test-workout-publication-review.mjs`: base temporal con sólo el esquema, 30 aserciones SQL sobre múltiples récords, recompensas independientes, privacidad, aislamiento de cuentas, publicación grupal y publicación atómica/idempotente. El script elimina exclusivamente esa base temporal.
- Revisión visual a 390 px con datos de muestra y React Native Web; la animación nativa requiere comprobación en dispositivo.
