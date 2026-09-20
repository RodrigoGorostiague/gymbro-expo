# GymBro

Aplicación de entrenamiento con Expo y React Native: rutinas, mesociclos, registro de sesiones, progreso y comunidad.

**Versión integrada: 0.8.0.** Consulta [el roadmap](docs/roadmap.md) para conocer el estado actual. La guía contextual y los rangos musculares están implementados en el árbol de trabajo; requieren aceptación física y empaquetado de la próxima entrega.

## Funciones

- Editor con borradores recuperables, catálogo, modalidades de carga, series por repeticiones o tiempo y objetivos RIR/RPE.
- Mesociclos con calendario, reprogramación, recuperación, versiones históricas y evolución entre semanas.
- Entrenamiento individual offline, sincronización posterior y continuidad entre dispositivos; sesiones conjuntas online.
- Cierre revisable, historial, resumen semanal, récords, experiencia y gemas.
- Mapas, volumen y rangos musculares con pausa de recuperación.
- Comunidad, relaciones, invitaciones, publicaciones e intercambio de planes.
- Medidas corporales sincronizadas y fotos locales en Android/iOS.
- Ayuda opcional del primer entrenamiento y Más → Cómo usar GymBro.

## Desarrollo

```bash
npm install
npm run dev
```

El script local configura Expo contra Supabase local. Para usar la configuración pública de tu entorno: `npm start`. También existen `npm run android`, `npm run ios` y `npm run web`. Las cuentas actuales usan Supabase Auth; no hay credenciales de prueba publicadas aquí.

Configura únicamente `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` como variables públicas. Nunca incluyas claves administrativas. Consulta [operaciones de beta](docs/supabase-beta.md) antes de modificar bases existentes; no reinicies una base con datos para aplicar una migración.

## Validación

```bash
npm test
npx tsc --noEmit
npx supabase test db
RANK_SQL_TEST=1 npx vitest run tests/muscleRankSql.test.ts
VOLUME_SQL_TEST=1 npx vitest run tests/muscleVolumeSql.test.ts
```

Las pruebas SQL optativas requieren el contenedor local `supabase_db_gymbro`; crean y eliminan bases aisladas. Exportar Expo valida el empaquetado, pero no sustituye la [aceptación física](docs/beta-acceptance-2026-09-20.md).

## Estructura y tecnología

- `app/`: rutas Expo Router.
- `components/`, `context/`, `hooks/`: interfaz y estado.
- `services/`, `utils/`: backend, persistencia local y reglas de dominio.
- `supabase/`: migraciones y pruebas SQL.
- `packages/contracts/`: contratos compartidos con web.
- `docs/roadmap.md`: estado actual; `openspec/changes/`: planes y evidencia históricos.

El manifiesto actual usa **Expo SDK 57**, React 19, React Native, TypeScript, Reanimated y Supabase. AsyncStorage conserva preferencias y diarios locales. Quedan módulos/dependencias históricos de Firebase; no describen la arquitectura vigente de autenticación y entrenamiento. Sigue también `AGENTS.md` antes de escribir código.

La plataforma web de escritorio tiene su propio repositorio hermano, `gymbro-web`, y su propio ciclo de entrega.
