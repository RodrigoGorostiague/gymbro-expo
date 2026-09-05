import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { DateTimeField } from '../../components/DateTimeField';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { Mesocycle, MesocycleEntry, PlannedSessionPlanningState, Routine } from '../../types';
import {
  activateMesocycle,
  addExtraordinaryPlannedSession,
  buildMesocycleDraft,
  cancelMesocycle,
  clonePlannedWeekEntries,
  completeMesocycle,
  deriveMesocycleAdherence,
  mesocycleCompletionBlockReason,
  deriveFirstEntryStartDate,
  deriveMesocycleScheduleProjection,
  eligiblePlannedSessionDestinations,
  eligibleRecoveryDestinations,
  extendMesocycle,
  MesocycleScheduleProjectionEntry,
  movePlannedSession,
  pauseMesocycle,
  RecoveryDestination,
  reschedulePlannedSessionWithRecovery,
  resumeMesocycle,
  scheduleMesocycle,
  snapshotPlannedRoutine,
  transitionPlannedSession,
} from '../../utils/mesocycles';
import { generateId } from '../../utils/storage';
import { muscleGroupLabels } from '../../utils/catalogMuscleGroups';
import { deriveMesocycleDateRange, findOverlappingMesocycle } from '../../utils/mesocycleAnalytics';
import { hasPlannedSessionAttempt, reorderWeekEntries } from '../../utils/mesocycleSchedule';
import { NestableDraggableFlatList, NestableScrollContainer, ScaleDecorator } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';

const routineRef = (routine: Routine) => ({
  routineId: routine.id,
  routineName: routine.name,
  source: routine.isShared ? 'shared' as const : 'local' as const,
  shareId: routine.shareId,
});
const isRest = (entry: MesocycleEntry): entry is Extract<MesocycleEntry, { kind: 'rest' }> => 'kind' in entry && entry.kind === 'rest';
const STATUS_GUIDANCE = {
  draft: 'Las sesiones planificadas todavía no se pueden ejecutar.',
  scheduled: 'El bloque está programado y todavía no admite ejecuciones.',
  active: 'Las sesiones pendientes están habilitadas.',
  paused: 'El calendario está congelado hasta que reanudes el bloque.',
  completed: 'El bloque finalizó y conserva su historial.',
  cancelled: 'El bloque terminó anticipadamente sin recompensa de finalización.',
  archived: 'Este bloque histórico conserva el significado de archivo anterior.',
} as const;
const PLANNING_STATE_OPTIONS: { value: PlannedSessionPlanningState; label: string }[] = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'in_progress', label: 'En curso' },
  { value: 'skipped', label: 'Omitida' },
  { value: 'cancelled', label: 'Cancelada' },
];

export default function MesocycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMesocycle, mesocycles, routines, attempts, updateMesocycle, catalogMuscleGroups = [] } = useData();
  const { theme } = useTheme();
  const mesocycle = getMesocycle(id);
  const [draft, setDraft] = useState<Mesocycle | null>(mesocycle ? buildMesocycleDraft(mesocycle) : null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(mesocycle?.startDate ?? '');
  const [recoverySource, setRecoverySource] = useState<{ weekNumber: number; entryId: string } | null>(null);
  const [destinationAction, setDestinationAction] = useState<{ kind: 'move'; source: { weekNumber: number; entryId: string } } | { kind: 'extraordinary'; routine: Routine } | null>(null);
  const [extensionWeeks, setExtensionWeeks] = useState('1');

  useEffect(() => {
    setDraft(mesocycle ? buildMesocycleDraft(mesocycle) : null);
    setStartDate(mesocycle?.startDate ?? '');
  }, [mesocycle]);

  const available = useMemo(() => [...routines].sort((a, b) => a.name.localeCompare(b.name)), [routines]);

  if (!draft) {
    return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><GlassCard><Text style={{ color: theme.text }}>No encontramos este mesociclo</Text><GlassButton title="Volver a mesociclos" onPress={() => router.replace('/(tabs)/mesocycles')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  const change = (updater: (value: Mesocycle) => Mesocycle) => setDraft((value) => value ? updater(value) : value);
  const addRoutine = (weekNumber: number, routine: Routine) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber !== weekNumber || week.entries.length >= 7
      ? week
       : { ...week, entries: [...week.entries, { id: generateId(), ref: routineRef(routine), routineSnapshot: snapshotPlannedRoutine(routine), order: week.entries.length + 1, scheduleShiftDays: value.scheduleShiftDays }] }),
  }));
  const addRest = (weekNumber: number) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber !== weekNumber || week.entries.length >= 7
      ? week
      : { ...week, entries: [...week.entries, { id: generateId(), kind: 'rest' }] }),
  }));
  const removeEntry = (weekNumber: number, entryId: string) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber === weekNumber
      ? { ...week, entries: week.entries.filter((entry) => entry.id !== entryId) }
      : week),
  }));
  const moveEntry = (weekNumber: number, fromIndex: number, toIndex: number) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => {
      if (week.weekNumber !== weekNumber) return week;
      const locked = new Set(week.entries.filter((entry) => !isRest(entry) && hasPlannedSessionAttempt(attempts, value.id, weekNumber, entry.id)).map((entry) => entry.id));
      return { ...week, entries: reorderWeekEntries(week.entries, fromIndex, toIndex, locked) };
    }),
  }));
  const copyPrevious = (weekNumber: number) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber === weekNumber
      ? { ...week, entries: clonePlannedWeekEntries(value.weeks.find((candidate) => candidate.weekNumber === weekNumber - 1)?.entries ?? [], value.scheduleShiftDays) }
      : week),
  }));
  const changePlanningState = (weekNumber: number, entryId: string, state: PlannedSessionPlanningState) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber !== weekNumber ? week : {
      ...week,
      entries: week.entries.map((entry) => !isRest(entry) && entry.id === entryId
        ? transitionPlannedSession(entry, state, new Date().toISOString())
        : entry),
    }),
  }));
  const recoveryDestinations = recoverySource ? eligibleRecoveryDestinations(draft) : [];
  const createRecovery = (destination: RecoveryDestination) => {
    if (!recoverySource) return;
    try {
      change((value) => reschedulePlannedSessionWithRecovery(value, recoverySource, destination, attempts, new Date().toISOString()));
      setRecoverySource(null);
    } catch (error) {
      Alert.alert('No se puede reprogramar', error instanceof Error ? error.message : 'No encontramos un destino válido para la recuperación.');
    }
  };
  const destinations = eligiblePlannedSessionDestinations(draft);
  const applyDestination = (destination: RecoveryDestination) => {
    if (!destinationAction) return;
    try {
      change((value) => destinationAction.kind === 'move'
        ? movePlannedSession(value, destinationAction.source, destination, attempts)
        : addExtraordinaryPlannedSession(value, destinationAction.routine, destination));
      setDestinationAction(null);
    } catch (error) {
      Alert.alert('No se puede cambiar el calendario', error instanceof Error ? error.message : 'El destino ya no está disponible.');
    }
  };
  const lifecycle = (action: 'schedule' | 'activate' | 'pause' | 'resume' | 'complete' | 'cancel') => {
    const at = new Date().toISOString();
    try {
      change((value) => action === 'schedule' ? scheduleMesocycle(value)
        : action === 'activate' ? activateMesocycle(value)
          : action === 'pause' ? pauseMesocycle(value, at)
            : action === 'resume' ? resumeMesocycle(value, attempts, at)
              : action === 'complete' ? completeMesocycle(value, attempts, at)
                : cancelMesocycle(value, attempts, at));
    } catch (error) {
      Alert.alert('No se puede cambiar el estado', error instanceof Error ? error.message : 'La transición no está disponible.');
    }
  };
  const extend = () => {
    try { change((value) => extendMesocycle(value, Number(extensionWeeks))); }
    catch (error) { Alert.alert('No se puede extender', error instanceof Error ? error.message : 'Revisá la cantidad de semanas.'); }
  };

  const derivedStartDate = deriveFirstEntryStartDate([...draft.weeks].sort((a, b) => a.weekNumber - b.weekNumber).flatMap((week) => week.entries));
  const effectiveStartDate = startDate || derivedStartDate;
  const schedule = deriveMesocycleScheduleProjection({ ...draft, startDate: effectiveStartDate }, routines, attempts);
  const scheduleByEntry = new Map(schedule.map((entry) => [entry.entryId, entry]));
  const adherence = deriveMesocycleAdherence(draft, attempts);
  const completionBlockReason = mesocycleCompletionBlockReason(draft, attempts);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} trailing={<HapticPressable accessibilityLabel={`Compartir ${draft.name}`} onPress={() => router.push({ pathname: '/community/share-plan', params: { kind: 'mesocycle', id: draft.id, name: draft.name } })}><Text style={{ color: theme.primary, fontWeight: '800' }}>Compartir</Text></HapticPressable>} /><NestableScrollContainer contentContainerStyle={styles.scroll}>
    <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text>
    <GlassInput value={draft.name} onChangeText={(name) => change((value) => ({ ...value, name }))} />
    <DateTimeField value={startDate || derivedStartDate} onChange={setStartDate} mode="date" testID="mesocycle-edit-start-date-picker" />
    <GlassCard style={styles.card}>
      <Text style={[styles.heading, { color: theme.text }]}>Estado del ciclo</Text>
       <Text style={[styles.currentStatus, { color: theme.primary }]}>{draft.status.toUpperCase()}</Text>
       <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>{STATUS_GUIDANCE[draft.status]}</Text>
       <View style={styles.statusOptions}>
         {draft.status === 'draft' ? <><GlassButton title="Programar" variant="secondary" onPress={() => lifecycle('schedule')} /><GlassButton title="Activar" onPress={() => lifecycle('activate')} /></> : null}
         {draft.status === 'scheduled' ? <><GlassButton title="Activar" onPress={() => lifecycle('activate')} /><GlassButton title="Cancelar mesociclo" variant="secondary" onPress={() => lifecycle('cancel')} /></> : null}
         {draft.status === 'active' ? <><GlassButton title="Pausar mesociclo" variant="secondary" onPress={() => lifecycle('pause')} />{!completionBlockReason ? <GlassButton title="Completar mesociclo" variant="secondary" onPress={() => lifecycle('complete')} /> : null}<GlassButton title="Finalizar anticipadamente" variant="secondary" onPress={() => lifecycle('cancel')} /></> : null}
         {draft.status === 'paused' ? <><GlassButton title="Reanudar mesociclo" onPress={() => lifecycle('resume')} /><GlassButton title="Finalizar anticipadamente" variant="secondary" onPress={() => lifecycle('cancel')} /></> : null}
       </View>
       {draft.status === 'completed' ? <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>La recompensa de XP se acreditó una única vez. Los cambios posteriores no generan una nueva recompensa.</Text> : completionBlockReason ? <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>{completionBlockReason}</Text> : null}
       {!['completed', 'cancelled', 'archived'].includes(draft.status) ? <View style={styles.extension}><TextInput value={extensionWeeks} onChangeText={setExtensionWeeks} keyboardType="number-pad" style={[styles.extensionInput, { color: theme.text, borderColor: theme.glassBorder }]} /><GlassButton title="Añadir semanas" variant="secondary" onPress={extend} /></View> : null}
    </GlassCard>
    {draft.weeks.map((week) => <WeekCard
      key={week.id}
      week={week}
      progress={adherence.weeks.find((item) => item.weekNumber === week.weekNumber)!}
      scheduleByEntry={scheduleByEntry}
      theme={theme}
      open={openWeek === week.weekNumber}
      routines={available}
      catalogMuscleGroups={catalogMuscleGroups}
      editable={!['completed', 'cancelled', 'archived'].includes(draft.status)}
      onOpen={() => setOpenWeek((current) => current === week.weekNumber ? null : week.weekNumber)}
      onAddRoutine={addRoutine}
      onAddRest={addRest}
      onRemove={(entryId) => removeEntry(week.weekNumber, entryId)}
       onMove={(from, to) => moveEntry(week.weekNumber, from, to)}
       onPlanningStateChange={(entryId, state) => changePlanningState(week.weekNumber, entryId, state)}
       onRecoveryStart={(entryId) => setRecoverySource({ weekNumber: week.weekNumber, entryId })}
       onMoveAcrossWeeks={(entryId) => setDestinationAction({ kind: 'move', source: { weekNumber: week.weekNumber, entryId } })}
       onExtraordinaryStart={(routine) => setDestinationAction({ kind: 'extraordinary', routine })}
       lockedEntryIds={new Set(week.entries.filter((entry) => !isRest(entry) && (hasPlannedSessionAttempt(attempts, draft.id, week.weekNumber, entry.id) || ['skipped', 'rescheduled', 'cancelled'].includes(entry.planningState ?? 'pending') || scheduleByEntry.get(entry.id)?.scheduleState === 'past')).map((entry) => entry.id))}
        onCopy={() => copyPrevious(week.weekNumber)}
    />)}
    {recoverySource ? <GlassCard style={styles.card}>
      <Text style={[styles.heading, { color: theme.text }]}>Reprogramar sesión</Text>
      <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>Elegí un descanso o el próximo día vacío para crear una única sesión de recuperación.</Text>
      {recoveryDestinations.length === 0 ? <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>No hay días de descanso o vacíos dentro de este mesociclo.</Text> : recoveryDestinations.map((destination) => {
        const date = destination.entryId ? scheduleByEntry.get(destination.entryId)?.dateLabel : undefined;
        const label = date ? `${date.weekday} · ${date.date}` : destination.entryId ? `Semana ${destination.weekNumber} · día de descanso` : `Semana ${destination.weekNumber} · próximo día vacío`;
        return <GlassButton key={`${destination.weekNumber}:${destination.entryId ?? 'empty'}`} title={label} variant="secondary" onPress={() => createRecovery(destination)} />;
      })}
      <GlassButton title="Cancelar" variant="secondary" onPress={() => setRecoverySource(null)} />
    </GlassCard> : null}
    {destinationAction ? <GlassCard style={styles.card}><Text style={[styles.heading, { color: theme.text }]}>{destinationAction.kind === 'move' ? 'Mover sesión' : 'Añadir sesión extraordinaria'}</Text><Text style={[styles.statusGuidance, { color: theme.textMuted }]}>Elegí un descanso o un próximo día vacío dentro del bloque.</Text>{destinations.map((destination) => <GlassButton key={`${destination.weekNumber}:${destination.entryId ?? 'empty'}`} title={`Semana ${destination.weekNumber} · ${destination.entryId ? 'descanso' : 'próximo día vacío'}`} variant="secondary" onPress={() => applyDestination(destination)} />)}<GlassButton title="Cancelar" variant="secondary" onPress={() => setDestinationAction(null)} /></GlassCard> : null}
    <GlassButton title="Guardar planificación" onPress={() => {
      const candidate = { ...draft, startDate: effectiveStartDate };
      const conflict = findOverlappingMesocycle(candidate, mesocycles ?? []);
      if (conflict) {
        const range = deriveMesocycleDateRange(conflict);
        Alert.alert(
          'Fechas en conflicto',
          `"${conflict.name}" ocupa ${range ? `${range.startDate} a ${range.endDate}` : 'un intervalo sin fecha válida'}. Elegí un inicio posterior o cambiá su estado.`,
        );
        return;
      }
      void updateMesocycle(candidate)
        .then(() => Alert.alert('Mesociclo actualizado', 'La planificación semanal quedó guardada.'))
        .catch((error) => Alert.alert('No se pudo guardar', error instanceof Error ? error.message : 'Revisá tu conexión e intentá nuevamente.'));
    }} />
  </NestableScrollContainer></SafeAreaView></ThemeBackground>;
}

function WeekCard({ week, progress, scheduleByEntry, theme, open, routines, catalogMuscleGroups, editable, onOpen, onAddRoutine, onAddRest, onRemove, onMove, onPlanningStateChange, onRecoveryStart, onMoveAcrossWeeks, onExtraordinaryStart, lockedEntryIds, onCopy }: {
  week: Mesocycle['weeks'][number];
  progress: ReturnType<typeof deriveMesocycleAdherence>['weeks'][number];
  scheduleByEntry: Map<string, MesocycleScheduleProjectionEntry>;
  theme: { text: string; textMuted: string; primary: string; onPrimary: string; glassBorder: string; glass: string };
  open: boolean;
  routines: Routine[];
  onOpen: () => void;
  onAddRoutine: (weekNumber: number, routine: Routine) => void;
  catalogMuscleGroups: { id: string; displayName: string; type: string; visibleInFilters: boolean }[];
  editable: boolean;
  onAddRest: (weekNumber: number) => void;
  onRemove: (entryId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onPlanningStateChange: (entryId: string, state: PlannedSessionPlanningState) => void;
  onRecoveryStart: (entryId: string) => void;
  onMoveAcrossWeeks: (entryId: string) => void;
  onExtraordinaryStart: (routine: Routine) => void;
  lockedEntryIds: ReadonlySet<string>;
  onCopy: () => void;
}) {
  const [routineQuery, setRoutineQuery] = useState('');
  const visibleRoutines = routines.filter((routine) => routine.name.toLocaleLowerCase('es').includes(routineQuery.trim().toLocaleLowerCase('es')));
  return <GlassCard style={styles.card}>
    <Text style={[styles.heading, { color: theme.text }]}>Semana {week.weekNumber}</Text>
    <Text style={{ color: theme.textMuted }}>Progreso: {progress.completedSessions}/{progress.plannedSessions} sesiones completadas</Text>
    <NestableDraggableFlatList data={week.entries} keyExtractor={(entry) => entry.id} activationDistance={8} scrollEnabled={false} dragItemOverflow={false} onDragBegin={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} onDragEnd={({ from, to }) => { if (from !== to) onMove(from, to); }} renderPlaceholder={({ item: entry }) => <View pointerEvents="none" accessible accessibilityLabel={`Posición temporal de ${isRest(entry) ? 'día de descanso' : entry.ref.routineName}`} style={[styles.placeholder, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}><View style={[styles.placeholderDate, { backgroundColor: theme.primary }]} /><View style={[styles.placeholderTitle, { backgroundColor: theme.glassBorder }]} /><View style={[styles.placeholderMetadata, { backgroundColor: theme.glassBorder }]} /></View>} renderItem={({ item: entry, drag, isActive }) => <ScaleDecorator><View style={isActive ? styles.dragging : undefined}>{(() => { const index = week.entries.findIndex((candidate) => candidate.id === entry.id);
      const projection = scheduleByEntry.get(entry.id);
      const date = projection?.dateLabel;
      const unavailable = projection?.kind === 'routine' && !projection.routine.available;
      const locked = lockedEntryIds.has(entry.id);
      return <View style={[styles.entry, { borderColor: theme.glassBorder }]}>
        <View style={styles.entryContent}>
          {date ? <Text style={[styles.dateLabel, { color: theme.primary }]}>{date.weekday} · {date.date}</Text> : null}
          <Text style={{ color: theme.text }}>{isRest(entry) ? `${index + 1}. Descanso` : `${index + 1}. ${entry.ref.routineName}`}</Text>
          {isRest(entry) ? <Text style={{ color: theme.textMuted }}>Recuperación programada</Text> : unavailable ? <Text style={{ color: '#F5B041' }}>Rutina no disponible</Text> : <Text style={{ color: theme.textMuted }}>{projection?.kind === 'routine' ? `${muscleGroupLabels(catalogMuscleGroups, projection.routine.muscleGroups).join(' · ')} · ${projection.routine.exerciseCount} ejercicios` : null}</Text>}
          {!isRest(entry) && projection?.kind === 'routine' ? <><View style={styles.planningStates}>{PLANNING_STATE_OPTIONS.map((option) => {
            const selected = projection.planningState === option.value;
             return <HapticPressable key={option.value} disabled={!editable || locked} accessibilityRole="button" accessibilityLabel={`Marcar ${entry.ref.routineName} como ${option.label}`} accessibilityState={{ selected, disabled: !editable || locked }} onPress={() => onPlanningStateChange(entry.id, option.value)} style={[styles.planningState, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : 'transparent' }]}><Text style={{ color: selected ? theme.onPrimary : theme.textMuted }}>{option.label}</Text></HapticPressable>;
           })}</View>{projection.planningState === 'pending' && !projection.recoveredByPlannedSessionId && !locked ? <><HapticPressable accessibilityRole="button" accessibilityLabel={`Reprogramar ${entry.ref.routineName}`} onPress={() => onRecoveryStart(entry.id)} style={[styles.planningState, { borderColor: theme.primary }]}><Text style={{ color: theme.primary, fontWeight: '700' }}>Reprogramar con recuperación</Text></HapticPressable><HapticPressable accessibilityRole="button" accessibilityLabel={`Mover ${entry.ref.routineName}`} onPress={() => onMoveAcrossWeeks(entry.id)} style={[styles.planningState, { borderColor: theme.primary }]}><Text style={{ color: theme.primary, fontWeight: '700' }}>Mover a otro día</Text></HapticPressable></> : null}{projection.isExtraordinary ? <Text style={{ color: theme.textMuted }}>Sesión extraordinaria</Text> : null}</> : null}
        </View>
         <View><HapticPressable disabled={!editable || locked} style={styles.removeAction} accessibilityRole="button" accessibilityLabel={`Quitar ${isRest(entry) ? 'día de descanso' : entry.ref.routineName} del plan`} accessibilityHint={locked ? 'Esta sesión tiene intentos o un estado histórico y conserva su posición.' : 'Elimina esta entrada sin cambiar el orden de las demás.'} onPress={() => onRemove(entry.id)}><Ionicons name="trash-outline" size={18} color={theme.textMuted} /></HapticPressable><Text accessibilityRole="adjustable" accessibilityLabel={`Reordenar ${isRest(entry) ? 'día de descanso' : entry.ref.routineName}`} onLongPress={!editable || locked ? undefined : drag} style={[styles.dragHandle, { color: theme.textMuted }, (!editable || locked) && styles.dragDisabled]}>☰</Text></View>
      </View>;
    })()}</View></ScaleDecorator>} />
    <View style={styles.actions}><GlassButton title="Agregar descanso" variant="secondary" disabled={!editable || week.entries.length >= 7} onPress={() => onAddRest(week.weekNumber)} /><GlassButton title={open ? 'Cerrar rutinas' : 'Agregar rutina'} variant="secondary" disabled={!editable || week.entries.length >= 7} onPress={onOpen} /></View>
    {open ? <View style={styles.routinePicker}>
      <Text style={[styles.pickerTitle, { color: theme.text }]}>Elegí una rutina</Text>
      <TextInput value={routineQuery} onChangeText={setRoutineQuery} placeholder="Buscar rutina" placeholderTextColor={theme.textMuted} style={[styles.search, { color: theme.text, borderColor: theme.glassBorder }]} />
      {visibleRoutines.length === 0 ? <Text style={{ color: theme.textMuted }}>No hay rutinas que coincidan.</Text> : visibleRoutines.map((routine) => {
      const scheduledCount = week.entries.filter((entry) => !isRest(entry) && entry.ref.routineId === routine.id).length;
      const selected = scheduledCount > 0;
      const labels = muscleGroupLabels(catalogMuscleGroups, routine.muscleGroups);
       return <View key={routine.id}><HapticPressable accessibilityRole="button" accessibilityLabel={selected ? `Agregar otra sesión de ${routine.name}` : `Programar ${routine.name}`} accessibilityState={{ selected }} onPress={() => onAddRoutine(week.weekNumber, routine)} style={[styles.option, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}><View style={{ flex: 1 }}><Text style={[styles.optionTitle, { color: selected ? theme.onPrimary : theme.text }]}>{routine.name}</Text><Text style={[styles.optionMeta, { color: selected ? theme.onPrimary : theme.textMuted }]}>{labels.join(' · ') || 'Sin grupos'} · {routine.exercises.length} ejercicios</Text></View>{selected ? <View style={[styles.occurrenceBadge, { backgroundColor: theme.onPrimary }]}><Text style={[styles.occurrenceText, { color: theme.primary }]}>{scheduledCount}</Text></View> : null}<Ionicons name="add-circle-outline" size={22} color={selected ? theme.onPrimary : theme.primary} /></HapticPressable><HapticPressable accessibilityRole="button" accessibilityLabel={`Añadir ${routine.name} como sesión extraordinaria`} onPress={() => onExtraordinaryStart(routine)} style={styles.extraordinaryAction}><Text style={{ color: theme.primary, fontWeight: '700' }}>Elegir día extraordinario</Text></HapticPressable></View>;
    })}</View> : null}
    {week.weekNumber > 1 ? <GlassButton title="Copiar semana anterior" variant="secondary" disabled={!editable} onPress={onCopy} /> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
   currentStatus: { fontSize: 13, fontWeight: '900', marginTop: 8 },
   extension: { flexDirection: 'row', gap: 8, marginTop: 12 },
   extensionInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, width: 64 },
   extraordinaryAction: { alignItems: 'flex-end', paddingVertical: 7 },
   safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { paddingBottom: 40 }, title: { fontSize: 26, fontWeight: '900', marginBottom: 8 }, card: { marginBottom: 14 }, heading: { fontSize: 18, fontWeight: '800' }, statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, optionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }, statusGuidance: { fontSize: 13, lineHeight: 18, marginTop: 10 }, entry: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', gap: 10 }, entryContent: { flex: 1, gap: 3 }, dateLabel: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, planningStates: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }, planningState: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }, locked: { fontSize: 11, marginLeft: 2 }, removeAction: { width: 36, height: 28, alignItems: 'center', justifyContent: 'center' }, dragHandle: { fontSize: 20, minHeight: 30, paddingHorizontal: 8, textAlign: 'center' }, dragDisabled: { opacity: 0.35 }, placeholder: { borderStyle: 'dashed', borderWidth: 1, borderRadius: 10, gap: 7, marginTop: 10, padding: 12 }, placeholderDate: { borderRadius: 4, height: 10, opacity: 0.45, width: '28%' }, placeholderTitle: { borderRadius: 5, height: 16, opacity: 0.55, width: '62%' }, placeholderMetadata: { borderRadius: 4, height: 12, opacity: 0.35, width: '48%' }, dragging: { opacity: 0.94 }, actions: { gap: 8, marginTop: 12 }, routinePicker: { gap: 8, marginTop: 14 }, pickerTitle: { fontSize: 15, fontWeight: '800' }, search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, option: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, optionTitle: { fontSize: 15, fontWeight: '800' }, optionMeta: { fontSize: 12, marginTop: 3 }, occurrenceBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, occurrenceText: { fontSize: 12, fontWeight: '900' },
});
