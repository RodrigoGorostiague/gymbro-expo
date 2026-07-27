import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { Mesocycle, MesocycleEntry, Routine } from '../../types';
import {
  buildMesocycleDraft,
  clonePlannedWeekEntries,
  deriveMesocycleAdherence,
  deriveMesocycleScheduleProjection,
  MesocycleScheduleProjectionEntry,
} from '../../utils/mesocycles';
import { generateId } from '../../utils/storage';

const routineRef = (routine: Routine) => ({
  routineId: routine.id,
  routineName: routine.name,
  source: routine.isShared ? 'shared' as const : 'local' as const,
  shareId: routine.shareId,
});
const isRest = (entry: MesocycleEntry): entry is Extract<MesocycleEntry, { kind: 'rest' }> => 'kind' in entry && entry.kind === 'rest';

export default function MesocycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getMesocycle, routines, attempts, updateMesocycle } = useData();
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
      : { ...week, entries: [...week.entries, { id: generateId(), ref: routineRef(routine), order: week.entries.length + 1 }] }),
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
  const copyPrevious = (weekNumber: number) => change((value) => ({
    ...value,
    weeks: value.weeks.map((week) => week.weekNumber === weekNumber
      ? { ...week, entries: clonePlannedWeekEntries(value.weeks.find((candidate) => candidate.weekNumber === weekNumber - 1)?.entries ?? []) }
      : week),
  }));

  const schedule = deriveMesocycleScheduleProjection({ ...draft, startDate: startDate || undefined }, routines, attempts);
  const scheduleByEntry = new Map(schedule.map((entry) => [entry.entryId, entry]));
  const adherence = deriveMesocycleAdherence(draft, attempts);

  return <ThemeBackground><SafeAreaView style={styles.safe}><AppNavBar onBack={() => router.back()} /><ScrollView contentContainerStyle={styles.scroll}>
    <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text>
    <GlassInput value={draft.name} onChangeText={(name) => change((value) => ({ ...value, name }))} />
    <DateTimeField value={startDate} onChange={setStartDate} mode="date" testID="mesocycle-edit-start-date-picker" />
    {draft.weeks.map((week) => <WeekCard
      key={week.id}
      week={week}
      progress={adherence.weeks.find((item) => item.weekNumber === week.weekNumber)!}
      scheduleByEntry={scheduleByEntry}
      theme={theme}
      open={openWeek === week.weekNumber}
      routines={available}
      onOpen={() => setOpenWeek((current) => current === week.weekNumber ? null : week.weekNumber)}
      onAddRoutine={addRoutine}
      onAddRest={addRest}
      onRemove={(entryId) => removeEntry(week.weekNumber, entryId)}
      onCopy={() => copyPrevious(week.weekNumber)}
    />)}
    <GlassButton title="Guardar planificación" onPress={() => updateMesocycle({ ...draft, startDate: startDate || undefined }).then(() => Alert.alert('Mesociclo actualizado', 'La planificación semanal quedó guardada.'))} />
  </ScrollView></SafeAreaView></ThemeBackground>;
}

function WeekCard({ week, progress, scheduleByEntry, theme, open, routines, onOpen, onAddRoutine, onAddRest, onRemove, onCopy }: {
  week: Mesocycle['weeks'][number];
  progress: ReturnType<typeof deriveMesocycleAdherence>['weeks'][number];
  scheduleByEntry: Map<string, MesocycleScheduleProjectionEntry>;
  theme: { text: string; textMuted: string; primary: string; glassBorder: string };
  open: boolean;
  routines: Routine[];
  onOpen: () => void;
  onAddRoutine: (weekNumber: number, routine: Routine) => void;
  onAddRest: (weekNumber: number) => void;
  onRemove: (entryId: string) => void;
  onCopy: () => void;
}) {
  return <GlassCard style={styles.card}>
    <Text style={[styles.heading, { color: theme.text }]}>Semana {week.weekNumber}</Text>
    <Text style={{ color: theme.textMuted }}>Progreso: {progress.completedSessions}/{progress.plannedSessions} sesiones completadas</Text>
    {week.entries.map((entry, index) => {
      const projection = scheduleByEntry.get(entry.id);
      const date = projection?.dateLabel;
      const unavailable = projection?.kind === 'routine' && !projection.routine.available;
      return <View key={entry.id} style={[styles.entry, { borderColor: theme.glassBorder }]}>
        <View style={styles.entryContent}>
          {date ? <Text style={[styles.dateLabel, { color: theme.primary }]}>{date.weekday} · {date.date}</Text> : null}
          <Text style={{ color: theme.text }}>{isRest(entry) ? `${index + 1}. Descanso` : `${index + 1}. ${entry.ref.routineName}`}</Text>
          {isRest(entry) ? <Text style={{ color: theme.textMuted }}>Recuperación programada</Text> : unavailable ? <Text style={{ color: '#F5B041' }}>Rutina no disponible</Text> : <Text style={{ color: theme.textMuted }}>{projection?.kind === 'routine' ? `${projection.routine.muscleGroups.join(' · ')} · ${projection.routine.exerciseCount} ejercicios` : null}</Text>}
        </View>
        <HapticPressable style={styles.removeAction} accessibilityRole="button" accessibilityLabel={`Quitar ${isRest(entry) ? 'día de descanso' : entry.ref.routineName} del plan`} accessibilityHint="Elimina esta entrada sin cambiar el orden de las demás." onPress={() => onRemove(entry.id)}><Ionicons name="trash-outline" size={18} color={theme.textMuted} /></HapticPressable>
      </View>;
    })}
    <View style={styles.actions}><GlassButton title="Agregar descanso" variant="secondary" disabled={week.entries.length >= 7} onPress={() => onAddRest(week.weekNumber)} /><GlassButton title={open ? 'Cerrar rutinas' : 'Agregar rutina'} variant="secondary" disabled={week.entries.length >= 7} onPress={onOpen} /></View>
    {open ? routines.map((routine) => <HapticPressable key={routine.id} onPress={() => onAddRoutine(week.weekNumber, routine)}><Text style={{ color: theme.primary }}>{routine.name}</Text></HapticPressable>) : null}
    {week.weekNumber > 1 ? <GlassButton title="Copiar semana anterior" variant="secondary" onPress={onCopy} /> : null}
  </GlassCard>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 }, scroll: { paddingBottom: 40 }, title: { fontSize: 26, fontWeight: '900', marginBottom: 8 }, card: { marginBottom: 14 }, heading: { fontSize: 18, fontWeight: '800' }, entry: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, flexDirection: 'row', gap: 10 }, entryContent: { flex: 1, gap: 3 }, dateLabel: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' }, removeAction: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }, actions: { gap: 8, marginTop: 12 },
});
