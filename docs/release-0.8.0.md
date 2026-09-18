# GymBro 0.8.0 — 18 de septiembre de 2026

Versión de aplicación `0.8.0`, secuencia del tablón `10`. Incluye los cambios implementados desde `0.7.0`; la propuesta de guía funcional sigue siendo documentación, no una función publicada.

## Novedades

- Editor de rutinas unificado con borradores recuperables, buscador de ejercicios y configuración de series, descansos, RIR y RPE.
- Prescripciones por repeticiones o tiempo, peso corporal, carga añadida y asistencia; soporte de dropsets y series de descarga.
- Mesociclos con sesiones planificadas, reprogramación, recuperación de sesiones y seguimiento de evolución entre semanas.
- Versiones de rutinas y planes que conservan el historial de lo que realmente entrenaste.
- Publicación e importación de planes compartidos con su procedencia y estructura completas.
- Entrenamientos individuales sin conexión, sincronización posterior y recuperación del entrenamiento al volver a la app.
- Continuidad del entrenamiento entre dispositivos y mejor recuperación de sesiones online y conjuntas.
- Registro rápido de series y esfuerzo real RIR/RPE, separado del objetivo de la rutina.
- Récords personales comparables de carga, repeticiones y volumen, con recompensas en gemas según el contexto.
- Nuevo cierre de entrenamiento con celebración de XP, niveles y gemas, vista previa y selección de récords para publicar.
- Cierres pendientes recuperables desde Entrenar y publicación conjunta cuando los participantes completan su revisión.
- Resumen semanal de actividad, volumen, densidad y esfuerzo registrado.
- Perfil de atleta renovado con accesos al historial, progreso y preferencias.
- Mapas musculares de frente y espalda en perfiles y publicaciones, con detalle de los grupos trabajados.
- Volumen muscular en períodos de 7, 28 y 90 días, comparación con el período anterior y objetivos con privacidad independiente.
- Evolución corporal por día con peso, medidas privadas e historial.
- Fotos de evolución en Android/iOS con guías de pose, cuenta regresiva y comparación entre fechas. Las fotos se guardan en el dispositivo; las medidas se sincronizan con tu cuenta.
- Reglas de relación GymCrush y mejoras en la experiencia de comunidad.
- 1000 gemas de regalo por cuenta: gracias por acompañarnos y ayudarnos a mejorar GymBro durante la beta.

## Correcciones

- Mayor protección del progreso guardado ante cierres, reconexiones y respuestas tardías.
- Sincronización y cancelación más confiables de entrenamientos conjuntos, sin duplicar publicaciones ni recompensas al reintentar.
- Las recompensas del entrenamiento se conservan aunque no selecciones sus récords para publicar.
- Cálculo muscular más preciso: distingue series directas e indirectas y excluye calentamientos, series omitidas y datos inválidos.
- Mejoras en temporizadores, continuidad del mesociclo y navegación entre sesión, resumen y publicación.
- Mejoras de visualización en web, notificaciones, estados de carga y accesibilidad; menos animaciones en pantallas inactivas.

## Regalo beta

La campaña `release:0.8.0:1000-gems` acredita 1000 gemas por cuenta a través del tablón existente cuando la aplicación consulta la secuencia 10. Los reintentos no duplican el crédito. No se acredita masivamente a cuentas inactivas ni se introduce una fecha de corte de elegibilidad. Las versiones anteriores continúan consultando sus propias secuencias.

## Validación

- Vitest: 976 pruebas generales aprobadas, más las 13 pruebas optativas de paridad SQL y permisos de volumen muscular ejecutadas con `VOLUME_SQL_TEST=1` (989 en total).
- TypeScript: `npx tsc --noEmit` sin errores.
- PostgreSQL: 810 aserciones en 37 archivos, incluyendo compatibilidad del tablón y acreditación única de 1000 gemas.
- Expo: exportación de Android, iOS y web completada.
- La cámara, los permisos, el sonido y la comparación de fotos requieren comprobación en dispositivos físicos. Los nuevos módulos nativos requieren reconstruir el binario para distribuir esta versión.

## Migraciones aplicadas

Ambas bases quedaron sin migraciones pendientes, verificado mediante `supabase db push --dry-run` local y remoto. No se reiniciaron ni borraron datos.

- Local: se aplicaron `20260918120000_routine_prescription_modalities.sql` y `20260918190000_release_0_8_0_beta_reward.sql`; las demás ya estaban registradas.
- Remoto `gymbro-beta.`: se aplicaron `20260917180000_body_evolution.sql`, `20260918120000_routine_prescription_modalities.sql`, `20260918160000_muscle_volume_profiles.sql` y `20260918190000_release_0_8_0_beta_reward.sql`.
- Consulta remota posterior: versión 0.8.0, secuencia 10, 19 novedades, 6 correcciones y campaña de 1000 gemas.

Este registro actualiza el estado de despliegue histórico descrito en los documentos de implementación.
