# Ampliación: series, esfuerzo, backoff, tiempo y peso corporal

Fecha: 18/09/2026. Complementa la auditoría de creación de rutinas. Se mantiene el alcance de análisis y diseño; no hay cambios funcionales en la app.

Decisión incorporada por indicación del usuario: distinguir Backoff y Drop set, siguiendo la separación de técnicas documentada por otras apps. Esta decisión reemplaza la consideración de drop sets como ampliación opcional del diseño; implementarlos requiere su propio contrato compatible.

## Respuesta a las cuatro preguntas

1. **Esfuerzo por serie:** existe en GymBro, pero faltaba en la primera maqueta. El nuevo diseño lo muestra como un selector compacto y opcional en cada serie. Dentro de una rutina es esfuerzo **objetivo**, no esfuerzo realizado.
2. **Backoff:** existe el botón actual de dos subseries. Debe conservarse su información, corregirse la copia de pesos y explicarse mejor. Propongo además diseñar el concepto de serie backoff individual, sin confundirlo con un drop set ni migrar automáticamente los grupos actuales.
3. **Eliminar series:** sí, la app actual permite hacerlo mediante un signo menos. La primera maqueta solo permitía eliminar ejercicios. La nueva incorpora eliminación de cada serie y deshacer.
4. **Tiempo/peso corporal:** no están resueltos adecuadamente por el editor. Peso corporal existe parcialmente en el modelo; una prescripción por duración no. No alcanza con reemplazar la palabra “repeticiones” por “segundos”.

## Evidencia del código y pruebas

| Hallazgo | Evidencia | Evaluación |
|---|---|---|
| Objetivo RIR/RPE por serie ya existe | [EffortTarget y CatalogSet](/home/rodaja/Workspace/GymBro/types/index.ts:15); [control](/home/rodaja/Workspace/GymBro/components/EffortTargetControl.tsx:16); editor renderiza el control para cada serie | Preservar la capacidad; hacerla visible sin desplegar varios botones permanentemente. |
| Rangos actuales limitados | RIR entero 0–5, RPE entero 6–10 | No ofrecer decimales como 8,5 sin actualizar todos los validadores. |
| Objetivo y resultado están separados | [actualEffort](/home/rodaja/Workspace/GymBro/utils/actualEffort.ts:3), AttemptSetPlan/AttemptSetResult | Una rutina no debe completar el esfuerzo realizado automáticamente a partir del objetivo. |
| Backoff actual es agrupación | [addBackoff](/home/rodaja/Workspace/GymBro/app/routine/[id].tsx:181) agrega dos filas con backoffGroupId; tipo sigue siendo numérico | El grupo no prescribe reducción de carga ni descanso. No deducir que sea un drop set. |
| Borrar una serie funciona, pero no deshacer | [removeSet](/home/rodaja/Workspace/GymBro/app/routine/[id].tsx:225) | Puede dejar un grupo backoff de un miembro; no hay normalización ni explicación explícita. |
| Tipos de carga incompletos para esta UX | [ExerciseLoadMode](/home/rodaja/Workspace/GymBro/types/index.ts:411): external-load, bodyweight, assisted | No hay modo diferenciado de corporal con lastre; no confundir lastre con peso corporal total. |
| La UI no se adapta a esos modos | El editor siempre muestra peso/kg y repeticiones | Una rueda abdominal termina mostrando kilos aunque no se use carga adicional. |
| No hay objetivo por duración de serie | CatalogSet usa weight/reps obligatorios; AttemptSetPlan solo targetReps/targetLoad | durationSeconds existente en sesiones mide el entrenamiento completo, no cada serie. |
| La limitación llega más allá del formulario | [SetPerformance](/home/rodaja/Workspace/GymBro/types/index.ts:420), [isValidPerformance](/home/rodaja/Workspace/GymBro/utils/workoutAttempts.ts:119), contratos y payloads | Los resultados exigen reps positivas; corporal exige una medición de peso > 0. |

Se ejecutaron 40 pruebas: 36 existentes de intentos/esfuerzo y cuatro de caracterización nuevas. Las nuevas comprueban que: (a) objetivos distintos y grupo backoff se preservan al guardar; (b) borrar deja un grupo con una serie; (c) corporal aún muestra inputs kg; (d) el validador rechaza duración sin reps y corporal sin peso medido. No se probaron aquí dispositivos físicos ni el backend completo.

La evidencia ejecutable se archiva fuera de la suite en [series-reproduction.test.ts.txt](/home/rodaja/Workspace/GymBro/docs/routine-creation-audit/series-reproduction.test.ts.txt). Sus imports están preparados para copiarla a `tests/routineSeriesAuditProbe.test.ts`; usar solo si ese destino no existe, ejecutar `npx vitest run tests/routineSeriesAuditProbe.test.ts tests/actualEffort.test.ts tests/workoutAttempts.test.ts` y retirar la copia. Son caracterizaciones del estado actual, no expectativas de una implementación corregida.

## Investigación en otras aplicaciones

| Fuente oficial | Lo documentado | Decisión para GymBro |
|---|---|---|
| [Hevy: programación](https://www.hevyapp.com/features/exercise-programming-options/) | Campo TIME para planchas, eliminación por gesto o menú y etiquetas de tipo. Su artículo sitúa RPE en entrenamiento, no construcción de rutinas. | Adaptar campos al ejercicio y dar menú accesible además del gesto. Mantener nuestra capacidad de esfuerzo objetivo sin atribuírsela a Hevy. |
| [Hevy: peso corporal](https://help.hevyapp.com/hc/en-us/articles/38386262243223-Bodyweight-Exercises-in-Hevy-Bodyweight-vs-Assisted-vs-Weighted) | Distingue corporal, asistido y lastrado. Solo incorpora peso corporal al volumen de determinados ejercicios. | Separar carga adicional, asistencia y peso corporal; no calcular automáticamente “peso corporal × reps” para todos los movimientos. |
| [Strong: RPE](https://help.strongapp.io/article/230-about-rpe) | RPE editable desde el registro de reps; escala 6–10, incluyendo medios puntos | Una selección compacta es suficiente; compatibilidad de medios puntos debe tratarse como ampliación, no solo como UI. Artículo de 2021. |
| [Strong: tipos](https://help.strongapp.io/article/166-set-tags) | Tipo desde el número de serie; sus drop sets se describen sin descanso | Tipo de serie y esfuerzo son dimensiones separadas. No traducir “drop set” automáticamente como “backoff”. Artículo de 2021. |
| [Trainerize: tipos de ejercicio](https://help.trainerize.com/hc/en-us/articles/360035374612-What-Type-of-Exercises-Can-I-Create) | Reps, reps+carga, tiempo, tiempo+carga; diferencia objetivos de tiempo según propósito | Modelo explícito de medida; no reutilizar reps como segundos. |
| [Protocol: planificación backoff](https://www.useprotocol.app/resources/tools/guides/how-to-plan-back-off-sets-after-a-top-set) | Vincula trabajo posterior al top set, con carga y reducción elegidas según el plan | Si se ofrece cálculo por porcentaje, mostrar referencia y resultado, con confirmación. No imponer una reducción universal. Es una guía, no prueba de que exista un botón concreto. |

Investigación documental consultada el 18/09/2026; no validación autenticada de interfaces. Los ejemplos de valores de la maqueta ilustran campos y no constituyen recomendaciones de entrenamiento.

## Diseño: esfuerzo sin saturar la pantalla

Preferencia explícita del usuario: conservar la interacción actual de GymBro y evitar dropdowns. Esfuerzo se configura con badge/botón de activación, botones Sin objetivo/RIR/RPE y botones de valores con color. Elegir un valor vuelve al badge compacto. Tipo de serie conserva botones segmentados C/número/F, adaptados con Backoff y Drop set diferenciados. Esta decisión reemplaza los selects de la maqueta anterior; no se sustituirá EffortTargetControl por un dropdown en la implementación.

Cada serie debe mostrar su objetivo actual: “Sin objetivo”, “RIR 2” o “RPE 8”. Tocar abre el selector; no presentar todos los valores a la vez. El rótulo “Esfuerzo objetivo” evita confundirlo con resultado. Eliminar el objetivo debe ser una acción disponible.

“Aplicar a otras series” es opcional y debe indicar cuáles. No sobrescribir calentamientos ni backoffs con un botón ambiguo de aplicar a todo. Duplicar una serie copia su objetivo; crear una serie normal desde otra avanzada no debería copiar silenciosamente el tipo ni pertenencia al grupo. Los objetivos siempre sobreviven a colapsar, reordenar, salir y restaurar.

Para ejercicios por tiempo propongo “Sin objetivo” o una valoración de esfuerzo percibido general 1–10, claramente diferenciada de la escala basada en repeticiones. No convertir RIR a segundos restantes ni asumir que RPE 8 significa lo mismo en todas las modalidades. Esta nueva escala requiere un discriminante propio y validación; no cabe en el EffortTarget actual. La maqueta la rotula “RPE general” como propuesta, no como capacidad actual ni escala validada para un ejercicio particular.

Si la implementación inicial mantiene únicamente las escalas existentes, las series temporizadas deben poder quedar sin objetivo de esfuerzo hasta completar ese contrato. Nunca forzar RIR en una plancha estática.

## Diseño: backoff y eliminación

La primera maqueta ocultó capacidades importantes. La siguiente debe conservar calentamiento, normal, fallo y los grupos backoff existentes, además de permitir agregar y borrar.

Para backoff propongo:

- Acceso “+ Backoff” en ejercicios con carga compatible y posibilidad de marcar una serie existente. La demostración agrega una serie por toque con carga manual.
- Cada serie conserva su carga, reps y esfuerzo propios. No reducir el peso corporal del usuario ni aplicar porcentajes a kilos de asistencia como si fueran resistencia externa.
- Distinguir la agrupación heredada de dos subseries de una serie backoff nueva. Migrar agrupaciones conservando IDs, orden y significado; no inferir descanso o reducción que no están registrados.
- Si luego se añade “−X % del top set”, elegir explícitamente la serie de referencia, mostrar la carga resultante y el redondeo. En creación de rutina usar referencia planificada; no introducir dependencia de un resultado futuro sin soporte de ejecución.
- Un drop set tendrá nombre y estructura propios: bloque con subseries de carga descendente sin descanso entre ellas. Backoff será una serie posterior de menor carga con descanso normal entre series. Se ofrecerán acciones separadas “+ Backoff” y “+ Drop set”. No renombrar el backoff histórico para acomodarlo a otro producto.
- Para tiempo o corporal sin lastre, el mínimo no ofrecerá el atajo de reducción de carga. Una variante más fácil o menor duración no se deduce automáticamente: requiere una prescripción específica.

Para eliminación: acción visible por serie, alternativa por menú/gesto, etiqueta accesible con ejercicio y número, y deshacer no bloqueante. Restaurar ID, posición, carga, duración/reps, objetivo y grupo. La última serie también puede borrarse mientras sea borrador: dejar “Sin series” y “Agregar serie”, sin borrar el ejercicio automáticamente. Antes de finalizar, pedir agregar una serie o retirar el ejercicio vacío.

Un grupo heredado que queda con un miembro no debe convertirse en normal sin aviso. Para una implementación compatible, conservar su identidad y permitir agregarle miembros; explicar que queda una sola subserie. Eliminar el grupo completo debe identificarse como una acción distinta.

El bloque drop nuevo debe tener ID propio, IDs por subserie, orden y política explícita de descanso interno. Agregar bajadas no debe multiplicar automáticamente el conteo de series de trabajo para volumen, adherencia o recompensas: definir conteo de bloque y subseries por separado. La maqueta todavía cuenta filas físicas en su resumen y no pretende establecer esa política. Si al borrar queda una sola subserie, conservar el borrador pero pedir completar el bloque o convertirla explícitamente a normal antes de finalizar. Deshacer recupera los miembros y su agrupación. Revisar cargas descendentes al confirmar el bloque y no imponer porcentajes automáticos.

## Diseño: medida y carga independientes

| Ejemplo | Medida | Carga | Campos principales |
|---|---|---|---|
| Press de banca | Repeticiones | Externa | kg/lb + reps + esfuerzo objetivo |
| Rueda abdominal | Repeticiones | Corporal | reps + esfuerzo; sin kg obligatorios |
| Plancha | Tiempo | Corporal | duración por serie + esfuerzo opcional |
| Plancha con disco | Tiempo | Corporal + lastre | duración + lastre; nunca peso corporal total en la celda del disco |
| Dominada asistida | Repeticiones | Asistencia | reps + asistencia con unidad explícita |

El catálogo debe aportar estos metadatos; no inferir “plancha” mediante búsqueda del nombre. Equipo y carga son dimensiones diferentes: una rueda abdominal usa equipo pero puede no tener carga externa. Si se cambia la modalidad, ofrecer variante/reemplazo y advertir cuando hay datos incompatibles. Nunca reinterpretar 30 reps como 30 segundos.

En móvil, usar duración en minutos y segundos con normalización clara (p. ej., 90 s se presenta como 1:30), persistida como entero de segundos. La demostración usa un campo rotulado “Duración (segundos)” para hacer explícita la unidad. El reloj de descanso y la duración de sesión son datos distintos.

La rutina corporal no debería obligar a introducir la masa del usuario por serie. Si se necesita para análisis, capturar una medición contextual separada y permitir “desconocida”; desconocido no es cero. No estimar volumen o 1RM de rueda abdominal suponiendo que toda la masa corporal se desplaza como una barra. Registrar sus reps/series o tiempo sin fabricar equivalencias.

## Contrato y compatibilidad antes de implementar

Separar conceptualmente:

- **Medida del ejercicio:** reps o duración, en definición y snapshot.
- **Objetivo de serie:** unión explícita `{kind:'reps', value}` o `{kind:'duration', seconds}`; objetivos abiertos/al fallo deben representarse aparte, nunca con cero ambiguo.
- **Carga:** externa, corporal, corporal+lastre o asistencia; las cantidades adicionales se guardan con su significado y unidad.
- **Tipo/técnica:** normal, calentamiento, backoff y agrupaciones heredadas; no usar el número de posición como identidad de la serie.
- **Esfuerzo:** objetivo opcional independiente del resultado real; escala general temporizada discriminada de RIR/RPE por reps.

Esto es diseño conceptual, no un esquema listo para migrar. Revisar tipos locales, contratos compartidos, validadores SQL, catálogo, snapshots, importación/exportación, borradores, ejecución y cálculos que asumen `weight × reps`. Mantener lectura de rutinas antiguas con defaults explícitos y escribir un formato versionado. Datos de tiempo no deben ser aceptados por un lector antiguo que los descarte en silencio.

El usuario pidió seguir auditando solo rutinas. Por eso no se cambia ejecución ni analítica en esta entrega. Sin embargo, habilitar guardar una plancha temporizada exige que los consumidores preserven e interpreten su duración: es una dependencia de compatibilidad, no un rediseño adicional. No ofrecer rutinas temporizadas listas para entrenar hasta cubrirla.

## Prioridad y aceptación

1. En la primera entrega del editor: conservar esfuerzo, corregir pesos/backoff, eliminar y deshacer series, mantener borradores y versionado seguros.
2. Adaptar presentación de carga con semántica existente; resolver corporal sin medición obligatoria de manera integral, sin introducir ceros que invaliden resultados.
3. Completar la migración de medida por duración y corporal+lastre. Son capacidades de base, no un detalle cosmético.
4. Incluir Drop set como técnica diferenciada en el diseño acordado; su implementación requiere contrato, validación de bloques y definición del conteo. Dejar para después porcentajes automáticos de backoff, medios puntos RPE y edición masiva de objetivos.

Criterios nuevos: esfuerzo distinto en cada serie sobrevive guardar/restaurar; objetivo nunca se convierte en realizado; agregar/borrar/deshacer respeta IDs; grupo heredado no se redefine; borrar última serie conserva el ejercicio como borrador; duración no requiere reps falsas; corporal no requiere kilos falsos; lastre y asistencia no se confunden; cambiar modalidad no pierde valores sin decisión; pantallas estrechas y fuente grande permiten operar cada fila.

La nueva maqueta permite editar esfuerzo, agregar backoff manual y bloques drop en press, añadir bajadas, eliminar/deshacer series y explorar plancha/rueda abdominal y plancha con lastre desde el selector. No implementa grupos heredados, sincronización ni migración. Esas garantías quedan en la especificación y deben verificarse en la app real.

Se verificó en navegador: cambiar RIR a RPE, agregar backoff y un bloque drop, borrar/restaurar una serie, agregar una bajada al bloque, introducir 45 segundos en plancha y un objetivo de esfuerzo general, y comprobar que rueda abdominal muestra repeticiones sin campos de carga. Revisión visual en viewport de 352 px. Estas comprobaciones corresponden a la maqueta; no certifican comportamiento nativo ni persistencia.
