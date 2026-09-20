# Roadmap de GymBro

Actualizado: **20 de septiembre de 2026**. Referencia central de producto y entrega.

GymBro está en una **beta funcional avanzada, en consolidación**. El núcleo de entrenamiento, planificación, progreso y comunidad está implementado. La prioridad inmediata es validar la experiencia completa, facilitar la entrada de usuarios nuevos y preparar una entrega verificable.

## Cómo interpretar el estado

- **Integrado**: incluido en el historial del repositorio. Última base: `22e583b`, release 0.8.0.
- **Implementado en el árbol**: código presente y verificable, aún sin commit en esta consolidación.
- **Desplegado**: cambio de base aplicado; no equivale a un nuevo binario distribuido.
- **Aceptación pendiente**: falta comprobar comportamiento en dispositivos o con usuarios.
- **Propuesto**: sin compromiso de implementación ni fecha.

Los planes anteriores no forman un backlog actualizado: algunas casillas abiertas describen código entregado después. No se reactivan sus gates ni el runtime SDD histórico. El roadmap UX del 8 de septiembre es la propuesta histórica; sus 14 cortes tienen implementación documentada. Las menciones a “etapa 3.5 parcial” no permiten calcular un porcentaje global: no se encontró una definición general vigente de esas etapas en el repositorio.

## Estado por área

| Área | Implementación | Validación o entrega restante |
|---|---|---|
| Rutinas y ejecución | Integrado en 0.8.0: editor unificado, borradores, modalidades, esfuerzo real y cierre revisable | Teclado, correcciones y entrenamiento parcial en dispositivos |
| Mesociclos | Integrado: calendario, ciclo de vida, recuperación, snapshots y evolución | Recorrido con fechas, reprogramación y cierre de bloque |
| Continuidad | Integrado: individual offline, recuperación, sincronización y cambio de dispositivo | Modo avión, cierre forzado y dos dispositivos físicos |
| Progreso | Integrado: resumen semanal, duración, densidad, esfuerzo, récords y evolución | Comprensión de períodos, unidades y datos incompletos; aceptación física |
| Comunidad | Integrado: relaciones, grupos, publicaciones, revisión y planes compartidos | Dos cuentas, bloqueos, publicación conjunta y Realtime real |
| Modernización UX | 14 cortes integrados; [evidencia](ux-modernization-implementation-2026-09-08.md) | Temas, texto grande, lector de pantalla, rendimiento y batería |
| Evolución corporal | Integrado: medidas, historial y comparación de fotos | Cámara, permisos, interrupciones y binarios nativos nuevos |
| Mapa y volumen muscular | Integrado en 0.8.0; ajustes de silueta/presentación en el árbol | Revisión física en todas las superficies |
| Rangos musculares | Implementados en el árbol; migración `20260919120000` desplegada local/remoto el 20/09 | Commit/entrega del cliente y aceptación física |
| Guía contextual | Implementada en el árbol el 20/09; [detalle](functional-guidance-implementation-2026-09-20.md) | Recorrido con personas nuevas y aceptación física |
| Web de escritorio | Base implementada; ampliaciones de historial, planificación y ejecución sin integrar en el repositorio hermano | Cerrar sus cambios, confirmar dominio/hosting y validar móvil↔web |

## Ampliaciones incorporadas al producto

Registrar estas líneas evita tratarlas como trabajo invisible: continuidad offline y entre dispositivos; récords contextuales y recompensas; revisión antes de publicar; mapas, volumen y rangos musculares; medidas y fotos corporales; plataforma web; guía funcional. Son ampliaciones respecto del plan acotado de modernización UX, no una afirmación de que todas estuvieran ausentes de cualquier planificación anterior.

## Orden de entrega

### 1. Consolidar el código actual — implementación y verificación realizadas

- [x] Verificar rangos y ajustes preexistentes con pruebas generales y SQL aislado.
- [x] Respaldar y aplicar la migración de rangos en local y beta remota; confirmar que no quedan migraciones pendientes.
- [x] Implementar guía opcional, aislada por cuenta y derivada de registros confirmados.
- [x] Crear este roadmap y actualizar el README.
- [ ] Revisar el diff acumulado e incorporarlo al historial con una entrega identificable. Esta sesión no creó commits, tags ni PRs.

### 2. Aceptación de beta — siguiente paso operativo

Ejecutar [la matriz de aceptación](beta-acceptance-2026-09-20.md) en Android/iOS. Primero integridad del entrenamiento y sincronización; después publicación, cámara, accesibilidad y presentación. Corregir fallos reproducidos antes de distribuir el siguiente binario. **No hay dispositivos conectados en esta sesión**; estas filas no se consideran aprobadas.

### 3. Validar la guía con usuarios

La implementación ya está preparada para la ronda de beta. Observar a personas nuevas preparando una rutina, registrando una sesión y encontrando el resultado sin intervención del moderador. Verificar que usuarios habituales pueden omitirla y volver a la ayuda. Mesociclos sigue siendo aprendizaje opcional. La propuesta original sugiere 5 usuarios nuevos y 2 habituales como muestra cualitativa inicial, no como prueba estadística.

### 4. Cerrar la entrega móvil

Tras aceptación: definir la siguiente versión/notas, construir los binarios que incluyen los módulos nativos de cámara y distribuir al grupo de beta. No se publicó una nueva versión de cliente durante esta consolidación; `package.json` sigue en 0.8.0. Exportar Android/iOS/web no genera ni distribuye APK/IPA.

### 5. Resolver la entrega web como frente separado

Se inspeccionó el repositorio hermano y se ejecutaron 188 pruebas y build satisfactoriamente. Tiene cambios locales de historial, creación y ejecución; no se mezclaron con el código móvil ni se publicaron. El README web aún describe el hostname de producción como pendiente. No se verificó un despliegue público. Antes de publicar: cerrar su diff, asignar destino, comprobar callbacks de autenticación y ejecutar un recorrido móvil↔web con cuentas de prueba.

## Propuestas para después de la consolidación

Priorizar a partir de problemas observados en beta. Progresión automática de cargas, recomendaciones, contenido instructivo multimedia y nuevas expansiones sociales no se consideran entregas prometidas por este documento. Las comparaciones actuales no aumentan cargas automáticamente ni infieren mejoras fisiológicas.

## Evidencia

Consultar [implementación y pruebas](functional-guidance-implementation-2026-09-20.md) y [aceptación](beta-acceptance-2026-09-20.md). Las cifras históricas de 0.8.0 permanecen en [su registro de release](release-0.8.0.md); no se reutilizan como comprobaciones de cambios posteriores.
