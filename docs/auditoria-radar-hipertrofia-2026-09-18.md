# Auditoría del radar muscular para hipertrofia

Fecha: 18 de septiembre de 2026. Alcance: investigación web, revisión del código actual y propuesta implementable. No se modificó la funcionalidad ni se consultaron datos personales o el esquema desplegado en producción.

## Decisión recomendada

Convertir el radar en un resumen de **volumen muscular registrado**, con series directas e indirectas, período explícito y detalle por músculo. Conservarlo como vista de distribución y acompañarlo con barras y cifras para decidir ajustes. No presentarlo como medición de crecimiento muscular ni como puntuación de calidad corporal.

Priorizar primero la equivalencia entre perfiles y la fidelidad de la geometría; después cambiar la métrica mediante una versión explícita. Los antiguos «puntos de estímulo» no son intercambiables con series.

## Evidencia consultada

| Fuente | Hallazgo relevante | Aplicación propuesta |
| --- | --- | --- |
| [Pelland et al., Sports Medicine, 2026; publicación online 2025](https://pubmed.ncbi.nlm.nih.gov/41343037/) | Metarregresión de 67 estudios: el conteo fraccionado, que asigna 0,5 a series indirectas, obtuvo mayor respaldo entre los modelos comparados. El volumen muestra rendimientos decrecientes. | Exponer series directas e indirectas; usar la suma fraccionada como estimación transparente, no como equivalencia biológica exacta. |
| [IUSCA, position stand, 2021](https://journal.iusca.org/index.php/Journal/article/download/81/140/5323) | Orienta el volumen por músculo y semana, reconoce variabilidad individual y plantea distribuir volúmenes altos entre sesiones. La frecuencia no debe interpretarse aisladamente del volumen. | Mostrar ventanas semanales y frecuencia como contexto. Evitar un objetivo universal o una recompensa automática por acumular volumen. |
| [Robinson et al., Sports Medicine, 2024](https://pubmed.ncbi.nlm.nih.gov/38970765/) | El análisis exploratorio asocia mayor proximidad al fallo con mayor hipertrofia; el RIR fue estimado y la relación exacta sigue siendo incierta. | Mostrar esfuerzo realmente registrado y su cobertura. No inventar una conversión exacta de RIR a «estímulo». |

Estas fuentes orientan el diseño; no validan los coeficientes actuales del catálogo, los objetivos 1,5/0,65 ni un polígono equilibrado como ideal de hipertrofia. La propuesta de interfaz y las ventanas elegidas son decisiones de producto.

## Hallazgos del código

| Prioridad | Hallazgo y evidencia | Consecuencia |
| --- | --- | --- |
| Alta | `utils/muscleDistribution.ts`: basta con `sets.some(performed)` y se suma una contribución por ejercicio. | Una serie y cinco del mismo ejercicio producen igual resultado; aumentar variedad puede aparentar más volumen que aumentar series. |
| Alta | El mismo filtro no excluye calentamientos ni exige una ejecución válida. `utils/workoutAttempts.ts:getEligiblePerformances` ya excluye tipo `C`, resultados inválidos e identificadores inconsistentes. | Puede registrar estímulo aunque solo se haya completado un calentamiento. Hay reglas disponibles para reutilizar, con adaptación para conservar metadatos por serie. |
| Alta | Perfil propio conserva orden de catálogo (`path, name, id`); RPC social usa `display_name`. El componente coloca ejes por índice. | Mismos valores pueden producir figuras distintas. |
| Alta | `app/profile/index.tsx` pasa `reference`; `app/social/[uid].tsx` no. `MuscleDistributionRadar.tsx` cambia la normalización según la referencia. | Falta el objetivo público y, en ciertos casos, cambia la escala del área realizada. No ocurre necesariamente con todos los datos. |
| Alta | `radarPoints(..., 8)` en el radar completo y mínimo 3 en el mini. | Un eje con cero aparece alejado del centro cuando hay otros ejes con actividad. |
| Media | El máximo se obtiene del propio conjunto. | Multiplicar todos los valores por dos conserva la forma y el tamaño sin referencia; el gráfico no permite evaluar cantidad absoluta. |
| Media | Ventana fija de 90 días, con texto fijo y memoización sin dependencia temporal en el perfil propio. | Cambios recientes quedan diluidos; el vencimiento de entrenamientos puede no reflejarse hasta recalcular. |
| Media | Cálculo duplicado TS/SQL: array vacío usa fallback solo en SQL; relevancia cero o negativa recibe tratamiento distinto; SQL redondea a tres decimales. | Posibles discrepancias numéricas adicionales. |
| Media | El cálculo local no deduplica intentos ni filtra propietario; acepta fechas inválidas o futuras por su condición actual. | Depende de garantías externas y puede sobrecontar entradas anómalas. No se confirmó que existan en datos reales. |
| Media | `muscleBalanceTargets.ts` utiliza coincidencias de texto y factores 1,5/0,65. La descripción de tren inferior menciona core, pero sus términos no lo incluyen. | Objetivos frágiles ante nombres y sin respaldo como dosis fisiológica. |
| Media | Se utilizan grupos padre visibles en filtros como ejes. | La taxonomía de filtros determina la visualización; si hay padres superpuestos, no se debe interpretar su suma como un reparto anatómico exclusivo. |
| Media | Etiquetas de 72 px, una línea, lienzo de 260 px y todos los grupos visibles. | Riesgo de truncamiento y solapamiento con muchos ejes o texto ampliado; requiere QA visual, todavía no realizado. |

La métrica de estadísticas también usa relevancias y reglas propias (`utils/analytics.ts`); reutilizarla sin revisar introduciría una tercera definición. El historial local pendiente de sincronización puede diferir legítimamente de la proyección pública, y debe identificarse como tal.

## Diseño funcional propuesto

### Métrica comprensible

Unidad principal: **series equivalentes estimadas**. Mostrar siempre su composición:

`series equivalentes = series directas + 0,5 × series indirectas`

Ejemplo ilustrativo: cuatro series de press, con pecho como principal y tríceps como secundario, aportan 4 directas a pecho y 2 equivalentes indirectas a tríceps. La asignación depende del ejercicio y de un catálogo revisado; no constituye una medición de crecimiento.

Reglas de implementación:

- Contar series de trabajo válidas realizadas; excluir calentamientos y omitidas. Validar dueño, identidad y fecha del entrenamiento, y deduplicar.
- Asignar cada músculo una sola vez por serie. Si varias asociaciones desembocan en el mismo eje, conservar el rol de mayor contribución, evitando sumar sinergistas hasta convertirlos artificialmente en trabajo directo.
- Revisar un mapa estable de IDs para grupos de presentación no superpuestos. No depender de nombres ni de `visibleInFilters` para definir ejes permanentes. Los agrupamientos amplios requieren detalle: «piernas» no demuestra trabajo de todos sus músculos.
- Tratar asociaciones desconocidas como «sin clasificar», con cobertura visible; no adjudicarles cero entrenamiento ni ocultarlas silenciosamente.
- No sumar subsegmentos de una drop set como series independientes automáticamente. Definir y probar una política por técnica antes de habilitar esa equivalencia; identificar técnicas sin equivalencia soportada.
- No convertir carga × repeticiones en comparador principal entre músculos. Conservar esa información en el detalle por ejercicio.
- No exigir RIR para contar una serie ni usar el esfuerzo prescrito como realizado. Reutilizar `actualEffort` y mostrar «esfuerzo registrado en X de Y series», manteniendo RIR y RPE separados.

### Períodos y objetivos

Por defecto, mostrar promedio semanal de los últimos 28 días; selector de últimos 7 días y 90 días. Indicar fechas exactas y «promedio semanal» cuando corresponda. Para ventanas de 28 días, dividir por cuatro incluyendo semanas sin entrenamientos; si la cobertura histórica es desconocida, advertir «historial parcial» y no estimar retrospectivamente.

Comparar con una ventana anterior de igual duración y el mismo criterio de corte. Diferenciar ausencia de registros de falta de cobertura. Un rango móvil evita comparar una semana actual incompleta con otra completa.

Objetivos editables por músculo, opcionales, expresados en la misma unidad y período. Sin objetivo configurado, mostrar volumen sin semáforos. Los presets de énfasis pueden servir como preferencias, pero no deben llamarse «equilibrio ideal» ni diagnosticar desbalances. Ninguna de las fuentes justifica que todos los músculos deban recibir el mismo número de series.

### Lectura visual

- Mantener el radar como resumen de distribución con ejes estables, ceros en el centro y leyenda explícita.
- Añadir barras por músculo con valor absoluto, directas/indirectas y objetivo opcional. Esta vista proporciona el detalle numérico y la alternativa accesible.
- En modo distribución, marcar que el área describe proporciones, no cantidad total, y acompañarla con cifras absolutas por músculo. Los porcentajes de contribuciones no equivalen al porcentaje de series únicas de la sesión.
- Si se ofrece modo de volumen absoluto, usar una escala explícita común a ambas vistas y a los períodos comparados; no normalizar cada polígono por separado. Si el máximo debe ampliarse, hacerlo conjuntamente e indicarlo.
- Limitar a dos polígonos: realizado y objetivo, o realizado y período anterior. Distinguir con trazos y etiquetas además de color.
- Al tocar un músculo: directas, indirectas, días entrenados, cambio frente al período anterior y cobertura de esfuerzo. Los detalles de ejercicios siguen los permisos existentes.
- No puntuar el área, no premiar el exceso de volumen y no afirmar «músculo atrasado» a partir de registros.

## Contrato compartido y sincronización

Definir una proyección versionada con `metricVersion`, `taxonomyVersion`, `subjectId`, `windowStart`, `windowEnd`, `asOf`, `axes`, series directas/indirectas/equivalentes, cobertura y objetivo opcional. El mismo snapshot debe generar la misma geometría en perfil propio, público y miniatura, con independencia del tema visual.

La proyección persistida del servidor es la referencia de lo compartido. La vista propia puede incorporar entrenamientos locales con una indicación de pendiente de sincronización; ofrecer «ver como otros» usando exactamente la proyección pública aplicable al dueño. La RPC social actual rechaza `target = actor`: la vista previa necesita un endpoint propio autorizado o una proyección compartida interna, no quitar controles de acceso.

Para modo offline, mantener una implementación local de la especificación con fixtures de paridad TS/SQL. Si la arquitectura permite centralizar el cálculo, preferirlo; en ambos casos, impedir que cada pantalla defina su fórmula. Fijar un mismo corte temporal y refrescar al volver al foco. No exponer registros crudos para lograr paridad.

Los objetivos solo aparecen públicamente si se define y respeta su visibilidad. Un borrador local de objetivo debe identificarse como borrador; no considerarlo una discrepancia pública. Perfil oculto, sin historial, historial parcial y sincronización pendiente son estados diferentes.

## Plan de entrega y aceptación

1. **Corrección de integridad:** orden canónico, cero real, escala independiente de mostrar referencia, reglas de fallback consistentes y fecha de corte compartida. Mantener identificada la métrica antigua.
2. **Métrica nueva:** clasificar catálogo, definir series elegibles y técnicas especiales, contrato versionado y proyección pública/privada equivalente. Recalcular desde snapshots históricos disponibles; nunca convertir antiguos puntos por un factor fijo.
3. **Experiencia:** períodos, barras de detalle, objetivos por músculo, comparación temporal y estados de cobertura/sincronización.
4. **Verificación:** fixtures comunes SQL/TS; pruebas de integración de ambas pantallas; revisión visual web/Android/iOS con etiquetas largas, texto ampliado, muchos ejes, lector de pantalla y movimiento reducido.

Criterios comprobables:

- Misma persona, snapshot, período y configuración: mismos IDs, orden, valores y coordenadas entre vistas.
- Cinco series directas aportan cinco veces el volumen de una; calentamientos y series omitidas no aportan.
- Duplicados y relaciones anatómicas repetidas no incrementan el volumen.
- Cero se dibuja en el centro, sin desaparecer su etiqueta.
- Mostrar/ocultar objetivo no mueve el área realizada.
- Una serie indirecta aporta 0,5 bajo la política propuesta; datos desconocidos se identifican.
- Ventanas, zonas horarias y límites exactos comparten fixtures; futuras e inválidas se excluyen.
- Cambiar nombres del catálogo no altera posiciones; cambiar taxonomía exige versión.
- Estado privado se mantiene privado también en miniaturas, errores, caché y vista previa.

## Validación de esta auditoría

Se revisaron los selectores, contratos, pantallas, renderizadores web/nativo, objetivos y migraciones relacionadas. Las pruebas existentes de radar y perfiles verifican representación básica, pero no la paridad entre caminos ni la validez del modelo de volumen. No sustituyen la inspección visual en dispositivos ni confirman el estado del servidor desplegado.

Ejecutado: `npx vitest run tests/muscleDistribution.test.ts tests/muscleDistributionRadar.test.ts tests/muscleDistributionRadarWeb.test.ts tests/socialProfileScreen.test.ts`. Resultado: **4 archivos, 16 tests aprobados**.
