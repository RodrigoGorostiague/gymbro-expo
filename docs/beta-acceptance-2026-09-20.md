# Aceptación de beta — 20 de septiembre de 2026

Esta matriz separa evidencia automatizada de aceptación física. `adb devices -l` no encontró dispositivos conectados. No se simularon aprobaciones ni se usaron cuentas personales para publicar entrenamientos de prueba.

## Recorrido pendiente en dispositivos

Registrar para cada fila: Android/iOS y versión, modelo, build/commit, fecha, resultado y reproducción sin credenciales ni datos personales. Usar dos cuentas de prueba y rutinas reconocibles como pruebas.

| Prioridad | Escenario | Resultado requerido | Estado físico |
|---|---|---|---|
| 1 | Usuario nuevo: aceptar guía, crear rutina, guardar, iniciar explícitamente, registrar una serie, finalizar y abrir resultado | Guía basada en datos guardados, sesión parcial válida y acceso a Progreso | Pendiente |
| 1 | Ocultar guía, reiniciar, abrir Más → Cómo usar GymBro | Entrenar disponible, ocultación persistente, ayuda recuperable | Pendiente |
| 1 | Editar carga/repeticiones, abrir/cerrar ayuda, guardar o recibir error | Campos conservados; ningún inicio con valores sin guardar | Pendiente |
| 1 | Modo avión: registrar, cerrar forzadamente, reabrir y reconectar | Un intento conservado, una sesión y un crédito; sincronización confirmada honestamente | Pendiente |
| 1 | Continuar en otro dispositivo; editar simultáneamente | Un intento canónico; conflicto explícito, sin sobrescrito silencioso | Pendiente |
| 1 | Sesión conjunta con dos cuentas; reconexión durante cierre | Resultado personal preservado; publicación conjunta única cuando corresponda | Pendiente |
| 1 | Cambiar cuenta con consulta de ayuda o biblioteca pendientes | Sin preferencias, rutina ni resultado de la cuenta anterior | Pendiente |
| 2 | Rangos: subir, reabrir resultado, pausar/reanudar | Premio único, snapshot estable, fecha UTC y pausa claras | Pendiente |
| 2 | Mesociclo: descanso y hueco; borrador, activación y reprogramación | Validación coherente; ayuda sin activar ni ejecutar sesiones | Pendiente |
| 2 | Comunidad: relación, bloqueo en ambos sentidos, eliminación de relación y refresco | Solo contenido autorizado; seguir también `social-two-account-test.md` | Pendiente |
| 2 | Cámara: permitir/denegar, interrumpir captura y comparar | Recuperación sin pérdida y almacenamiento explicado correctamente | Pendiente |
| 2 | Teléfono pequeño, texto grande, temas, VoiceOver/TalkBack y movimiento reducido | Acciones alcanzables, sin recortes, información equivalente | Pendiente |
| 3 | Historial/feed largos, segundo plano y sesión prolongada | Fluidez y consumo medidos en dispositivos acordados | Pendiente |

## Evidencia disponible

- Pruebas unitarias y de componentes: ver registro de consolidación.
- Privacidad, idempotencia, recompensas y transportes: pruebas SQL; 810 aserciones pgTAP después de aplicar la migración.
- Exportación Expo Android/iOS/web: no sustituye instalación ni permisos nativos.
- Inspección visual/interacción de la ayuda real exportada a web, sin cuenta: temas expandibles y pantalla estrecha. No certifica flujo autenticado ni lectores de pantalla nativos.
- Web independiente: 188 pruebas y build; no se ejecutó un nuevo E2E con autenticación/backend real ni se publicó hosting.

## Cierre

La beta no queda aceptada por completar únicamente pruebas automáticas. Resolver primero pérdida/duplicación de registros, exposición entre cuentas, finalización ambigua o premios duplicados. Para presentación, registrar pantalla, tema y escala sin datos privados. Actualizar esta matriz y el roadmap al completar cada recorrido.
