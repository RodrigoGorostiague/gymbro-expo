# Ejecución con tarjetas plegables

La ejecución adopta la jerarquía del editor de rutinas: resumen de la sesión, tarjetas de ejercicio con avance y detalle desplegable.

- Se abre inicialmente el ejercicio con la primera serie pendiente. Los demás muestran nombre, posición, estado y series realizadas/planificadas.
- El avance automático abre el siguiente ejercicio y pliega el anterior cuando no hay una preferencia manual. Se pueden mantener varias tarjetas abiertas.
- «Desplegar ejercicios» / «Ocultar ejercicios» y el modo de foco son complementarios. Salir del foco recupera las aperturas manuales.
- Las series completadas muestran sus datos y esfuerzo real en un resumen. «Editar» las reabre mediante la operación existente, sin inventar nuevos resultados.
- Antes de plegar o cambiar de modo se solicita guardar los valores actuales, incluso si el último campo aún tiene foco. El estado del formulario permanece en la ejecución, fuera del componente plegable.
- La tarjeta y la próxima serie se identifican por ID; los rótulos usan la secuencia compartida C/efectiva/F/Drop. El avance global cuenta solo series de la instantánea actual.
- Los descansos, las restricciones de ejercicios iniciados, las operaciones compartidas y la confirmación final mantienen su lógica existente.

Las preferencias de apertura son locales a la pantalla y se reinician al cambiar de intento. Al reabrir la app se deriva el ejercicio actual del entrenamiento recuperado; no se persiste una segunda copia del entrenamiento.

Verificación: 125 pruebas de ejecución, recuperación, esfuerzo, borrador, mesociclo y publicación conjunta aprobadas. Se añadieron pruebas de plegado con un campo sin perder foco, cambio al siguiente ejercicio, reapertura de series, foco combinado con aperturas manuales y recuperación con claves antiguas de series eliminadas.

Pendiente de comprobación manual: teclado/scroll y lector de pantalla en dispositivo. No se requieren cambios de base de datos para este rediseño.
