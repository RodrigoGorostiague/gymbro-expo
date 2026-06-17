# GymBro

App móvil (Expo) para crear rutinas de gimnasio, ejecutarlas con cronómetro y temporizador de descanso, y hacer seguimiento del progreso. Diseño glassmorphism con temas personalizables y modo dual para dos perfiles.

## Características

- **Rutinas (mesociclos)**: ejercicios, series, peso y repeticiones
- **Ejecución**: cronómetro + descanso configurable entre series
- **Progreso**: minutos, tonelaje y gráficos por ejercicio
- **Tienda de temas**: gemas, preview y temas de perfil (naranja / rosa)
- **Modo dual**: combinar tu tema con el de tu pareja (como el login)
- **Sync Firebase** (opcional): mensajes entre perfiles y temas equipados
- **Login** con dos perfiles:
  - `rodaja` / `1234`
  - `brisas` / `sonrisas`

## Ejecutar

```bash
npm install
npm start
```

Expo Go (QR) o:

```bash
npm run android
npm run ios
npm run web
```

## Firebase (opcional)

Configura tu proyecto en `app.json` → `expo.extra` y despliega reglas:

```bash
npx firebase-tools@latest deploy --only firestore:rules
```

## Estructura

- `app/` — pantallas (Expo Router)
- `components/` — UI, login dual, glass cards
- `context/` — auth, temas, tienda, datos
- `services/` — sync Firebase
- `utils/` — storage y analíticas

Los datos locales usan AsyncStorage.

## Stack

Expo SDK 56 · React Native · TypeScript · Reanimated · Firebase Firestore
