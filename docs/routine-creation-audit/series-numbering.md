# Secuencia y numeración de series

Fecha: 18/09/2026. Auditoría local y actualización de maqueta; no implementación funcional en la app.

## Hallazgo

La regla pedida ya existe en [normalizeSessionSetNumbers](/home/rodaja/Workspace/GymBro/utils/workoutDraft.ts:16): recorre las series en orden, numera las de tipo numérico desde 1 y excluye C y F. [withSessionSetType](/home/rodaja/Workspace/GymBro/utils/workoutDraft.ts:22) la aplica después de cambiar el tipo. Los tests existentes del borrador de entrenamiento cubren parte del comportamiento.

Sin embargo, [el editor de rutinas](/home/rodaja/Workspace/GymBro/app/routine/[id].tsx:215) modifica solo la serie seleccionada. Al eliminar también filtra sin renumerar. Su siguiente número se calcula como máximo + 1: no corrige huecos. Además, el título de la fila usa su posición física, que puede contradecir el número efectivo del botón.

Una prueba del editor real con contexto simulado confirmó que al cambiar la primera de [1, 2, 3] a calentamiento se guarda [C, 2, 3]. La misma operación en el helper de entrenamiento produce [C, 1, 2]. El diseño debe unificar este comportamiento.

## Reglas acordadas y propuestas

- **Regla solicitada:** las series efectivas se numeran consecutivamente por ejercicio. Convertir la primera a calentamiento hace que la siguiente pase a ser 1.
- **Compatibilidad existente:** C y F no consumen un número efectivo. Mantenerlo; no introducir un cambio silencioso en cómo se cuenta F.
- **Backoff existente:** cada subserie de tipo numérico participa en la secuencia efectiva actual. Conservar esta regla al leer rutinas antiguas. Para backoff individual nuevo, mostrar el número efectivo y una etiqueta Backoff.
- **Drop set nuevo, propuesta:** numeración propia por bloque y bajada, p. ej. D1.1 y D1.2. No asignar números efectivos normales a cada bajada. Esta es una decisión propuesta para un tipo nuevo, no una regla ya implementada en GymBro. El conteo para volumen, adherencia y recompensas se define por separado.
- **Identidad estable:** cambiar de 3 a 2 modifica la etiqueta; nunca el ID ni la asociación de peso, esfuerzo, reps, duración o grupo.
- **Encabezados coherentes:** evitar “Serie 2” sobre un botón “1”. Mostrar Serie 1, Calentamiento 1, Fallo 1 o Drop 1 · bajada 1 según corresponda. C1/F1 distinguen múltiples filas del mismo tipo sin consumir números efectivos.
- **Botón de efectiva:** muestra su número cuando está seleccionada. Para una fila de otro tipo, muestra E; no adelanta un número incorrecto.

| Operación | Secuencia resultante |
|---|---|
| [1, 2, 3] → primera a calentamiento | [C1, 1, 2] |
| [C1, 1, 2] → calentamiento a efectiva | [1, 2, 3] |
| [1, 2, 3] → segunda al fallo | [1, F1, 2] |
| [1, 2, 3] → eliminar segunda | [1, 2] con IDs originales de primera y tercera |
| [C1, 1, 2] → eliminar calentamiento | [1, 2], mismos datos |
| Mover la tercera efectiva al inicio | [1, 2, 3], sus datos viajan con su ID |
| Agregar backoff tras [C1, 1, 2] | [C1, 1, 2, 3 · Backoff] |
| Agregar un drop nuevo | Bloque D1 con bajadas D1.1, D1.2; independiente de C/F/efectivas |
| Deshacer una eliminación | Restaurar ID, contenido y posición; recalcular todas las etiquetas |

## Mejoras de implementación recomendadas

1. Extraer la normalización existente a una función de dominio compartida por rutinas y entrenamiento. Compartir la función pura, no acoplar el editor al estado de ejecución.
2. Aplicarla tras toda operación estructural: agregar, duplicar, eliminar, cambiar tipo, mover, insertar bloques, deshacer y restaurar borrador. No esperar a guardar para arreglar lo que el usuario ve.
3. Separar posición, tipo y etiqueta derivada. El formato histórico mezcla número/tipo en `tipo`; mientras se mantenga, normalizar los números antes de persistir y derivar las etiquetas desde esa misma regla.
4. Procesar cambio y renumeración en una única actualización coherente. No dejar un render intermedio con duplicados ni usar un efecto que sobrescriba el borrador al actualizarse el contexto.
5. Usar IDs de serie para keys y campos editables; jamás índices ni números visibles. Renumerar no debe perder el foco ni llevar el valor escrito a otra fila.
6. Deshacer mediante ID y anclas de posición; si hubo otros cambios, restaurar sin pisarlos. Una pila de operaciones es más segura que restaurar toda una captura antigua del ejercicio.
7. Mover grupos completos como unidad. Extraer/cambiar el tipo de un miembro de drop requiere una operación explícita: dividir el bloque con nuevos IDs de grupo o convertir la fila, evitando grupos no contiguos con el mismo ID. No aplicar automáticamente este comportamiento a agrupaciones heredadas sin revisar compatibilidad.
8. Reconciliar referencias por ID, incluido un eventual top set de referencia para backoff. Si se elimina esa referencia, marcarla como pendiente de elección; no usar por accidente la nueva “Serie 1”.
9. Distinguir estado editable e histórico. Normalizar el borrador no autoriza a reescribir sesiones realizadas ni versiones antiguas. Una edición de rutina usada crea la versión correspondiente.
10. La normalización solo cambia números: no modifica esfuerzo, reps ni carga. Hoy withSessionSetType asigna RIR 0 al pasar a F, mientras el editor cambia reps a 0. Esas diferencias necesitan una regla de cambio de tipo explícita y reversible; no deben quedar ocultas dentro de la renumeración. Conservar los valores previos en el borrador para poder volver/deshacer.

## Verificación

Se ejecutaron 14 pruebas: diez existentes de workoutDraft y cuatro de auditoría. Una de las nuevas recorre 81 combinaciones de series numéricas/C/F para comprobar consecutividad, idempotencia y conservación de ID/carga/reps. Otras cubren el cambio reversible C↔efectiva, F, eliminación, reordenamiento y el salto actualmente guardado por el editor.

Evidencia: [sequence-reproduction.test.ts.txt](/home/rodaja/Workspace/GymBro/docs/routine-creation-audit/sequence-reproduction.test.ts.txt). Copiar, solo si el destino no existe, a `tests/routineSequenceAuditProbe.test.ts`, ejecutar `npx vitest run tests/routineSequenceAuditProbe.test.ts tests/workoutDraft.test.ts` y retirar la copia. La prueba del editor caracteriza el defecto; tras corregirlo debe esperar [C, 1, 2].

Para la implementación faltan pruebas de operaciones combinadas, grupos no contiguos, restauración tras cierre, selección activa/foco, referencias a top set y conflictos remotos. No confundir las 81 combinaciones comprobadas con cobertura de grupos nuevos o dispositivos físicos.

La maqueta ya deriva etiquetas de la secuencia actual al cambiar tipo, agregar, borrar y deshacer. La secuencia de drop es una propuesta visual independiente; no contiene migraciones, reordenamiento de series ni la gestión completa de división de bloques. Los controles de esfuerzo y tipo permanecen como botones, sin dropdowns.

Verificado en navegador: tres efectivas → [Calentamiento 1, Serie 1, Serie 2]; reconversión a normal; eliminar segunda → [Serie 1, Serie 2]; deshacer → [Serie 1, Serie 2, Serie 3]. Una carga de prueba de 55 se mantuvo asociada a la misma fila al renumerar y al restaurarla.
