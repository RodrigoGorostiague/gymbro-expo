# Mapa muscular frontal y posterior para GymBro

Investigación: 18 de septiembre de 2026. Alcance: documentación oficial, alternativas abiertas y revisión del código local. Propuesta pendiente de implementación y validación en dispositivos.

## Recomendación

Crear un componente propio `MuscleBodyMap` con geometría SVG frontal/posterior y regiones independientes. Usar `react-native-svg`, ya presente, y una tabla explícita que conecte las regiones con IDs del catálogo. Para acelerar el primer prototipo, evaluar las geometrías de `react-native-body-highlighter`, conservando licencia, autoría y revisión de origen de los archivos que se incorporen. Mantener la lógica de métricas fuera del dibujo.

Puedo construir las figuras como vectores editables y programar color, selección, leyenda y detalle. La calidad final requiere revisar proporciones y correspondencia anatómica. Una ilustración esquemática es suficiente para grupos de entrenamiento; los fragmentos gráficos no deben presentarse como subdivisiones musculares científicamente validadas.

## Compatibilidad comprobada en documentación

Se leyó primero [Expo SDK 56](https://docs.expo.dev/versions/v56.0.0/) como exige AGENTS.md. El `package.json` local declara Expo `~57.0.22`, React Native `0.86.3` y `react-native-svg` `15.15.4`. La [documentación versionada de SVG en SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/svg/) recomienda precisamente `15.15.4` y documenta Android, iOS, web, interactividad y animación. No hace falta una actualización de Expo para proponer este componente. La compatibilidad de una biblioteca de mapas adicional todavía debe probarse en el proyecto.

## Alternativas

| Opción | Evidencia | Decisión |
| --- | --- | --- |
| SVG propio sobre react-native-svg | Control de regiones, colores, eventos y presentación; dependencia existente. | Recomendado para el componente de producto. Mayor trabajo inicial de geometría si se dibuja desde cero. |
| [react-native-body-highlighter](https://github.com/HichamELBSI/react-native-body-highlighter) | Frente/espalda, figuras masculina/femenina, selección por zona y lado, colores configurables. | Buen punto de partida para el prototipo o sus geometrías. Validar cobertura del catálogo. |
| [react-native-body-parts-anatomy](https://github.com/eslamelfateh/react-native-body-parts-anatomy) | Declara 317 fragmentos en 23 grupos, zoom y accesibilidad por fragmento. Su README advierte limitaciones de selección web. | Exceso de detalle para el MVP; estudiar si más adelante se necesita selección intramuscular. |
| [react-body-highlighter](https://github.com/giavinh79/react-body-highlighter) | Componente React para modelos anterior/posterior. | Referencia para web; no asumir que sustituye un componente React Native. |

La [licencia de react-native-body-highlighter](https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/LICENSE) es MIT e incluye conservación del aviso. Su [manifest en main](https://raw.githubusercontent.com/HichamELBSI/react-native-body-highlighter/main/package.json) declara versión 3.2.0 y dependencia SVG ^15.9.0; esto no demuestra por sí mismo la versión publicada ni una prueba en nuestro entorno. Fijar versión/commit al incorporar material.

Limitaciones relevantes del mapa candidato: `upper-back`/`lower-back` no equivalen automáticamente a dorsales/trapecio/erectores; `deltoids` no distingue todas las cabezas del hombro. Su accesibilidad documentada identifica el cuerpo completo, pero no cada región. El adaptador y la lista textual accesible son parte de la implementación.

## Datos ya disponibles

- `services/catalog.ts`: grupos con IDs, nombres, jerarquía y participaciones por ejercicio con rol y relevancia.
- `docs/normalized-exercise-catalog.md`: taxonomía GM-xxx; admite múltiples padres. El catálogo se mantiene desde sus fuentes, no desde el componente visual.
- `types/index.ts`: intentos realizados y esfuerzo real opcional. El esfuerzo prescrito y el realizado son datos distintos.
- `utils/muscleDistribution.ts`: calcula contribuciones por ejercicio realizado en 90 días. Una o cinco series del mismo ejercicio aportan lo mismo; no representa volumen en series.
- `utils/analytics.ts`: contiene otra agregación de estadísticas musculares. Revisar diferencias antes de elegir una definición común.
- `app/exercise/[id].tsx`: ubicación natural para participación muscular.
- `app/profile/index.tsx`, `app/social/[uid].tsx`: ya presentan un radar y tienen reglas para compartir distribución.
- `components/WorkoutRecapAnalysis.tsx`: detalle de sesión donde se puede incorporar un mapa con datos realmente realizados.

La [auditoría local del radar](./auditoria-radar-hipertrofia-2026-09-18.md) ya propone separar distribución, volumen y esfuerzo. Este componente debería consumir esa futura proyección común, evitando una tercera fórmula independiente.

## Modos de visualización propuestos

| Modo | Significado del color | Detalle al seleccionar |
| --- | --- | --- |
| Ejercicio | Principal, secundario, sin participación registrada. | Nombre y rol de los grupos asociados. |
| Rutina planificada | Series previstas por grupo, con unidad visible. | Ejercicios y series planificadas. |
| Sesión realizada | Series de trabajo válidas completadas por grupo. | Series directas/indirectas y ejercicios. |
| Historial | Volumen registrado o días entrenados en un período explícito. | Valor, fechas, cobertura y comparación. |
| Esfuerzo | RIR o RPE realmente registrado, en vistas separadas. | Valores y proporción de series con registro. |

La primera entrega debería incluir ejercicio y sesión. El perfil se incorpora cuando la métrica compartida esté definida. El mapa y el radar pueden ser vistas del mismo dato; el mapa aporta ubicación y las cifras permiten comparar.

Usar un selector de modo: un mismo color no debe significar a la vez volumen, esfuerzo y recuperación. Para volumen, una escala secuencial con leyenda numérica; para participación, colores discretos y etiquetas. Mostrar cero registrado y datos desconocidos con estados distintos. Mantener la misma escala entre períodos comparados; no renormalizar cada cuerpo por separado. Más color significa más cantidad registrada, no necesariamente mejor entrenamiento.

Podemos mostrar tiempo desde la última sesión registrada. No convertirlo automáticamente en un porcentaje de recuperación, fatiga fisiológica o crecimiento: los datos revisados no proporcionan una medición directa de esas variables.

## Arquitectura propuesta

1. Geometría versionada: regiones con ID estable, vista, lado anatómico y uno o varios paths. Misma región lógica para piezas que aparecen en ambas vistas.
2. Adaptador del catálogo: IDs GM-xxx → regiones. Mantener un adaptador separado para los identificadores heredados en español. No resolver el mapeo por coincidencias aproximadas de nombres en cada render.
3. Proyección de métricas: recibe ejercicio, plan o intentos; devuelve valor, unidad, cobertura, período y versión de métrica por región lógica.
4. Componente visual: recibe proyección, vista frontal/posterior, selección, tema y callback. No consulta Supabase ni interpreta series.
5. Panel de detalle y lista accesible: ofrecen los mismos valores e interacciones sin depender de distinguir colores o tocar una zona pequeña.

Archivos sugeridos para una implementación posterior: `components/MuscleBodyMap.tsx`, `constants/bodyMapGeometry.ts`, `constants/bodyMapCatalogMapping.ts`, `utils/bodyMapProjection.ts` y pruebas de mapeo/proyección. Los nombres son propuesta; todavía no se crearon estos módulos.

Reglas de mapeo:

- Mantener muchos-a-muchos explícito: un grupo puede ocupar varias piezas visuales, pero sigue teniendo un solo valor lógico.
- No sumar dos veces una contribución por aparecer en frente/espalda, izquierda/derecha o por múltiples caminos de la jerarquía.
- No atribuir a cada submúsculo el volumen de un grupo amplio como si hubiera sido medido individualmente. Indicar nivel de agrupación.
- Si no se registra lateralidad, colorear ambos lados como representación del grupo sin inferir diferencias entre ellos.
- `fullBody` y asociaciones desconocidas no justifican iluminar todos los músculos. Mostrar cobertura incompleta o sin clasificar.
- Revisar regiones profundas o no visibles; representarlas mediante grupo superficial con explicación o mediante el detalle textual, sin inventar una localización superficial precisa.

## Implementación por etapas

1. **Geometría y taxonomía.** Revisar cobertura contra el catálogo real, preparar siluetas frontal/posterior y matriz de correspondencias. Demostración con datos ficticios explícitos y revisión visual antes de conectar métricas.
2. **Detalle de ejercicio.** Colorear roles principales/secundarios desde las participaciones existentes. Permitir tocar una zona y ver su nombre. Esta etapa puede funcionar sin cambios de esquema ni servicios nuevos.
3. **Resumen de sesión.** Contar series válidas realizadas, excluir calentamientos/omitidas y definir agrupación de técnicas especiales. Separar directas e indirectas. Si se agrega ponderación, mostrar fórmula y versión; no reutilizar los puntos de 90 días como si fueran series.
4. **Historial y perfil.** Adoptar la proyección común prevista en la auditoría del radar, períodos y escalas comparables. Alinear cálculo local y servidor y conservar permisos de distribución muscular. Los agregados públicos de grupos amplios no permiten reconstruir detalles individuales ocultos.
5. **Extensiones.** Selector anatómico de ejercicios, vista de planificación, comparación entre períodos y esfuerzo registrado con cobertura.

## Verificación necesaria

- Mapeo completo o desconocidos explícitos; fixtures reales de catálogo y compatibilidad con IDs heredados.
- Sin duplicación por jerarquía, piezas, vistas ni lados; frontal y posterior muestran la misma selección lógica.
- Sesiones omitidas/calentamientos, fechas límite, historial vacío, registros duplicados y datos pendientes de sincronizar.
- Colores monotónicos y escalas compartidas; ausencia de datos distinta de cero.
- Android, iOS y web: proporciones, áreas táctiles, scroll, modos claro/oscuro, texto ampliado y lectores de pantalla. Probar rendimiento de miniaturas en listas si se añaden.
- Privacidad: no mostrar detalle adicional al autorizado en perfiles sociales; equivalencia con el snapshot publicado.

No se instaló ninguna biblioteca ni se modificó funcionalidad. La viabilidad se fundamenta en el código y las APIs documentadas; la calidad anatómica, interacción y rendimiento quedan pendientes de un prototipo ejecutado.
