> Estado: la implementación aprobada y sus límites están documentados en [implementation.md](./implementation.md). La auditoría y las pruebas de caracterización siguientes describen la situación anterior.

# Auditoría de creación y edición de rutinas

Fecha: 18 de septiembre de 2026. Alcance: biblioteca como entrada, alta de rutina, selección de ejercicios, edición de series, conservación del borrador y confirmación del guardado.

Ampliación posterior: [esfuerzo por serie, backoff, eliminar/deshacer, tiempo y peso corporal](/home/rodaja/Workspace/GymBro/docs/routine-creation-audit/series-effort-and-modalities.md). Aclara capacidades omitidas en la primera maqueta y añade requisitos de modelo y compatibilidad.

Ampliación de secuencia: [numeración automática y conservación de identidad](/home/rodaja/Workspace/GymBro/docs/routine-creation-audit/series-numbering.md). Documenta la diferencia entre entrenamiento y editor, reglas para C/F/backoff/drop y pruebas de normalización.

## Dictamen

El problema principal es la pérdida de trabajo. El editor trata las actualizaciones de datos como una orden para reinicializar el formulario. Se suma un flujo fragmentado y demasiado costoso para tareas repetitivas. Recomiendo un editor único, con borrador persistente, selección múltiple y edición compacta de series.

La primera entrega debe corregir conservación y guardado. Después conviene reemplazar la composición visual. Un rediseño que mantenga el estado actual seguirá perdiendo ejercicios.

Esta entrega contiene investigación, evidencia reproducible y especificación de mejora; no modifica la aplicación. No se rediseñan ejecución, comunidad ni mesociclos. Sus contratos actuales se revisaron únicamente donde afectan guardar una rutina.

## Método y límites

- Revisión del árbol de trabajo actual, incluidos cambios locales preexistentes. No corresponde necesariamente a la versión instalada en el teléfono.
- Inspección de pantallas, selector, tipos de datos, contexto, persistencia, versionado y tests existentes.
- Cinco pruebas de caracterización con el editor React real y dependencias simuladas. Confirman comportamientos defectuosos; no significan que el flujo esté corregido.
- Investigación en documentación oficial de Hevy, Strong, Fitbod y Boostcamp. No hice pruebas autenticadas de esas aplicaciones. Sus artículos no permiten afirmar cómo persisten borradores internamente.
- Evaluación heurística de la estructura de UI y controles. No se midieron contraste renderizado, latencias reales, teclado, scroll ni accesibilidad en dispositivo. Esas comprobaciones quedan especificadas como aceptación.
- Se leyó la [documentación Expo v56](https://docs.expo.dev/versions/v56.0.0/) exigida por AGENTS.md. El package.json actual declara Expo ~57.0.22: verificar esa diferencia antes de implementar APIs nuevas. No es evidencia de que Expo cause este problema.

## 1. Qué ocurre hoy

Biblioteca → Nueva → nombre obligatorio y grupos musculares obligatorios → Crear rutina → guardado remoto de una rutina vacía → reemplazo de pantalla por Editar rutina → abrir selector → elegir un ejercicio → cierre del selector → configurar series → repetir → bajar hasta Guardar rutina.

Hay dos compromisos separados: crear el contenedor y guardar su contenido. El usuario siente que está creando una sola rutina, pero la aplicación ya publicó una entrada vacía en su biblioteca. Además, la misma pantalla mezcla edición, compartir y ejecutar.

## 2. Pérdida de trabajo: causa y evidencia

En [el efecto de inicialización del editor](/home/rodaja/Workspace/GymBro/app/routine/[id].tsx:83), el formulario reemplaza nombre, ejercicios, grupos y pesos con la rutina guardada. Depende de `[getRoutine, id]`.

[getRoutine se declara dentro del proveedor](/home/rodaja/Workspace/GymBro/context/DataContext.tsx:847), sin estabilizar su referencia. Cuando el proveedor vuelve a renderizar, la función cambia aunque la rutina sea la misma. El efecto vuelve a ejecutarse y pisa el borrador.

Cadena comprobada: agregar ejercicio y cambiar nombre → nueva referencia de getRoutine, devolviendo exactamente la misma rutina persistida → desaparece el ejercicio y vuelve el nombre original.

Esto puede percibirse como una recarga sin que la pantalla se desmonte. Un render local por teclear no basta por sí solo: el disparador comprobado es el cambio de referencia de esa dependencia. El proveedor también actualiza otros estados, incluida recuperación de entrenamiento, pero no se identificó cuál disparó el caso concreto del usuario. No atribuirlo automáticamente a un temporizador ni al refresco de autenticación.

Hay una segunda vía independiente: el estado del editor vive en `useState`. Desmontarlo y abrirlo vuelve a cargar la rutina persistida. No hay recuperación local del borrador de rutina. El borrador de entrenamiento activo existente tiene otro propósito.

Estabilizar getRoutine ayudaría, pero no resuelve por sí solo ni los remontajes ni las actualizaciones legítimas de la rutina remota. La inicialización debe pertenecer a una sesión de edición identificada por usuario y rutina/borrador; una actualización externa nunca debe sustituir trabajo local silenciosamente.

## 3. Hallazgos priorizados

P0: pérdida de trabajo. P1: impide completar o compromete la confianza. P2: fricción y calidad de uso. Las prioridades son una valoración de esta auditoría, no métricas de producción.

| Prioridad | Hallazgo | Evidencia | Mejora |
|---|---|---|---|
| P0 | Reinicialización destructiva del formulario | Editor líneas 83–94; reproducido | Inicializar una vez por sesión; conservar cambios frente a actualizaciones externas. |
| P0 | Borrador perdido al desmontar | Estado local en líneas 46–51; reproducido | Persistencia local por cuenta y draftId; recuperación al reabrir. |
| P1 | Agregar desde el selector deja pesos vacíos | `addExerciseFromCatalog`, línea 149, no inicializa draftWeights; reproducido | Crear ejercicio y campos editables juntos; respetar valores predeterminados, incluido cero. |
| P1 | Backoff copia la serie pero deja sus pesos editables vacíos | Líneas 181–197; reproducido | Copiar valores visibles actuales y generar IDs nuevos; no copiar un peso numérico desactualizado. |
| P1 | Rutina todavía no hidratada provoca volver atrás | Líneas 84–87 no distinguen carga de inexistencia; reproducido | Estados separados: cargando, error de carga, eliminada y disponible. |
| P1 | Guardar una rutina usada crea otra versión sin cambiar la ruta | DataContext 816–827 devuelve void; editor sigue usando id original | Guardado debe devolver ID y revisión canónicos; abrir la versión resultante. |
| P1 | Compartir/ejecutar operan con el ID persistido, aunque el editor tenga cambios | Editor 245–251 | Sacar estas acciones del editor principal; desde una salida explícita, guardar antes o elegir versión guardada. |
| P1 | No hay protección visible frente a doble envío | Alta y guardado sin `saving` ni bloqueo propio | Un envío por confirmación, estado de progreso y reintento idempotente. |
| P1 | Conflicto remoto termina en mensaje genérico | TrainingLibraryConflictError + catch del editor | Conservar el borrador; comparar con remoto o guardar copia; nunca pedir recargar destruyendo cambios. |
| P2 | Alta separada y grupos obligatorios antes de ver ejercicios | create.tsx | Entrar directo al editor; grupos sugeridos desde ejercicios y corregibles. |
| P2 | Selector sin búsqueda ni selección múltiple | ExercisePicker.tsx; onSelect cierra en el padre | Buscador, filtros opcionales y selección acumulada con “Agregar N”. |
| P2 | “Todos los grupos” significa los grupos de la rutina, no todo el catálogo | availableGroups y consulta por grupos | Ofrecer “Todo el catálogo” real; filtros visibles y reversibles. |
| P2 | Cada ejercicio y serie ocupa demasiado espacio permanente | Tarjetas expandidas, nota de bloqueo repetida, intensidad por serie | Resumen compacto; expansión de un ejercicio; opciones avanzadas a demanda. |
| P2 | Agregar y guardar están dentro del scroll, al final | Editor 398–406 | Acción de finalizar siempre accesible y agregar ejercicios en barra inferior. |
| P2 | No hay reordenar, reemplazar ni deshacer dentro del editor | Render/handlers del editor | Menú por ejercicio; mover y reemplazar; deshacer eliminación. |
| P2 | Peso siempre rotulado kg aunque existe loadUnit/loadMode | Editor 356–369; tipos de ejercicio | Mostrar kg/lb y semántica de carga externa, corporal o asistida; no convertir silenciosamente. |
| P2 | Entradas y errores poco contextuales | `parseInt(...) || 0`, alerta global; botones −/× sin nombre específico | Mantener texto durante edición, validar al confirmar, señalar ejercicio/serie/campo y etiquetar acciones. |

El riesgo de versionado es especialmente importante: `updateRoutine` conserva la original cuando existen intentos y agrega una nueva versión con otro ID. El editor muestra “Guardado”, pero sigue consultando la anterior. Por inspección, esto puede volver a mostrar contenido viejo y generar nuevas ramas al guardar otra vez. Debe cubrirse con una prueba de integración antes del arreglo.

El selector también depende de una función de filtrado recreada por el proveedor. Una actualización ajena puede volver a consultar y mostrar carga. No se midió su frecuencia. El reintento actual cambia el filtro: debería repetir la consulta fallida conservando criterio y selección.

## 4. Investigación comparativa

Se extrajeron patrones, no una puntuación de aplicaciones. Fechas de consulta: 18/09/2026. Strong conserva un artículo actualizado en 2021; verificar visualmente su interfaz vigente antes de copiar detalles. No se tomaron decisiones basadas en precios ni afirmaciones de marketing sobre velocidad.

| Aplicación | Patrón documentado | Aplicación propuesta a GymBro |
|---|---|---|
| Hevy | Rutina reutilizable con ejercicios, series y objetivos; duplicación; reorganización y reemplazo; opciones secundarias por ejercicio | Editor centrado en contenido, duplicar como atajo, menú contextual y tabla compacta. |
| Strong | Plantilla separada del entrenamiento realizado; crear con ejercicios y series, luego guardar en biblioteca; reutilización desde historial | No crear una entrada terminada antes de construirla. Mantener clara la diferencia entre planificar y ejecutar. |
| Fitbod | Guardar/reutilizar; elección explícita de mantener valores o regenerarlos; reemplazar y reordenar | Cambios importantes bajo control del usuario. Nada debe regenerar lo que está escribiendo sin aviso. |
| Boostcamp | Constructor en escritorio con búsqueda y edición detallada, sincronizado con móvil | A futuro, aprovechar ancho de web con biblioteca lateral; primero resolver el editor móvil. |

Fuentes: [Hevy: rutinas](https://www.hevyapp.com/features/gym-routines/), [Hevy: programación](https://www.hevyapp.com/features/exercise-programming-options/), [Strong: plantillas](https://help.strongapp.io/article/105-about-templates), [Fitbod: guardar](https://help.fitbod.me/hc/en-us/articles/6259258835863-Save-a-Workout), [Fitbod: editar](https://help.fitbod.me/hc/en-us/articles/360006335593-Editing-Workouts-in-Fitbod), [Boostcamp: constructor](https://www.boostcamp.app/custom-program).

La selección múltiple y la persistencia automática del borrador son recomendaciones propias para GymBro. Las fuentes revisadas no prueban que las cuatro aplicaciones ofrezcan exactamente esas funciones ni que soporten recuperación ante cierre forzado.

La revisión usa como criterio visibilidad del estado, control del usuario, prevención de errores y reducción de información innecesaria: [heurísticas de Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/). Para web, [WCAG 2.2, tamaño mínimo](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) establece 24×24 CSS px con condiciones y excepciones. Propongo objetivos táctiles de 44–48 unidades en móvil como decisión de diseño; no confundirlos con ese mínimo web ni afirmar cumplimiento sin medición.

## 5. Diseño recomendado

### Entrada única

“Nueva rutina” abre directamente un borrador. Nombre provisional “Nueva rutina”, editable; no bloquear el primer ejercicio por falta de nombre o grupos. Al terminar, pedir un nombre útil si sigue provisional. Mostrar “Continuar borrador” en la biblioteca, separado de las rutinas listas. Un borrador vacío abandonado no crea basura en la biblioteca.

El primer estado muestra “Agregá los ejercicios de tu rutina” y la acción correspondiente. “Duplicar rutina” puede vivir en el menú de las existentes. No añadir un asistente obligatorio de varios pasos para usuarios que ya saben qué quieren.

### Editor

- Cabecera: volver, nombre, estado de guardado y “Listo”. Mientras sea borrador local, decir “Borrador guardado en este dispositivo”; reservar “Rutina guardada” para confirmación remota.
- Resumen corto: número de ejercicios y series. Grupos musculares sugeridos desde los ejercicios, editables en detalles. Distinguir primarios/secundarios para no etiquetar todo el cuerpo por participación secundaria.
- Ejercicios en tarjetas compactas. Un toque expande las series; mantener el resto resumido y permitir expandir más si el usuario lo prefiere.
- Filas simples: serie, peso con unidad y repeticiones. Tipo de serie mediante control compacto con etiqueta comprensible. RIR/RPE y backoff disponibles como opciones avanzadas, conservando los existentes aunque se colapse la tarjeta.
- “Agregar serie” duplica la última prescripción visible del ejercicio. “Aplicar a todas” debe tener alcance explícito y no sobrescribir calentamientos/backoff accidentalmente.
- Menú por ejercicio: reemplazar, duplicar, mover, eliminar. Reordenar por arrastre y también con subir/bajar para accesibilidad.
- Barra inferior para “Agregar ejercicios”; “Listo” permanece accesible en cabecera. En nativo, ambos deben adaptarse al teclado y a safe areas.
- Quitar la nota de bloqueo repetida. Si hace falta explicar la identidad del ejercicio, ubicarlo en detalles, una sola vez.

No exigir que el usuario cierre un aviso de éxito cada vez que guarda. Usar confirmación no bloqueante. Eliminar con deshacer; descartar todo el borrador sí necesita una decisión explícita.

### Selector de ejercicios

Hoja amplia con buscador siempre visible, filtros por músculo/equipo y lista de selección múltiple. Mostrar nombre, variante/equipo y músculo principal; evitar metadatos técnicos como “grupos padre”. Conservar búsqueda, scroll y seleccionados al cambiar filtros. Etiquetar los ya incluidos; permitir repetir solo mediante una acción deliberada.

“Agregar 4 ejercicios” confirma en lote, mantiene el orden de selección y vuelve al editor sin perder su posición. Cerrar sin confirmar conserva lo previamente agregado a la rutina. La búsqueda sin resultados ofrece quitar filtros antes de empujar al usuario a crear otro ejercicio.

El catálogo disponible localmente debe permitir seguir armando un borrador sin red. Si faltan resultados remotos, explicarlo sin vaciar la selección. Recientes/favoritos son una segunda mejora, no dependencia del primer arreglo.

Ejemplo de interacción para seis ejercicios, excluyendo búsqueda, configuración y scroll: hoy hay seis aperturas + seis selecciones = 12 acciones. Selección en lote: una apertura + seis selecciones + una confirmación = 8. Es un recuento del diseño, no un resultado de usabilidad medido.

### Guardado y salidas

El autoguardado local protege trabajo incompleto. “Listo” valida y confirma la rutina en la biblioteca. Son estados distintos, con mensajes distintos.

| Estado | Mensaje propuesto | Comportamiento |
|---|---|---|
| Escritura local pendiente | Guardando borrador… | No afirmar todavía que es durable. |
| Escritura local confirmada | Borrador guardado en este dispositivo | Salir y reanudar con seguridad. |
| Sin red | Borrador guardado · Sin conexión | Permitir editar; finalizar remoto pendiente de reintento explícito. |
| Error de almacenamiento local | No pudimos guardar el borrador | Mantener en memoria, reintentar y advertir antes de salir. |
| Confirmando rutina | Guardando rutina… | Un único envío; preservar versión enviada. |
| Confirmación remota | Rutina guardada | Adoptar ID/revisión devueltos; limpiar solo el borrador confirmado. |
| Conflicto | La rutina cambió en otro dispositivo | Conservar ambas versiones y ofrecer revisar/guardar copia. |

No prometer sincronización automática en segundo plano si todavía no existe una cola durable. Un cierre del proceso antes de completarse la escritura local puede perder el último cambio: el indicador debe corresponder al acuse real de almacenamiento, no a un temporizador visual.

## 6. Contrato técnico sugerido

Crear una sesión de edición de rutina desacoplada del contexto de entrenamiento. Esquema conceptual del borrador: schemaVersion, ownerId, draftId, sourceRoutineId opcional, sourceVersion, baseRevision, nombre, grupos, ejercicios ordenados, entradas numéricas en texto, localRevision y persistedRevision.

1. Restaurar el borrador del usuario antes de hidratar desde la rutina remota. No guardar un estado inicial vacío sobre uno que todavía se está leyendo.
2. Inicializar una sola vez por clave de sesión. Los datos del servidor son una base, no el formulario vivo.
3. Cada acción actualiza un estado coherente: agregar ejercicio crea sus series e inputs juntos. Preservar valores parciales como `20,` mientras se escribe.
4. Serializar escrituras locales, hacerlas inmediatas para acciones estructurales y usar una pausa breve para texto; vaciar la cola antes de una salida controlada. Cambiar de app es una oportunidad extra de persistencia, no la única garantía.
5. Deshacer restaura ejercicio, posición, series y campos textuales, conservando IDs.
6. Finalizar toma una instantánea validada y única. La respuesta devuelve rutina, ID y revisión canónicos. Si siguió editándose durante el envío, conservar los cambios posteriores; alternativamente bloquear edición brevemente con indicación clara.
7. Si el resultado es incierto por corte de red, reconciliar por identidad de operación antes de repetir. No generar otro UUID en cada retry y duplicar rutinas/versiones.
8. El versionado preserva historial y referencias existentes. Nunca actualizar mesociclos ni entrenamiento activo como efecto lateral del editor.
9. Un cambio remoto sin modificaciones locales puede actualizar la base. Con modificaciones locales se trata como conflicto. No usar “último escritor gana” silenciosamente.
10. Limitar lectura/escritura del borrador a su cuenta. Cancelar escrituras tardías al cambiar de cuenta. No restaurar una rutina de otra cuenta; usar política explícita de eliminación/conservación de borradores al cerrar sesión.

Puede reutilizarse infraestructura de almacenamiento existente, pero el borrador de rutina necesita su propia clave y ciclo de vida. No reutilizar `activeWorkoutDraft`.

Las funciones de consulta pueden estabilizarse para reducir renders; esa optimización no reemplaza el contrato de edición. Las listas deben virtualizarse si los datos y perfiles reales muestran costo. No hace falta añadir una librería global de estado para resolver el primer alcance.

Peso opcional, rangos de repeticiones, descansos por ejercicio, notas y superseries requieren decisiones adicionales de modelo y compatibilidad. No representarlos con ceros mágicos ni agregar controles que el resto del sistema no pueda preservar. Para la primera entrega, conservar los tipos actuales y sus capacidades.

## 7. Orden de implementación

| Etapa | Entrega concreta | Dependencia / tamaño relativo |
|---|---|---|
| A — Integridad | Inicialización segura, borrador durable, recuperación, pesos correctos, bloqueo de doble envío, retorno de ID canónico, carga diferenciada | Primero; mediano por persistencia/versionado. |
| B — Flujo principal | Editor único, búsqueda y selección múltiple, acciones accesibles, tarjetas compactas, duplicar series, errores inline | Depende de A; grande. |
| C — Edición ágil | Reemplazar, mover, deshacer, duplicar rutina, preferencias de edición | Sobre A/B; mediano. |
| D — Ampliación opcional | Notas, descansos, rangos, superseries, constructor web de dos columnas | Requiere ampliar contratos; fuera del mínimo. |

Cada etapa debe ser utilizable por sí misma. No posponer la pérdida de datos hasta terminar todas las pantallas. El selector compartido requiere modo compatible o componente específico para rutinas, para no cambiar ejecución ni otros flujos.

## 8. Validación y criterios de aceptación

Pruebas ejecutadas en esta auditoría: cuatro archivos, 29 casos, todos completados. Incluyen 24 pruebas existentes de catálogo/selector/biblioteca y cinco pruebas de caracterización del defecto. Estas últimas afirman el comportamiento roto actual; una corrección debe sustituirlas por expectativas de conservación.

Reproducción archivada en [reproduction.test.ts.txt](/home/rodaja/Workspace/GymBro/docs/routine-creation-audit/reproduction.test.ts.txt). Está fuera de la suite habitual para no perpetuar como contrato un comportamiento defectuoso. Sus imports están preparados para copiarla a tests. Para repetir desde la raíz, usar un destino que no exista y retirarlo después:

```bash
cp -n docs/routine-creation-audit/reproduction.test.ts.txt tests/routineCreationAuditProbe.test.ts
npx vitest run tests/routineCreationAuditProbe.test.ts tests/exercisePicker.test.ts tests/exerciseCatalog.test.ts tests/routinesScreen.test.ts
rm tests/routineCreationAuditProbe.test.ts
```

Matriz mínima de la implementación:

| Escenario | Resultado exigido |
|---|---|
| Cambio ajeno del contexto mientras se edita | Mismos ejercicios, orden, nombre, pesos parciales y foco. |
| Salir y volver / cerrar app después de confirmar escritura local | Recuperar el mismo borrador y punto de trabajo. |
| Proceso terminado antes del acuse local | Nunca haber mostrado un guardado inexistente; recuperar última revisión durable. |
| App al fondo, autenticación renovada, reconexión | No reinicializar ni navegar atrás por datos transitorios. |
| Agregar desde selector y desde addExerciseId | Valores y snapshots equivalentes; sin duplicación al volver a renderizar. |
| Cero, decimal con coma, peso corporal y carga asistida | Valores preservados y etiquetas correctas; sin conversión silenciosa. |
| Backoff después de editar el peso de origen | Copiar el valor visible actual y conservar la agrupación. |
| Búsqueda, filtrado y selección múltiple | Conservar seleccionados, su orden y los ya agregados. |
| Eliminar / deshacer / mover / reemplazar | IDs coherentes y sin corrupción de series ni valores. |
| Doble tap en finalizar / respuesta remota incierta | Una rutina o versión; no duplicar por retry. |
| Guardar rutina previamente usada | Navegar a la nueva versión; original e historial intactos. |
| Conflicto entre dispositivos | Borrador intacto, elección explícita; sin sobreescritura silenciosa. |
| Error remoto o almacenamiento local lleno | Mensaje veraz, sin borrar el formulario; salida protegida cuando corresponda. |
| Teléfonos pequeños, fuente grande, teclado abierto | Campo enfocado y acciones alcanzables; sin recortes; lectura por TalkBack/VoiceOver. |

Prueba de usabilidad propuesta: participantes principiantes y habituales, crear seis ejercicios, ajustar series, reemplazar uno, reordenar, interrumpir y reanudar. Medir tiempo, errores, retrocesos, abandono y necesidad de ayuda. Realizar la misma tarea antes/después; no inventar una mejora porcentual sin línea de base.

Objetivos de aceptación propuestos: cero pérdidas en la matriz controlada; recuperación de toda revisión marcada como guardada; terminar la tarea sin ayuda; menos aperturas del selector y menor tiempo mediano respecto a la base. Instrumentar inicio de borrador, recuperación, agregado en lote, finalización, fallo y conflicto sin registrar nombres ni contenido de rutinas.

El prototipo visual de esta entrega permite explorar tarjetas compactas, selección en lote, duplicación de series y deshacer. Es una demostración en memoria con datos de ejemplo: sus mensajes de guardado representan el diseño, no una implementación real de persistencia o sincronización.

Se verificó en navegador la duplicación de serie, selección y agregado de dos ejercicios, eliminación/deshacer y confirmación simulada. Se revisó visualmente con viewport de 352 px (aproximadamente 320 px disponibles por el marco de preview). Esa verificación corresponde al prototipo, no a la UI nativa actual. La posición persistente de las acciones y la adaptación al teclado requieren implementación y prueba nativas.
