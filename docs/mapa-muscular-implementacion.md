# Mapa muscular interactivo

Implementado el 18 de septiembre de 2026. Componente SVG local, sin API de anatomía ni dependencia nueva.

## Superficies

- Ejercicio: participación principal, secundaria o sin especificar.
- Creación y edición de rutina: proyección en vivo del borrador.
- Mesociclo: bloque completo o semana; planificación y, en el resumen, trabajo realizado. Escala de volumen común entre ambos.
- Cierre y resumen personal: series realizadas del intento del propietario; compatibilidad con sesiones antiguas.
- Publicaciones individuales/conjuntas: versión compacta expandible basada únicamente en la distribución publicada. Detalles del entrenamiento compartido: series del resumen autorizado.
- Perfil propio y social: integrado en `MuscleVolumeCard`, con el mismo período y snapshot autorizado que el radar. No añade otra consulta ni un fallback privado para perfiles ajenos.

## Interacción

Dos siluetas con frente y espalda, selección por zona o nombre, leyenda, detalle y lista textual accesible. Las variantes compactas se expanden. Volumen, días y esfuerzo RIR/RPE se ofrecen según los datos disponibles. Ambos lados del cuerpo muestran la misma agregación: no se infiere lateralidad.

## Datos y significado

`constants/bodyMapMapping.ts` relaciona IDs estables del catálogo y nombres históricos con 16 regiones superficiales. Los grupos amplios pueden colorear varias regiones; los profundos o desconocidos se explicitan como no representables. No se usa coincidencia aproximada de nombres ni se inventa una localización anatómica.

`utils/bodyMapProjection.ts` contiene proyecciones puras:

- Rutina y mesociclo: series de trabajo × relevancia muscular. Se toma el máximo de relevancia por ejercicio/región para no duplicar asociaciones superpuestas; se excluyen calentamientos y se cuenta un bloque drop una vez.
- Intentos: solo resultados realizados y válidos, filtrados por propietario y linaje del mesociclo. Se deduplican intentos y series. El esfuerzo corresponde a segmentos efectivamente registrados, incluido RIR cero; no se sustituye por objetivos planificados.
- Perfil: conserva la métrica del radar, directas + ½ indirectas, normalizada a semana. El detalle de directas/indirectas y días corresponde al período completo. Si dos ejes agregados coinciden en una superficie, se conserva el de mayor volumen, sin sumarlos.
- Feed: distribución publicada, no se reinterpreta como series. Los resúmenes reducidos usan «series registradas» porque no conservan tipos de serie o roles. No consultan intentos privados para enriquecer lo publicado.

El color no significa recuperación, fatiga, crecimiento ni calidad del entrenamiento. RIR y RPE se mantienen separados. La escala se comparte entre frente y espalda; el esfuerzo sin datos muestra «Sin registro». Los datos incompletos permanecen visibles como cobertura parcial.

## Archivos principales

- `components/MuscleBodyMap.tsx`: presentación y controles, sin consultas.
- `components/TrainingBodyMap.tsx`: adaptadores por contexto.
- `utils/bodyMapProjection.ts`: cálculo y selección de datos.
- `constants/bodyMap/`: geometrías SVG, etiquetas y licencia.
- `tests/bodyMapProjection.test.ts`, `tests/muscleBodyMap.test.ts`: proyecciones, geometrías, privacidad, estados e interacción.

Geometrías adaptadas de react-native-body-highlighter bajo MIT; commit y atribución en `constants/bodyMap/PROVENANCE.md`, licencia completa en `constants/bodyMap/LICENSE`.

## Verificación

- TypeScript sin errores y exportación web de Expo completada correctamente.
- Suite completa: 972 pruebas aprobadas, 13 omitidas y 1 fallo ajeno al mapa: `tests/socialScreen.test.ts:453` conserva el texto anterior de la tarjeta de récord personal («Superó su mejor marca»), mientras la tarjeta actual muestra «RÉCORD PERSONAL» y separa ejercicio/valor.
- Revisión visual del componente real con React Native Web: frente/espalda, ambas siluetas y selección de región con detalle. Datos de demostración; sin publicar información real.
- No se ha probado en dispositivos físicos Android/iOS.
