import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Exercise, Mesocycle, Routine, WorkoutAttempt, WorkoutRecapExercise, WorkoutSession } from '../types';
import { useData } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { projectAttemptsBody, projectExerciseBody, projectMesocycleBody, projectRecapBody, projectRoutineBody, projectSessionBody, projectSharedBody } from '../utils/bodyMapProjection';
import { MuscleBodyMap } from './MuscleBodyMap';
import { HapticPressable } from './HapticPressable';

export function ExerciseBodyMap({ exercise }: { exercise: Exercise }) {
  const { catalogMuscleGroups = [] } = useData();
  const projection = useMemo(() => projectExerciseBody(exercise, catalogMuscleGroups), [exercise, catalogMuscleGroups]);
  return <MuscleBodyMap projection={projection} title="Músculos de este ejercicio" />;
}
export function RoutineBodyMap({ routine }: { routine: Pick<Routine, 'exercises'> }) {
  const { catalogMuscleGroups = [] } = useData();
  const projection = useMemo(() => projectRoutineBody(routine, catalogMuscleGroups), [routine, catalogMuscleGroups]);
  return <MuscleBodyMap projection={projection} title="Trabajo muscular planificado" />;
}
export function RecapBodyMap({ exercises }: { exercises: readonly WorkoutRecapExercise[] }) {
  const { catalogMuscleGroups = [] } = useData();
  const projection = useMemo(() => projectRecapBody(exercises, catalogMuscleGroups), [exercises, catalogMuscleGroups]);
  return <MuscleBodyMap projection={projection} title="Mapa de la sesión compartida" />;
}
export function SessionBodyMap({ session, owner, compact = false }: { session: WorkoutSession; owner?: string | null; compact?: boolean }) {
  const { catalogMuscleGroups = [], attempts = [] } = useData();
  const attempt = attempts.find((item) => item.id === session.id && item.owner === owner);
  const projection = useMemo(() => attempt && owner
    ? projectAttemptsBody([attempt], catalogMuscleGroups, { owner })
    : projectSessionBody(session, catalogMuscleGroups), [attempt, session, catalogMuscleGroups, owner]);
  return <MuscleBodyMap projection={projection} title="Tu trabajo muscular" compact={compact} />;
}
export function SharedBodyMap({ distribution, muscleGroupIds = [], period, profile = false, compact = true, palette }: {
  distribution?: readonly { id: string; value: number }[]; muscleGroupIds?: readonly string[]; period?: string; profile?: boolean; compact?: boolean; palette?: Partial<import('./MuscleBodyMap').BodyMapPalette>;
}) {
  // This adapter intentionally has no access to private exercises, attempts or sessions.
  const values = distribution?.length ? distribution : muscleGroupIds.map((id) => ({ id, value: 1 }));
  const projection = useMemo(() => projectSharedBody(values, [], profile ? 'Contribuciones por ejercicio' : distribution?.length ? 'Ejercicios del resumen' : 'Grupos compartidos', period), [values, distribution, period, profile]);
  return <MuscleBodyMap projection={projection} title={profile ? 'Mapa muscular compartido' : 'Foco muscular compartido'} compact={compact} palette={palette} />;
}
function Option({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  return <HapticPressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: selected ? theme.primary : theme.glassBorder }}><Text style={{ color: selected ? theme.primary : theme.textMuted }}>{label}</Text></HapticPressable>;
}
export function MesocycleBodyMap({ mesocycle, routines, attempts = [], owner }: { mesocycle: Mesocycle; routines: readonly Routine[]; attempts?: readonly WorkoutAttempt[]; owner?: string | null }) {
  const { catalogMuscleGroups = [] } = useData();
  const [week, setWeek] = useState<number | undefined>();
  const [performed, setPerformed] = useState(false);
  const selectedWeek = mesocycle.weeks.some((item) => item.weekNumber === week) ? week : undefined;
  const planned = useMemo(() => projectMesocycleBody(mesocycle, routines, catalogMuscleGroups, selectedWeek), [mesocycle, routines, catalogMuscleGroups, selectedWeek]);
  const completed = useMemo(() => projectAttemptsBody(attempts, catalogMuscleGroups, { owner: owner ?? '', mesocycleId: mesocycle.id, weekNumber: selectedWeek }), [attempts, catalogMuscleGroups, owner, mesocycle.id, selectedWeek]);
  const completedWithPeriod = useMemo(() => ({ ...completed, period: planned.period }), [completed, planned.period]);
  const max = Math.max(1, ...planned.entries.map((entry) => entry.value), ...completed.entries.map((entry) => entry.value));
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Option label="Todo el bloque" selected={selectedWeek === undefined} onPress={() => setWeek(undefined)} />{mesocycle.weeks.map((item) => <Option key={item.id} label={`Semana ${item.weekNumber}`} selected={selectedWeek === item.weekNumber} onPress={() => setWeek(item.weekNumber)} />)}</View>
    {owner && <View style={{ flexDirection: 'row', gap: 8 }}><Option label="Planificado" selected={!performed} onPress={() => setPerformed(false)} /><Option label="Realizado" selected={performed} onPress={() => setPerformed(true)} /></View>}
    <MuscleBodyMap projection={performed && owner ? completedWithPeriod : planned} title={performed && owner ? 'Trabajo muscular realizado' : 'Trabajo muscular del mesociclo'} scaleMax={max} />
  </View>;
}
