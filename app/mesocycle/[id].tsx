import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { Mesocycle, MesocycleEntry, MesocycleStatus, Routine } from '../../types';
import {
  buildMesocycleDraft,
  clonePlannedWeekEntries,
  deriveMesocycleAdherence,
  mesocycleCompletionBlockReason,
  deriveFirstEntryStartDate,
  deriveMesocycleScheduleProjection,
  MesocycleScheduleProjectionEntry,
  snapshotPlannedRoutine,
} from '../../utils/mesocycles';
import { generateId } from '../../utils/storage';
import { muscleGroupLabels } from '../../utils/catalogMuscleGroups';
import { deriveMesocycleDateRange, findOverlappingMesocycle } from '../../utils/mesocycleAnalytics';
import { hasPlannedSessionAttempt, reorderWeekEntries } from '../../utils/mesocycleSchedule';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';

const routineRef = (routine: Routine) => ({
  routineId: routine.id,
  routineName: routine.name,
  source: routine.isShared ? 'shared' as const : 'local' as const,
  shareId: routine.shareId,
});
const isRest = (entry: MesocycleEntry): entry is Extract<MesocycleEntry, { kind: 'rest' }> => 'kind' in entry && entry.kind === 'rest';
const STATUS_OPTIONS: { value: MesocycleStatus; label: string; guidance: string }[] = [
  { value: 'draft', label: 'Borrador', guidance: 'Las sesiones planificadas todavía no se pueden ejecutar.' },
  { value: 'active', label: 'Activo', guidance: 'Habilita las sesiones vinculadas y las recompensas.' },
  { value: 'completed', label: 'Completado', guidance: 'Se conserva el historial, pero no se pueden iniciar sesiones planificadas.' },
  { value: 'archived', label: 'Archivado', guidance: 'Se conserva el historial, pero no se pueden iniciar sesiones planificadas.' },
];

export default function MesocycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMesocycle, mesocycles, routines, attempts, updateMesocycle, catalogMuscleGroups = [] } = useData();
  const { theme } = useTheme();
  const mesocycle = getMesocycle(id);
  const [draft, setDraft] = useState<Mesocycle | null>(mesocycle ? buildMesocycleDraft(mesocycle) : null);
  const [openWeek, setOpenWeek] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(mesocycle?.startDate ?? '');

  useEffect(() => setDraft(mesocycle ? buildMesocycleDraft(mesocycle) : null), [mesocycle]);

  const available = useMemo(() => [...routines].sort((a, b) => a.name.localeCompare(b.name)), [routines]);

  if (!draft) {
    return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><GlassCard><Text style={{ color: theme.text }}>No encontramos este mesociclo</Text><GlassButton title="Volver a mesociclos" onPress={() => router.replace('/(tabs)/mesocycles')} /></GlassCard></SafeAreaView></ThemeBackground>;
  }

  const change = (updater: (value: Mesocycle) => Mesocycle) => setDraft((value) => value ? updater(value) : value);
  const addRoutine = (weekNumber: number, routine: Routine) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber !== weekNumber || week.entries.length >= 7
      ? week
      : { ...week, entries: [...week.entries, { id: generateId(), ref: routineRef(routine), routineSnapshot: snapshotPlannedRoutine(routine), order: week.entries.length + 1 }] }),
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
      ? { ...week, entries: clonePlannedWeekEntries(value.weeks.find((candidate) => candidate.weekNumber === weekNumber - 1)?.entries ?? []) }
      : week),
  }));

  const derivedStartDate = deriveFirstEntryStartDate([...draft.weeks].sort((a, b) => a.weekNumber - b.weekNumber).flatMap((week) => week.entries));
  const effectiveStartDate = startDate || derivedStartDate;
  const schedule = deriveMesocycleScheduleProjection({ ...draft, startDate: effectiveStartDate }, routines, attempts);
  const scheduleByEntry = new Map(schedule.map((entry) => [entry.entryId, entry]));
  const adherence = deriveMesocycleAdherence(draft, attempts);
  const completionBlockReason = mesocycleCompletionBlockReason(draft, attempts);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} trailing={<HapticPressable accessibilityLabel={`Compartir ${draft.name}`} onPress={() => router.push({ pathname: '/community/share-plan', params: { kind: 'mesocycle', id: draft.id, name: draft.name } })}><Text style={{ color: theme.primary, fontWeight: '800' }}>Compartir</Text></HapticPressable>} /><ScrollView contentContainerStyle={styles.scroll}>
    <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text>
    <GlassInput value={draft.name} onChangeText={(name) => change((value) => ({ ...value, name }))} />
    <DateTimeField value={derivedStartDate ?? startDate} onChange={setStartDate} mode="date" testID="mesocycle-edit-start-date-picker" />
    <GlassCard style={styles.card}>
      <Text style={[styles.heading, { color: theme.text }]}>Estado del ciclo</Text>
      <View style={styles.statusOptions}>
         {STATUS_OPTIONS.filter((option) => option.value !== 'completed' || draft.status === 'completed' || !completionBlockReason).map((option) => {
          const selected = option.value === draft.status;
          return <HapticPressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={`Estado: ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => change((value) => ({ ...value, status: option.value }))}
            style={[styles.optionChip, { borderColor: theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}
          ><Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>{option.label}</Text></HapticPressable>;
        })}
       </View>
       <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>{STATUS_OPTIONS.find((option) => option.value === draft.status)!.guidance}</Text>
       {draft.status === 'completed' ? <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>La recompensa de XP se acreditó una única vez. Los cambios posteriores no generan una nueva recompensa.</Text> : completionBlockReason ? <Text style={[styles.statusGuidance, { color: theme.textMuted }]}>{completionBlockReason}</Text> : null}
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
      onOpen={() => setOpenWeek((current) => current === week.weekNumber ? null : week.weekNumber)}
      onAddRoutine={addRoutine}
      onAddRest={addRest}
      onRemove={(entryId) => removeEntry(week.weekNumber, entryId)}
      onMove={(from, to) => moveEntry(week.weekNumber, from, to)}
      lockedEntryIds={new Set(week.entries.filter((entry) => !isRest(entry) && hasPlannedSessionAttempt(attempts, draft.id, week.weekNumber, entry.id)).map((entry) => entry.id))}
       onCopy={() => copyPrevious(week.weekNumber)}
    />)}
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
      void updateMesocycle(candidate).then(() => Alert.alert('Mesociclo actualizado', 'La planificación semanal quedó guardada.'));
    }} />
  </ScrollView></SafeAreaView></ThemeBackground>;
}

function WeekCard({ week, progress, scheduleByEntry, theme, open, routines, catalogMuscleGroups, onOpen, onAddRoutine, onAddRest, onRemove, onMove, lockedEntryIds, onCopy }: {
  week: Mesocycle['weeks'][number];
  progress: ReturnType<typeof deriveMesocycleAdherence>['weeks'][number];
  scheduleByEntry: Map<string, MesocycleScheduleProjectionEntry>;
  theme: { text: string; textMuted: string; primary: string; onPrimary: string; glassBorder: string; glass: string };
  open: boolean;
  routines: Routine[];
  onOpen: () => void;
  onAddRoutine: (weekNumber: number, routine: Routine) => void;
  catalogMuscleGroups: { id: string; displayName: string; type: string; visibleInFilters: boolean }[];
  onAddRest: (weekNumber: number) => void;
  onRemove: (entryId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  lockedEntryIds: ReadonlySet<string>;
  onCopy: () => void;
}) {
  const [routineQuery, setRoutineQuery] = useState('');
  const visibleRoutines = routines.filter((routine) => routine.name.toLocaleLowerCase('es').includes(routineQuery.trim().toLocaleLowerCase('es')));
  return <GlassCard style={styles.card}>
    <Text style={[styles.heading, { color: theme.text }]}>Semana {week.weekNumber}</Text>
    <Text style={{ color: theme.textMuted }}>Progreso: {progress.completedSessions}/{progress.plannedSessions} sesiones completadas</Text>
    <DraggableFlatList data={week.entries} keyExtractor={(entry) => entry.id} activationDistance={8} scrollEnabled={false} dragItemOverflow={false} onDragBegin={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} onDragEnd={({ from, to }) => { if (from !== to) onMove(from, to); }} renderPlaceholder={({ item: entry }) => <View pointerEvents="none" accessible accessibilityLabel={`Posición temporal de ${isRest(entry) ? 'día de descanso' : entry.ref.routineName}`} style={[styles.placeholder, { borderColor: theme.glassBorder, backgroundColor: theme.glass }]}><View style={[styles.placeholderDate, { backgroundColor: theme.primary }]} /><View style={[styles.placeholderTitle, { backgroundColor: theme.glassBorder }]} /><View style={[styles.placeholderMetadata, { backgroundColor: theme.glassBorder }]} /></View>} renderItem={({ item: entry, drag, isActive }) => <ScaleDecorator><View style={isActive ? styles.dragging : undefined}>{(() => { const index = week.entries.findIndex((candidate) => candidate.id === entry.id);
      const projection = scheduleByEntry.get(entry.id);
      const date = projection?.dateLabel;
      const unavailable = projection?.kind === 'routine' && !projection.routine.available;
      const locked = lockedEntryIds.has(entry.id);
      return <View style={[styles.entry, { borderColor: theme.glassBorder }]}>
        <View style={styles.entryContent}>
          {date ? <Text style={[styles.dateLabel, { color: theme.primary }]}>{date.weekday} · {date.date}</Text> : null}
          <Text style={{ color: theme.text }}>{isRest(entry) ? `${index + 1}. Descanso` : `${index + 1}. ${entry.ref.routineName}`}</Text>
          {isRest(entry) ? <Text style={{ color: theme.textMuted }}>Recuperación programada</Text> : unavailable ? <Text style={{ color: '#F5B041' }}>Rutina no disponible</Text> : <Text style={{ color: theme.textMuted }}>{projection?.kind === 'routine' ? `${muscleGroupLabels(catalogMuscleGroups, projection.routine.muscleGroups).join(' · ')} · ${projection.routine.exerciseCount} ejercicios` : null}</Text>}
        </View>
        <View><HapticPressable disabled={locked} style={styles.removeAction} accessibilityRole="button" accessibilityLabel={`Quitar ${isRest(entry) ? 'día de descanso' : entry.ref.routineName} del plan`} accessibilityHint={locked ? 'Esta sesión tiene intentos y conserva su historial.' : 'Elimina esta entrada sin cambiar el orden de las demás.'} onPress={() => onRemove(entry.id)}><Ionicons name="trash-outline" size={18} color={theme.textMuted} /></HapticPressable><Text accessibilityRole="adjustable" accessibilityLabel={`Reordenar ${isRest(entry) ? 'día de descanso' : entry.ref.routineName}`} onLongPress={locked ? undefined : drag} style={[styles.dragHandle, { color: theme.textMuted }, locked && styles.dragDisabled]}>☰</Text></View>
      </View>;
    })()}</View></ScaleDecorator>} />
    <View style={styles.actions}><GlassButton title="Agregar descanso" variant="secondary" disabled={week.entries.length >= 7} onPress={() => onAddRest(week.weekNumber)} /><GlassButton title={open ? 'Cerrar rutinas' : 'Agregar rutina'} variant="secondary" disabled={week.entries.length >= 7} onPress={onOpen} /></View>
    {open ? <View style={styles.routinePicker}>
      <Text style={[styles.pickerTitle, { color: theme.text }]}>Elegí una rutina</Text>
      <TextInput value={routineQuery} onChangeText={setRoutineQuery} placeholder="Buscar rutina" placeholderTextColor={theme.textMuted} style={[styles.search, { color: theme.text, borderColor: theme.glassBorder }]} />
      {visibleRoutines.length === 0 ? <Text style={{ color: theme.textMuted }}>No hay rutinas que coincidan.</Text> : visibleRoutines.map((routine) => {
      const scheduledCount = week.entries.filter((entry) => !isRest(entry) && entry.ref.routineId === routine.id).length;
      const selected = scheduledCount > 0;
      const labels = muscleGroupLabels(catalogMuscleGroups, routine.muscleGroups);
      return <HapticPressable key={routine.id} accessibilityRole="button" accessibilityLabel={selected ? `Agregar otra sesión de ${routine.name}` : `Programar ${routine.name}`} accessibilityState={{ selected }} onPress={() => onAddRoutine(week.weekNumber, routine)} style={[styles.option, { borderColor: selected ? theme.primary : theme.glassBorder, backgroundColor: selected ? theme.primary : theme.glass }]}><View style={{ flex: 1 }}><Text style={[styles.optionTitle, { color: selected ? theme.onPrimary : theme.text }]}>{routine.name}</Text><Text style={[styles.optionMeta, { color: selected ? theme.onPrimary : theme.textMuted }]}>{labels.join(' · ') || 'Sin grupos'} · {routine.exercises.length} ejercicios</Text></View>{selected ? <View style={[styles.occurrenceBadge, { backgroundColor: theme.onPrimary }]}><Text style={[styles.occurrenceText, { color: theme.primary }]}>{scheduledCount}</Text></View> : null}<Ionicons name="add-circle-outline" size={22} color={selected ? theme.onPrimary : theme.primary} /></HapticPressable>;
    })}</View> : null}
    {week.weekNumber > 1 ? <GlassButton title="Copiar semana anterior" variant="secondary" onPress={onCopy} /> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
   safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { paddingBottom: 40 }, title: { fontSize: 26, fontWeight: '900', marginBottom: 8 }, card: { marginBottom: 14 }, heading: { fontSize: 18, fontWeight: '800' }, statusOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }, optionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 }, statusGuidance: { fontSize: 13, lineHeight: 18, marginTop: 10 }, entry: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', gap: 10 }, entryContent: { flex: 1, gap: 3 }, dateLabel: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, locked: { fontSize: 11, marginLeft: 2 }, removeAction: { width: 36, height: 28, alignItems: 'center', justifyContent: 'center' }, dragHandle: { fontSize: 20, minHeight: 30, paddingHorizontal: 8, textAlign: 'center' }, dragDisabled: { opacity: 0.35 }, placeholder: { borderStyle: 'dashed', borderWidth: 1, borderRadius: 10, gap: 7, marginTop: 10, padding: 12 }, placeholderDate: { borderRadius: 4, height: 10, opacity: 0.45, width: '28%' }, placeholderTitle: { borderRadius: 5, height: 16, opacity: 0.55, width: '62%' }, placeholderMetadata: { borderRadius: 4, height: 12, opacity: 0.35, width: '48%' }, dragging: { opacity: 0.94 }, actions: { gap: 8, marginTop: 12 }, routinePicker: { gap: 8, marginTop: 14 }, pickerTitle: { fontSize: 15, fontWeight: '800' }, search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 }, option: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, optionTitle: { fontSize: 15, fontWeight: '800' }, optionMeta: { fontSize: 12, marginTop: 3 }, occurrenceBadge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }, occurrenceText: { fontSize: 12, fontWeight: '900' },
});
