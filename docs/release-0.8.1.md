# GymBro 0.8.1 — 20 de septiembre de 2026

Versión `0.8.1`, secuencia del tablón `11`. Cambios desde `0.8.0`.

## Novedades

- Guía opcional para preparar tu primera rutina, registrar un entrenamiento y revisar el resultado.
- Nueva sección Más → Cómo usar GymBro, con ayuda sobre rutinas, series, entrenamientos, resultados y mesociclos.
- Mapa Ranked con rangos por músculo, progreso de constancia y gemas por ascensos, con opción de pausar el seguimiento.
- Detalle del progreso muscular al finalizar el entrenamiento y selector entre mapas de volumen y rangos.
- Vista previa del mapa muscular antes de iniciar una rutina.
- 250 gemas de regalo por cuenta. ¡Gracias por seguir acompañándonos durante la beta!

## Correcciones

- El selector de ejercicios respeta los grupos musculares de la rutina y reconoce sus subgrupos al filtrar.
- La silueta del mapa muscular se adapta a los datos de tu perfil y se mantiene consistente entre pantallas.
- La ayuda conserva los campos del editor y solo ofrece iniciar desde una rutina guardada y válida.
- Mejoramos el espacio de las bibliotecas y la configuración del entrenamiento en pantallas pequeñas, el contraste y el foco de la ayuda.
- El resumen espera a que cargue el historial de la cuenta actual para evitar mostrar datos de la sesión anterior.
- Las preferencias de la guía se guardan por cuenta; las respuestas tardías no cambian la guía de otro usuario.

## Regalo beta

La campaña `release:0.8.1:250-gems` acredita 250 gemas una sola vez por cuenta al consultar el tablón de la nueva versión. Conserva las recompensas y lecturas de versiones anteriores. Las cuentas inactivas reciben el regalo cuando consultan el tablón; no hay acreditación masiva anticipada.

## Distribución

La validación automatizada no sustituye la matriz de aceptación en dispositivos físicos de `beta-acceptance-2026-09-20.md`. El cliente actualizado requiere distribución; este release no genera APK/IPA ni publica hosting.

## Verificación y despliegue

- 1020 pruebas generales aprobadas; las 30 SQL optativas se ejecutaron aparte y también aprobaron (1050 en total).
- Las 9 pruebas de versión y ShopProvider se repitieron después de actualizar la secuencia a 11, sin fallos.
- TypeScript sin errores; exportación Expo Android, iOS y web completada.
- 820 aserciones pgTAP aprobadas en 38 archivos, incluidas compatibilidad de versiones, anuncio y crédito único de 250 gemas.
- La migración de rangos ya estaba aplicada en ambas bases. Se aplicó la nueva migración `20260920210000_release_0_8_1_beta_reward.sql` primero en local y después en la beta remota.
- Dry-runs posteriores: ninguna migración pendiente en local ni remoto. Consulta remota: versión 0.8.1, secuencia 11, 6 novedades, 6 correcciones y campaña de 250 gemas.
- Este documento actualiza el estado de entrega descrito en el registro previo de consolidación; la aceptación física sigue pendiente.
