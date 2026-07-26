import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppNavBar } from '../../components/AppNavBar';
import { DateTimeField } from '../../components/DateTimeField';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { GlassButton, GlassInput } from '../../components/UI';
import { useData } from '../../context/DataContext';
import { useTheme } from '../../context/ThemeContext';
import { Mesocycle, MesocycleStatus, PlannedSession, PlannedSessionRef, Routine } from '../../types';
import {
  buildMesocycleDraft,
  clonePlannedWeekSessions,
  countPlannedSessions,
  sortPlannedSessions,
} from '../../utils/mesocycles';
import { generateId } from '../../utils/storage';

const STATUS_OPTIONS: { value: MesocycleStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'active', label: 'Activo' },
  { value: 'completed', label: 'Completado' },
  { value: 'archived', label: 'Archivado' },
];

const formatStartDate = (value?: string) => (value ? value : 'Sin fecha definida');

const normalizeStartDate = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('La fecha de inicio debe usar el formato YYYY-MM-DD.');
  }
  return trimmed;
};

const toPlannedSessionRef = (routine: Routine): PlannedSessionRef => ({
  routineId: routine.id,
  routineName: routine.name,
  source: routine.isShared ? 'shared' : 'local',
  shareId: routine.shareId,
});

const updateSessionCollection = (
  draft: Mesocycle,
  sessionId: string,
  updater: (session: PlannedSession, sourceWeekNumber: number) => { session: PlannedSession; targetWeekNumber: number },
): Mesocycle => {
  let extracted: PlannedSession | null = null;
  let sourceWeekNumber: number | null = null;

  const withoutSource = draft.weeks.map((week) => {
    const remaining = week.sessions.filter((session) => {
      if (session.id !== sessionId) return true;
      extracted = session;
      sourceWeekNumber = week.weekNumber;
      return false;
    });

    return { ...week, sessions: sortPlannedSessions(remaining) };
  });

  if (!extracted || !sourceWeekNumber) return draft;

  const { session: nextSession, targetWeekNumber } = updater(extracted, sourceWeekNumber);

  return {
      ...draft,
      weeks: withoutSource.map((week) => week.weekNumber === targetWeekNumber
      ? { ...week, sessions: sortPlannedSessions([...week.sessions, nextSession]) }
      : week),
  };
};

function SessionRoutinePicker({
  routines,
  onSelect,
}: {
  routines: Routine[];
  onSelect: (routine: Routine) => void;
}) {
  return (
    <View style={styles.pickerList}>
      {routines.map((routine) => (
        <HapticPressable
          key={routine.id}
          onPress={() => onSelect(routine)}
          style={styles.pickerRow}
        >
          <Text style={styles.pickerTitle}>{routine.name}</Text>
          <Text style={styles.pickerMeta}>
            {routine.isShared ? 'Rutina compartida' : 'Rutina local'} · {routine.exercises.length} ejercicio{routine.exercises.length === 1 ? '' : 's'}
          </Text>
        </HapticPressable>
      ))}
    </View>
  );
}

export default function MesocycleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    getMesocycle,
    routines,
    resolvePlannedRoutine,
    updateMesocycle,
  } = useData();
  const { theme } = useTheme();
  const mesocycle = getMesocycle(id);
  const [draft, setDraft] = useState<Mesocycle | null>(mesocycle ? buildMesocycleDraft(mesocycle) : null);
  const [startDate, setStartDate] = useState(mesocycle?.startDate ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [expandedWeekPicker, setExpandedWeekPicker] = useState<number | null>(null);
  const [expandedSessionPicker, setExpandedSessionPicker] = useState<string | null>(null);

  useEffect(() => {
    if (!mesocycle) {
      setDraft(null);
      setStartDate('');
      return;
    }

    setDraft(buildMesocycleDraft(mesocycle));
    setStartDate(mesocycle.startDate ?? '');
  }, [mesocycle]);

  const availableRoutines = useMemo(
    () => [...routines].sort((left, right) => left.name.localeCompare(right.name)),
    [routines],
  );

  const save = async () => {
    if (!draft || isSaving) return;

    if (!draft.name.trim()) {
      Alert.alert('Validación', 'El nombre no puede estar vacío.');
      return;
    }

    try {
      setIsSaving(true);
      await updateMesocycle({
        ...draft,
        name: draft.name.trim(),
        goal: draft.goal.trim(),
        startDate: normalizeStartDate(startDate),
        weeks: draft.weeks.map((week) => ({
          ...week,
          sessions: sortPlannedSessions(week.sessions).map((session, index) => ({
            ...session,
            order: index + 1,
            dayLabel: session.dayLabel?.trim() || undefined,
            progressionNote: session.progressionNote?.trim() || undefined,
            note: session.note?.trim() || undefined,
          })),
        })),
      });
      Alert.alert('Mesociclo actualizado', 'La planificación semanal quedó guardada.');
    } catch (error) {
      Alert.alert(
        'No se pudo guardar',
        error instanceof Error ? error.message : 'Inténtalo nuevamente.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateDraft = (updater: (current: Mesocycle) => Mesocycle) => {
    setDraft((current) => (current ? updater(current) : current));
  };

  const addSession = (weekNumber: number, routine: Routine) => {
    updateDraft((current) => ({
      ...current,
      weeks: current.weeks.map((week) => week.weekNumber === weekNumber
        ? {
          ...week,
          sessions: sortPlannedSessions([
            ...week.sessions,
            {
              id: generateId(),
              ref: toPlannedSessionRef(routine),
              order: week.sessions.length + 1,
            },
          ]),
        }
        : week),
    }));
    setExpandedWeekPicker(null);
  };

  const replaceSessionRoutine = (sessionId: string, routine: Routine) => {
    updateDraft((current) => updateSessionCollection(current, sessionId, (session, sourceWeekNumber) => ({
      session: {
        ...session,
        ref: toPlannedSessionRef(routine),
      },
      targetWeekNumber: sourceWeekNumber,
    })));
    setExpandedSessionPicker(null);
  };

  const moveSessionToWeek = (sessionId: string, targetWeekNumber: number) => {
    updateDraft((current) => updateSessionCollection(current, sessionId, (session) => ({
      session,
      targetWeekNumber,
    })));
  };

  const stepSessionOrder = (sessionId: string, direction: -1 | 1) => {
    updateDraft((current) => updateSessionCollection(current, sessionId, (session, sourceWeekNumber) => ({
      session: {
        ...session,
        order: Math.max(1, session.order + direction),
      },
      targetWeekNumber: sourceWeekNumber,
    })));
  };

  const patchSession = (sessionId: string, patch: Partial<PlannedSession>) => {
    updateDraft((current) => updateSessionCollection(current, sessionId, (session, sourceWeekNumber) => ({
      session: { ...session, ...patch },
      targetWeekNumber: sourceWeekNumber,
    })));
  };

  const deleteSession = (sessionId: string) => {
    updateDraft((current) => ({
      ...current,
      weeks: current.weeks.map((week) => ({
        ...week,
        sessions: sortPlannedSessions(week.sessions.filter((session) => session.id !== sessionId)),
      })),
    }));
  };

  const openExecuteRoutine = (resolvedRoutine?: Routine) => {
    if (!resolvedRoutine) return;
    router.push(`/routine/execute/${resolvedRoutine.id}`);
  };

  const copyPreviousWeek = (weekNumber: number) => {
    updateDraft((current) => {
      const sourceWeek = current.weeks.find((week) => week.weekNumber === weekNumber - 1);
      if (!sourceWeek || sourceWeek.sessions.length === 0) return current;

      return {
        ...current,
        weeks: current.weeks.map((week) => week.weekNumber === weekNumber
          ? { ...week, sessions: clonePlannedWeekSessions(sourceWeek.sessions) }
          : week),
      };
    });
  };

  if (!mesocycle || !draft) {
    return (
      <ThemeBackground>
        <SafeAreaView style={styles.safe}>
          <AppNavBar onBack={() => router.back()} />
          <GlassCard>
            <Text style={[styles.title, { color: theme.text }]}>No encontramos este mesociclo</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Si acabas de borrar el bloque o llegaste desde un enlace viejo, vuelve a la lista para crear uno nuevo o elegir otro plan.</Text>
            <View style={styles.actions}>
              <GlassButton title="Volver a mesociclos" onPress={() => router.replace('/(tabs)/mesocycles')} />
            </View>
          </GlassCard>
        </SafeAreaView>
      </ThemeBackground>
    );
  }

  const plannedSessions = countPlannedSessions(draft);

  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <AppNavBar
          onBack={() => router.back()}
          trailing={<Text style={[styles.headerTitle, { color: theme.primary }]}>{draft.status}</Text>}
        />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: theme.text }]}>{draft.name}</Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>Planificá semanas reales con rutinas reutilizables sin mezclar esta capa con analítica ni ejecución automática.</Text>

            <GlassCard style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Resumen del mesociclo</Text>
              <Text style={[styles.label, { color: theme.textMuted }]}>Nombre</Text>
              <GlassInput value={draft.name} onChangeText={(value) => updateDraft((current) => ({ ...current, name: value }))} />

              <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Objetivo</Text>
              <GlassInput
                value={draft.goal}
                onChangeText={(value) => updateDraft((current) => ({ ...current, goal: value }))}
                multiline
                numberOfLines={3}
                style={styles.textArea}
              />

              <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Estado</Text>
              <View style={styles.rowWrap}>
                {STATUS_OPTIONS.map((option) => {
                  const selected = option.value === draft.status;
                  return (
                    <HapticPressable
                      key={option.value}
                      onPress={() => updateDraft((current) => ({ ...current, status: option.value }))}
                      style={[
                        styles.optionChip,
                        {
                          borderColor: theme.glassBorder,
                          backgroundColor: selected ? theme.primary : theme.glass,
                        },
                      ]}
                    >
                      <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                        {option.label}
                      </Text>
                    </HapticPressable>
                  );
                })}
              </View>

              <View style={styles.metaGrid}>
                <View style={styles.metaCell}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Duración</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{draft.durationWeeks} semana{draft.durationWeeks === 1 ? '' : 's'}</Text>
                </View>
                <View style={styles.metaCell}>
                  <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Sesiones planificadas</Text>
                  <Text style={[styles.metaValue, { color: theme.text }]}>{plannedSessions}</Text>
                </View>
              </View>

              <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Fecha de inicio</Text>
              <DateTimeField value={startDate} onChange={setStartDate} mode="date" placeholder={formatStartDate(draft.startDate)} testID="mesocycle-edit-start-date-picker" />
            </GlassCard>

            {draft.weeks.map((week) => (
              <GlassCard key={week.id} style={styles.section}>
                <View style={styles.weekHeader}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>Semana {week.weekNumber}</Text>
                    <Text style={[styles.weekMeta, { color: theme.textMuted }]}>{week.sessions.length} sesión{week.sessions.length === 1 ? '' : 'es'} planificada{week.sessions.length === 1 ? '' : 's'}</Text>
                  </View>
                  <View style={styles.weekHeaderActions}>
                    {week.weekNumber > 1 ? (
                      <GlassButton
                        title="Copiar semana anterior"
                        onPress={() => copyPreviousWeek(week.weekNumber)}
                        variant="secondary"
                        disabled={!draft.weeks.some((sourceWeek) => sourceWeek.weekNumber === week.weekNumber - 1 && sourceWeek.sessions.length > 0)}
                      />
                    ) : null}
                    <GlassButton
                      title={expandedWeekPicker === week.weekNumber ? 'Cerrar' : 'Agregar sesión'}
                      onPress={() => setExpandedWeekPicker((current) => current === week.weekNumber ? null : week.weekNumber)}
                      variant="secondary"
                    />
                  </View>
                </View>

                {week.weekNumber > 1 && !draft.weeks.some((sourceWeek) => sourceWeek.weekNumber === week.weekNumber - 1 && sourceWeek.sessions.length > 0) ? (
                  <Text style={[styles.helper, { color: theme.textMuted }]}>No hay sesiones en la semana anterior para copiar todavía.</Text>
                ) : null}

                {expandedWeekPicker === week.weekNumber ? (
                  availableRoutines.length > 0 ? (
                    <View style={styles.inlinePickerWrap}>
                      <Text style={[styles.helper, { color: theme.textMuted }]}>Elegí una rutina disponible para esta semana. El MVP mantiene las rutinas como plantillas reutilizables.</Text>
                      <SessionRoutinePicker routines={availableRoutines} onSelect={(routine) => addSession(week.weekNumber, routine)} />
                    </View>
                  ) : (
                    <Text style={[styles.helper, { color: theme.textMuted }]}>Todavía no hay rutinas disponibles para asignar.</Text>
                  )
                ) : null}

                {week.sessions.length === 0 ? (
                  <Text style={[styles.emptyText, { color: theme.textMuted }]}>Todavía no agregaste sesiones a esta semana.</Text>
                ) : week.sessions.map((session) => {
                  const resolvedRoutine = resolvePlannedRoutine(session.ref);
                  const isUnavailable = !resolvedRoutine;
                  const isSessionPickerOpen = expandedSessionPicker === session.id;

                  return (
                    <View key={session.id} style={[styles.sessionCard, { borderColor: theme.glassBorder }]}> 
                      <View style={styles.sessionHeader}>
                        <View style={styles.sessionTitleWrap}>
                          <Text style={[styles.sessionTitle, { color: theme.text }]}>{session.ref.routineName}</Text>
                          <Text style={[styles.sessionMeta, { color: isUnavailable ? '#F5B041' : theme.textMuted }]}>
                            {isUnavailable ? 'Rutina no disponible' : resolvedRoutine.isShared ? 'Rutina compartida disponible' : 'Rutina local disponible'}
                          </Text>
                        </View>
                        <GlassButton
                          title="Cambiar rutina"
                          onPress={() => setExpandedSessionPicker((current) => current === session.id ? null : session.id)}
                          variant="secondary"
                        />
                      </View>

                      {isUnavailable ? (
                        <Text style={[styles.warning, { color: '#F5B041' }]}>Esta referencia sigue visible para que puedas reasignarla sin perder la planificación.</Text>
                      ) : null}

                      {isSessionPickerOpen ? (
                        availableRoutines.length > 0 ? (
                          <View style={styles.inlinePickerWrap}>
                            <Text style={[styles.helper, { color: theme.textMuted }]}>Reasigná la sesión a una rutina visible en tu biblioteca.</Text>
                            <SessionRoutinePicker routines={availableRoutines} onSelect={(routine) => replaceSessionRoutine(session.id, routine)} />
                          </View>
                        ) : (
                          <Text style={[styles.helper, { color: theme.textMuted }]}>No hay rutinas visibles para reasignar en este momento.</Text>
                        )
                      ) : null}

                      <Text style={[styles.label, { color: theme.textMuted }]}>Mover a la semana</Text>
                      <View style={styles.rowWrap}>
                        {draft.weeks.map((targetWeek) => {
                          const selected = targetWeek.weekNumber === week.weekNumber;
                          return (
                            <HapticPressable
                              key={`${session.id}-${targetWeek.weekNumber}`}
                              onPress={() => moveSessionToWeek(session.id, targetWeek.weekNumber)}
                              style={[
                                styles.weekChip,
                                {
                                  borderColor: theme.glassBorder,
                                  backgroundColor: selected ? theme.primary : theme.glass,
                                },
                              ]}
                            >
                              <Text style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                                S{targetWeek.weekNumber}
                              </Text>
                            </HapticPressable>
                          );
                        })}
                      </View>

                      <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Orden sugerido</Text>
                      <View style={styles.orderRow}>
                        <GlassButton title="-" onPress={() => stepSessionOrder(session.id, -1)} variant="secondary" />
                        <Text style={[styles.orderValue, { color: theme.text }]}>#{session.order}</Text>
                        <GlassButton title="+" onPress={() => stepSessionOrder(session.id, 1)} variant="secondary" />
                      </View>

                      <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Día</Text>
                      <GlassInput value={session.dayLabel ?? ''} onChangeText={(value) => patchSession(session.id, { dayLabel: value })} placeholder="Ej.: Lunes" />

                      <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Nota de progresión</Text>
                      <GlassInput
                        value={session.progressionNote ?? ''}
                        onChangeText={(value) => patchSession(session.id, { progressionNote: value })}
                        placeholder="Ej.: sumar una repetición al press"
                        multiline
                        numberOfLines={3}
                        style={styles.textArea}
                      />

                      <Text style={[styles.label, styles.spacedLabel, { color: theme.textMuted }]}>Nota opcional</Text>
                      <GlassInput
                        value={session.note ?? ''}
                        onChangeText={(value) => patchSession(session.id, { note: value })}
                        placeholder="Contexto extra para esta sesión"
                        multiline
                        numberOfLines={3}
                        style={styles.textArea}
                      />

                      <View style={styles.actions}>
                        <GlassButton title="Eliminar sesión" onPress={() => deleteSession(session.id)} variant="danger" />
                        <GlassButton title="Ejecutar rutina" onPress={() => openExecuteRoutine(resolvedRoutine)} variant="secondary" disabled={!resolvedRoutine} />
                      </View>
                    </View>
                  );
                })}
              </GlassCard>
            ))}

            <GlassButton title="Guardar planificación" onPress={save} loading={isSaving} disabled={isSaving} />
            <View style={styles.footerSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 20, paddingTop: 8 },
  flex: { flex: 1 },
  scroll: { paddingBottom: 40 },
  headerTitle: { fontSize: 14, fontWeight: '800', textTransform: 'capitalize' },
  title: { fontSize: 26, fontWeight: '900', marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 16 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  label: { fontSize: 13, marginBottom: 10 },
  spacedLabel: { marginTop: 14 },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  metaGrid: { flexDirection: 'row', gap: 12, marginTop: 16 },
  metaCell: { flex: 1 },
  metaLabel: { fontSize: 12 },
  metaValue: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  weekHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 },
  weekHeaderActions: { gap: 10, alignItems: 'stretch' },
  weekMeta: { fontSize: 13, marginTop: 4 },
  emptyText: { fontSize: 13, lineHeight: 18 },
  inlinePickerWrap: { marginBottom: 12 },
  helper: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  pickerList: { gap: 8 },
  pickerRow: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  pickerTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  pickerMeta: { color: '#D7DBDD', fontSize: 12, marginTop: 4 },
  sessionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 12 },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  sessionTitleWrap: { flex: 1 },
  sessionTitle: { fontSize: 16, fontWeight: '800' },
  sessionMeta: { fontSize: 12, marginTop: 4 },
  warning: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  weekChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orderValue: { fontSize: 18, fontWeight: '800', minWidth: 52, textAlign: 'center' },
  actions: { marginTop: 16, gap: 10 },
  footerSpacer: { height: 20 },
});
