# Volumen muscular en perfiles — implementación y pruebas

Implementado el 18 de septiembre de 2026 a partir de la auditoría de hipertrofia. La tarjeta compartida `MuscleVolumeCard` reemplaza el cálculo anterior en el perfil propio y el perfil conectado. También alimenta la miniatura del círculo con las mismas unidades y escala. Se conserva la integración con el mapa corporal incorporada en paralelo.

## Comportamiento

- Períodos móviles de 7, 28 y 90 días; 28 por defecto. Radar y barras muestran series equivalentes semanales: `(directas + 0,5 × indirectas) × 7 / días`.
- Los números de los ejes remiten a la lista de músculos. Las etiquetas completas y cantidades están disponibles para accesibilidad; la lista muestra directas, indirectas, días UTC y cambio absoluto respecto del período anterior.
- Al abrir un detalle se muestran cobertura y promedio de RIR/RPE, por separado. No se utiliza el esfuerzo prescrito ni se inventa esfuerzo faltante.
- Quince grupos estables, definidos por IDs en `constants/muscleVolumeTaxonomy.json`. La clasificación no depende de traducciones ni filtros del catálogo. Los grupos amplios desconocidos, como «Brazos» sin más precisión, no se reparten entre músculos inventando contribuciones.
- Los ceros se dibujan en el centro. Los objetivos privados no alteran la escala del volumen compartido. La escala común de realizado y período anterior se redondea hacia arriba en pasos de cinco; los objetivos superiores se limitan visualmente al borde y conservan su cifra completa en la lista, con una explicación visible.
- Objetivos opcionales de 0 a 100 series equivalentes/semana por músculo, con decimales. Campo vacío elimina el objetivo. El límite de entrada no es una recomendación de entrenamiento. Se guardan por separado del formulario de identidad y tienen su propio control de privacidad, apagado por defecto.
- «Ver como otros» consulta la proyección del servidor aplicando las preferencias guardadas. Nunca sustituye un error o un estado oculto por historial local.
- El servidor es la vista inicial. «Incluir registros locales» y la recuperación offline del dueño se identifican como provisionales. No se ofrece un falso historial vacío si el contexto local todavía no está disponible.
- La cobertura histórica se declara desconocida: el promedio resume registros disponibles en la ventana completa; no se afirma que las semanas sin registros prueben ausencia de entrenamiento.

## Política de cómputo v2

`utils/muscleVolume.ts` y `private.muscle_volume_period` implementan la misma política, verificada contra fixtures comunes.

Se filtran dueño, identificador, fecha válida y ventana `[inicio, fin)`. Se deduplican intentos y sets por identificador dentro de su contexto. Una serie requiere ejecución válida, coincidencia del ID planeado/realizado, repeticiones positivas y carga válida según modalidad. Se excluyen calentamientos, omitidas y resultados inválidos.

Principal aporta una serie directa; secundario aporta una indirecta. Varias asociaciones anatómicas del mismo eje conservan el rol de mayor contribución, sin sumarse. La relevancia numérica antigua no se interpreta como coeficiente de hipertrofia. Una serie puede aportar a varios grupos: la suma entre ejes no representa el número de series únicas.

Un `dropGroupId` se cuenta una vez por ejercicio, tomando el esfuerzo del primer segmento válido. Las series fraccionarias sin agrupación y el trabajo por tiempo se reportan como sin equivalencia y no se convierten arbitrariamente a series. Las series de descarga independientes continúan contando individualmente.

## Backend y despliegue

Migración: `supabase/migrations/20260918160000_muscle_volume_profiles.sql`.

- `get_profile_muscle_volume(target, window_days, preview)` expone únicamente agregados versionados, períodos, cobertura y objetivos autorizados.
- `save_muscle_volume_goals(goals_input, share_input)` valida y guarda objetivos del actor autenticado.
- La tabla de objetivos es privada. Los auxiliares SQL y el endpoint anterior renombrado no son invocables por usuarios autenticados o anónimos.
- Las RPC sociales individual y por lote conservan sus controles de relación/bloqueo y actualizan la miniatura a v2. No se exponen intentos, ejercicios ni sets crudos.
- El cambio se aplicó y registró **solo en Supabase local**, versión `20260918160000`. No se desplegó en remoto ni se creó commit.
- La app identifica una proyección incompatible como error; nunca etiqueta los antiguos puntos como series. El servidor remoto debe recibir esta migración antes de probar allí el cliente nuevo.

La migración es reaplicable; conserva las preferencias existentes. No cambia el historial de entrenamiento. Para rollback de la interfaz se debe coordinar también el contrato de unidades del backend, no volver a etiquetar la proyección v2 como puntos.

## Verificación

Comandos reproducibles:

```sh
npx vitest run
VOLUME_SQL_TEST=1 npx vitest run tests/muscleVolumeSql.test.ts
npx tsc --noEmit
EXPO_NO_DOTENV=1 npx expo export --platform all --output-dir /tmp/gymbro-volume-export-final
```

La suite SQL crea una base efímera con copia del esquema local, sin copiar datos; aplica la migración y elimina únicamente esa base al terminar. Compara ambos períodos de las tres ventanas con TypeScript. Comprueba dueño, vista previa, conexión, desconocido, bloqueo, acceso anónimo, permisos de auxiliares, privacidad de objetivos, validación de entrada y regresión de las RPC sociales.

Resultados registrados:

- Suite general: **973 tests aprobados**, 13 SQL omitidos en esa invocación por ser opt-in.
- Suite SQL independiente: **13 tests aprobados**, incluyendo los siete asserts del archivo de regresión SQL social.
- TypeScript sin errores; exportaciones web, Android e iOS completadas.
- Revisión visual con el componente real y datos ficticios en navegador, a anchos de 390 y 320 px: controles adaptables, etiquetas numéricas, barras y detalle de esfuerzo. Se verificaron cambio de período, edición/guardado decimal y vista compartida sin objetivos privados.
- El banco visual usa React Native Web y el renderizador SVG real; simula API, navegación y animaciones. La persistencia y autorización reales se verifican en PostgreSQL, no se deducen de esa demostración.

## Prueba física pendiente

La exportación nativa verifica compilación, no interacción táctil. Este entorno no proporciona control de dispositivos Android/iOS físicos. Falta recorrer allí el perfil propio y el de una conexión, con texto ampliado, TalkBack/VoiceOver, movimiento reducido y una sincronización offline real. La demostración web no sustituye esas comprobaciones.

Recorrido recomendado en Supabase local: registrar una sesión de cinco series más calentamiento; comprobar cinco directas y contribuciones indirectas; abrir el mismo perfil desde una conexión; alternar períodos y contornos; guardar un objetivo privado y verificar que no aparece públicamente; compartirlo, volver al perfil público y comprobarlo; ocultar la distribución y comprobar la vista previa; desconectar y verificar el estado provisional sin sustituir el perfil compartido.


## Reemplazo visual por mapa corporal

Los perfiles propios, perfiles sociales, tarjetas de conexión y publicaciones muestran anatomía anterior/posterior en lugar del radar. El volumen y sus permisos permanecen iguales. El mapa y los recortes usan el color primario del tema con opacidades 0.30, 0.50, 0.75 y 1 según la escala común; cero actividad usa el borde neutro del tema.

La lista conserva nombres, barras y cifras de volumen; los índices numéricos se sustituyen por los trazados bilaterales aislados, recortados mediante límites de curvas SVG. La silueta elegida se comparte entre mapa y filas. Las comparaciones aparecen como marcas en las barras. La selección funciona entre superficies y filas; en superficies superpuestas se elige el grupo de mayor volumen, sin sumar dos veces.

Los flexores de cadera no tienen superficie propia en esta geometría: la fila indica Región profunda y conserva sus datos. Los abductores comparten la superficie glútea según el mapeo existente. La previsualización localhost usa datos ficticios.
