import React, { useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useFunctionalGuidance } from '../context/FunctionalGuidanceContext';
import { GlassButton } from './UI';

export const trainingHelp = {
  routines: { title: 'Rutinas', text: 'Una rutina es una plantilla de ejercicios y series que puedes volver a usar. En el editor, ponle un nombre, agrega ejercicios y revisa sus series. Guarda la rutina en tu biblioteca cuando esté preparada. El borrador de este dispositivo todavía no es una rutina guardada en tu cuenta. Puedes entrenar sin crear un mesociclo.' },
  sets: { title: 'Cómo funcionan las series', text: 'Una serie es un grupo de repeticiones o un intervalo de tiempo. La rutina contiene valores previstos; al entrenar, registra lo que realmente haces. La carga depende de la modalidad del ejercicio: peso corporal, carga añadida o asistencia. RIR/RPE objetivo y esfuerzo realizado son registros separados.' },
  workout: { title: 'Registrar un entrenamiento', text: 'Abrir la preparación no inicia la sesión. Iniciar entrenamiento comienza el registro. Revisa carga, repeticiones o duración antes de marcar cada serie. Puedes corregirla y continuar después del descanso. Finalizar sesión permite guardar lo realizado o cancelar; las series pendientes no se marcan como hechas. Si hay un guardado pendiente, usa la recuperación que ofrece la app.' },
  results: { title: 'Resultados y progreso', text: 'El resultado muestra lo que registraste. Puedes consultar las series realizadas y pendientes, corregir los datos y abrir Progreso. Guardar un entrenamiento y publicarlo son pasos distintos: revisa la publicación y tus preferencias de privacidad. Un resultado pendiente de sincronización todavía necesita confirmación.' },
  mesocycles: { title: '¿Qué es un mesociclo?', text: 'Un mesociclo organiza rutinas y descansos durante varias semanas. La rutina describe qué hacer; el mesociclo indica cuándo hacerlo; el entrenamiento registra lo que realmente hiciste. Borrador sirve para preparar el plan, Programado para dejarlo previsto y Activo para iniciar sesiones disponibles. Un día sin asignar no es un descanso. El plan conserva copias de las rutinas: editar la biblioteca no actualiza automáticamente esas copias. Guardar un plan no registra entrenamientos.' },
} as const;
export type TrainingHelpTopic = keyof typeof trainingHelp;

/** Inline expansion keeps form fields, navigation and workout timers intact. */
export function TrainingHelp({ topic }: { topic: TrainingHelpTopic }) {
  const { theme } = useTheme();
  const guide = useFunctionalGuidance();
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<View>(null);
  const close = () => {
    setExpanded(false);
    if (!trigger.current) return;
    if (Platform.OS === 'web') trigger.current.focus();
    else AccessibilityInfo.sendAccessibilityEvent(trigger.current, 'focus');
  };
  const content = trainingHelp[topic];
  return <View style={{ gap: 8 }}>
    <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={content.title} accessibilityState={{ expanded }}
      onPress={() => setExpanded(value => !value)} style={{ minHeight: 48, justifyContent: 'center', paddingVertical: 10 }}>
      <Text style={{ color: theme.text, fontWeight: '700' }}>{content.title} · {expanded ? 'Ocultar ayuda' : 'Ayuda'}</Text>
    </Pressable>
    {expanded && <>
      <Text style={{ color: theme.text, lineHeight: 23 }}>{content.text}</Text>
      {topic === 'mesocycles' && <GlassButton title={guide.preferences.mesocycleTopicAcknowledged ? 'Entendido · cerrar' : 'Entendido'} variant="secondary" onPress={() => { guide.acknowledgeMesocycles(); close(); }} />}
    </>}
  </View>;
}
