export type ReleaseNotes = {
  version: string;
  title: string;
  message: string;
  changes: readonly string[];
  rewardGems?: number;
};

// Add a new entry here whenever the visible app version changes.
export const RELEASE_NOTES: readonly ReleaseNotes[] = [
  {
    version: '0.4.0',
    title: 'Tu progreso tiene una nueva dimensión',
    message: 'Gracias por construir GymBro con nosotros. Esta alfa sigue evolucionando para que cada entrenamiento, logro y conexión cuenten.',
    changes: [
      'Onboarding privado con identidad, antropometrías y avatares personalizados.',
      'Nuevo radar muscular y gráficos animados para entender tu progreso.',
      'Análisis de entrenamientos con comparación contra tus sesiones anteriores.',
      'Entrenamientos conjuntos más flexibles, con grupos e invitaciones en vivo.',
      'Feed de comunidad con hitos, récords, rachas y logros compartidos.',
      'Mejoras de estabilidad en Android, recaps, perfiles y notificaciones.',
    ],
    rewardGems: 100,
  },
  {
    version: '0.3.0',
    title: 'Más conexión, más motivación',
    message: 'Gracias por ser parte de esta alfa. Tu constancia inspira al círculo: entrená, compartí y seguí construyendo tu mejor versión.',
    changes: [
      'Nueva bandeja de notificaciones para enterarte de la actividad importante.',
      'Abrí directamente el contenido desde una notificación al volver a la app.',
      'Reaccioná y comentá publicaciones de entrenamiento de tu círculo.',
      'Compartí cuándo empezás una rutina para entrenar acompañado.',
      'Nuevos avatares deportivos inspirados en fútbol y Argentina.',
      'Mejoras de estabilidad en el envío de notificaciones.',
    ],
    rewardGems: 50,
  },
  {
    version: '0.2.0',
    title: 'GymBro sigue creciendo con vos',
    message: 'Gracias por entrenar con nosotros. Esta alfa sigue creciendo gracias a ustedes. Cada sesión cuenta: seguí sumando, una repetición a la vez.',
    changes: [
      'Seguimiento visual de tus mesociclos, adherencia y progreso semanal.',
      'Gráficos para ver la evolución de carga por ejercicio.',
      'Más detalles y copias de rutinas o mesociclos en publicaciones compartidas.',
      'Entrenamientos conjuntos e invitaciones más confiables.',
      'Nuevos avatares, temas y mejoras de privacidad.',
      'Corregimos el cálculo de tonelaje para cargas en libras.',
    ],
    rewardGems: 50,
  },
  {
    version: '0.1.0',
    title: 'Gracias por entrenar con GymBro',
    message: 'Esta es una version ultra alfa: puede tener errores. Gracias por ayudarnos a construir una app mejor con cada entrenamiento. Segui avanzando, una repeticion a la vez.',
    changes: [
      'Estrenamos las novedades de version dentro de la app.',
      'Vas a ver este mensaje solo una vez por cada actualizacion.',
      'Empezamos el versionado publico de GymBro en etapa alfa.',
    ],
  },
];

export const CURRENT_RELEASE_NOTES = RELEASE_NOTES[0];
