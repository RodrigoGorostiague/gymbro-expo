import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AppScreenHeader } from '../../components/AppScreenHeader';
import { GlassCard, ThemeBackground } from '../../components/GlassCard';
import { HapticPressable } from '../../components/HapticPressable';
import { LogoutButton } from '../../components/LogoutButton';
import { SimpleLineChart } from '../../components/LineChart';
import { EmptyFilter, EntityPanel, FilterChip } from '../../components/progress/Filters';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocial } from '../../context/SocialContext';
import { MuscleGroup } from '../../types';
import { muscleGroupLabel } from '../../utils/catalogMuscleGroups';
import { ExperienceProgressCard } from '../../components/ExperienceProgressCard';
import { ComparisonBarChart, DistributionBarChart } from '../../components/ProgressCharts';
import { WorkoutSession } from '../../types';
import {
  buildHistoricalOptions,
  aggregateMuscleStatistics,
  SignalComparison,
  selectCoreProgressSignals,
  selectExercisePerformance,
  selectRoutineDetails,
  selectTrainingStatistics,
  selectWeightedExposure,
} from '../../utils/analytics';

type Scope = 'overview' | 'muscle' | 'pattern' | 'exercise' | 'routine';
type Period = 7 | 30 | 90;
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'overview', label: 'Resumen' }, { value: 'muscle', label: 'Músculos' },
  { value: 'pattern', label: 'Patrones' }, { value: 'exercise', label: 'Ejercicios' }, { value: 'routine', label: 'Rutinas' },
];
const PERIODS: { value: Period; label: string }[] = [{ value: 7, label: '7 días' }, { value: 30, label: '30 días' }, { value: 90, label: '90 días' }];

function isHistorySession(value: unknown): value is WorkoutSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<WorkoutSession>;
  return typeof session.id === 'string' && typeof session.routineName === 'string'
    && typeof session.completedAt === 'string' && Number.isFinite(session.durationSeconds);
}

export default function ProgressScreen() {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { ownProfile } = useSocial();
  const { exercises, routines, sessions, attempts, experienceProgress, quarantinedSessionCount, resolveQuarantine, dataState, dataError, retryData, catalogMuscleGroups = [] } = useData();
  const [scope, setScope] = useState<Scope>('overview');
  const [filterId, setFilterId] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [search, setSearch] = useState('');
  const [periodDays, setPeriodDays] = useState<Period>(7);
  const [chartRevision, setChartRevision] = useState(0);
  const owner = user ?? 'rodaja';
  const options = useMemo(() => buildHistoricalOptions(attempts, owner, exercises.map((e) => e.id), routines.map((r) => r.id)), [attempts, owner, exercises, routines]);
  const core = useMemo(() => selectCoreProgressSignals(attempts, owner, new Date(), periodDays), [attempts, owner, periodDays]);
  const activity = core;
  const statistics = useMemo(() => selectTrainingStatistics(attempts, owner, core.periods.current.start, core.periods.current.end), [attempts, owner, core.periods]);
  const exposure = useMemo(() => selectWeightedExposure(attempts, owner, new Date(), periodDays), [attempts, owner, periodDays]);
  const observedMuscles = useMemo(() => Object.keys({ ...exposure.current, ...exposure.previous })
    .filter((id) => catalogMuscleGroups.some((group) => group.id === id))
    .sort((left, right) => muscleGroupLabel(catalogMuscleGroups, left).localeCompare(muscleGroupLabel(catalogMuscleGroups, right), 'es')),
  [catalogMuscleGroups, exposure]);
  const selectedMuscleStatistics = useMemo(() => {
    if (!muscle) return null;
    const selected = catalogMuscleGroups.find((group) => group.id === muscle);
    const ids = !selected ? [muscle] : catalogMuscleGroups.filter((group) => group.id === selected.id
      || group.path.startsWith(`${selected.path}/`) || group.path.startsWith(`${selected.path} > `) || group.path.startsWith(`${selected.path}.`)).map((group) => group.id);
    return aggregateMuscleStatistics(statistics.muscles, ids);
  }, [catalogMuscleGroups, muscle, statistics.muscles]);
  const performance = useMemo(() => selectExercisePerformance(attempts, owner, scope === 'exercise' ? filterId : null, new Date(), 8, periodDays), [attempts, owner, scope, filterId, periodDays]);
  const routine = useMemo(() => selectRoutineDetails(attempts, owner, scope === 'routine' ? filterId : null, new Date(), periodDays), [attempts, owner, scope, filterId, periodDays]);
  const history = useMemo(() => (Array.isArray(sessions) ? sessions.filter(isHistorySession) : []), [sessions]);
  return (
    <ThemeBackground>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <AppScreenHeader
            title="Mi progreso"
            subtitle="Señales registradas, sin puntajes ocultos"
            trailing={<LogoutButton />}
          />

          <GlassCard style={styles.hero}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>ÚLTIMOS {periodDays} DÍAS</Text>
            <Text style={[styles.heroTitle, { color: theme.text }]}>{dataState !== 'ready' ? 'Preparando tus períodos de progreso' : activity.current.attempts === 0 ? 'Todavía no hay actividad en este período' : `${core.current.attempts} sesiones de entrenamiento y ${core.current.validSets} series válidas`}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{dataState === 'ready' ? `Comparado con ${formatPeriod(core.periods.previous.start, core.periods.previous.end)}. Las señales se muestran por separado.` : 'No mostraremos afirmaciones hasta terminar de cargar tus datos.'}</Text>
          </GlassCard>
          <GlassCard><ExperienceProgressCard progress={experienceProgress} frameId={ownProfile?.frameId} theme={theme} title="Nivel y próximos hitos" /></GlassCard>

          <View accessibilityRole="tablist" style={styles.periodRow}>{PERIODS.map((item) => <HapticPressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: periodDays === item.value }} accessibilityLabel={`Período ${item.label}`} onPress={() => { setPeriodDays(item.value); setChartRevision((current) => current + 1); }} style={[styles.period, { borderColor: theme.glassBorder, backgroundColor: periodDays === item.value ? theme.secondary : theme.glass }]}><Text style={{ color: periodDays === item.value ? theme.onPrimary : theme.text, fontWeight: '800' }}>{item.label}</Text></HapticPressable>)}</View>

          <HapticPressable accessibilityRole="button" accessibilityLabel="Registrar peso corporal" onPress={() => router.push('/profile/measurements')} style={[styles.weightAction, { borderColor: theme.primary, backgroundColor: theme.glass }]}>
            <Text style={[styles.weightActionTitle, { color: theme.text }]}>Peso corporal</Text>
            <Text style={{ color: theme.textMuted }}>Registrá una medición para habilitar fuerza relativa.</Text>
          </HapticPressable>

          {quarantinedSessionCount > 0 ? <GlassCard style={styles.hero}><Text accessibilityRole="header" style={[styles.chartTitle, { color: theme.text }]}>Resolver historial de entrenamientos anterior</Text><Text style={[styles.body, { color: theme.textMuted }]}>{quarantinedSessionCount} sesiones de entrenamiento sin propietario permanecen excluidas de las métricas. Elija una vez entre asignarlas todas a {owner} o eliminarlas permanentemente.</Text><View style={styles.scopeRow}><HapticPressable accessibilityRole="button" accessibilityHint={`Asigna todas las sesiones anteriores a ${owner}`} onPress={() => void resolveQuarantine('assign')} style={[styles.action, { backgroundColor: theme.primary }]}><Text style={{ color: theme.onPrimary, fontWeight: '800' }}>Asignar a {owner}</Text></HapticPressable><HapticPressable accessibilityRole="button" accessibilityHint="Abre una confirmación de eliminación irreversible" onPress={() => Alert.alert('¿Eliminar las sesiones anteriores?', 'Esto elimina permanentemente todas las sesiones de entrenamiento en cuarentena que no tienen propietario.', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar permanentemente', style: 'destructive', onPress: () => void resolveQuarantine('delete') }])} style={[styles.action, { backgroundColor: theme.glass, borderColor: theme.glassBorder, borderWidth: 1 }]}><Text style={{ color: theme.text, fontWeight: '800' }}>Eliminar permanentemente</Text></HapticPressable></View></GlassCard> : null}

          <View accessibilityRole="tablist" style={styles.scopeRow}>{SCOPES.map((item) => <HapticPressable key={item.value} accessibilityRole="tab" accessibilityState={{ selected: scope === item.value }} accessibilityLabel={`${item.label}, sección`} onPress={() => { setScope(item.value); setFilterId(null); setSearch(''); setChartRevision((current) => current + 1); }} style={[styles.scope, { borderColor: theme.glassBorder, backgroundColor: scope === item.value ? theme.primary : theme.glass }]}><Text style={{ color: scope === item.value ? theme.onPrimary : theme.text, fontWeight: '700' }}>{item.label}</Text></HapticPressable>)}</View>

          {dataState === 'loading' ? <GlassCard><View accessibilityLabel="Cargando panel de progreso" style={styles.skeleton}><View style={[styles.skeletonLine, { backgroundColor: theme.glassBorder }]} /><View style={[styles.skeletonLine, { backgroundColor: theme.glassBorder }]} /></View></GlassCard>
          : dataState === 'error' ? <GlassCard><Text accessibilityRole="alert" style={[styles.chartTitle, { color: theme.text }]}>No se pudo cargar tu progreso</Text><Text style={[styles.body, { color: theme.textMuted }]}>{dataError ?? 'Tus datos guardados no cambiaron.'}</Text><HapticPressable accessibilityRole="button" accessibilityHint="Vuelve a cargar los datos guardados" onPress={retryData} style={[styles.action, { backgroundColor: theme.primary }]}><Text style={{ color: theme.onPrimary, fontWeight: '800' }}>Reintentar</Text></HapticPressable></GlassCard>
          : <GlassCard style={styles.chartCard}>
            {scope === 'overview' ? <View><Text style={[styles.chartTitle, { color: theme.text }]}>Resumen · {formatPeriod(core.periods.current.start, core.periods.current.end)}</Text><ComparisonBarChart replayKey={chartRevision} palette={theme} accessibilityLabel="Comparación de sesiones, series y adherencia" data={[{ label: 'Sesiones', current: activity.current.attempts, previous: activity.previous.attempts }, { label: 'Series', current: statistics.effectiveSets, previous: core.previous.validSets }, { label: 'Adherencia', current: Math.round((core.current.adherence ?? 0) * 100), previous: Math.round((core.previous.adherence ?? 0) * 100) }]} /><View style={styles.statsGrid}>{[['Volumen', `${Math.round(Object.values(statistics.volumeByUnit).reduce((total, value) => total + value, 0))} kg·rep`], ['Repeticiones', statistics.repetitions], ['Récords', statistics.records]].map(([label, value]) => <View key={label as string} style={[styles.metric, { borderColor: theme.glassBorder }]}><Text style={[styles.statValue, { color: theme.text }]}>{value as React.ReactNode}</Text><Text style={[styles.statLabel, { color: theme.textMuted }]}>{label as string}</Text></View>)}</View></View> : null}
            {scope === 'muscle' ? <View><Text style={[styles.chartTitle, { color: theme.text }]}>Exposición muscular ponderada</Text><Text style={[styles.body, { color: theme.textMuted }]}>Comparación entre períodos. La exposición no representa crecimiento muscular.</Text>{observedMuscles.length === 0 ? <Text style={[styles.detail, { color: theme.textMuted }]}>Completa una rutina para ver exposición muscular.</Text> : <><ComparisonBarChart replayKey={chartRevision} palette={theme} accessibilityLabel="Exposición muscular actual y anterior" data={observedMuscles.map((id) => ({ label: muscleGroupLabel(catalogMuscleGroups, id), current: exposure.current[id] ?? 0, previous: exposure.previous[id] ?? 0 }))} /><View style={styles.wrap}>{observedMuscles.map((id) => <FilterChip key={id} label={muscleGroupLabel(catalogMuscleGroups, id)} selected={muscle === id} onPress={() => { setMuscle(id); setChartRevision((current) => current + 1); }} />)}</View>{muscle && selectedMuscleStatistics ? <Text style={[styles.detail, { color: theme.text }]}>{muscleGroupLabel(catalogMuscleGroups, muscle)}: {selectedMuscleStatistics.weightedSets.toFixed(1)} series ponderadas · {selectedMuscleStatistics.direct.toFixed(1)} directas · frecuencia {selectedMuscleStatistics.frequency}</Text> : <Text style={[styles.detail, { color: theme.textMuted }]}>Elegí un músculo para ver su detalle.</Text>}</>}</View> : null}
            {scope === 'pattern' ? <View><Text style={[styles.chartTitle, { color: theme.text }]}>Patrones de movimiento</Text><Text style={[styles.body, { color: theme.textMuted }]}>Series efectivas por patrón durante el período elegido.</Text>{Object.entries(statistics.patterns).length === 0 ? <Text style={[styles.detail, { color: theme.textMuted }]}>Las próximas sesiones guardarán patrones de movimiento para esta vista.</Text> : <><DistributionBarChart replayKey={chartRevision} palette={theme} accessibilityLabel="Series efectivas por patrón de movimiento" data={Object.entries(statistics.patterns).sort(([, left], [, right]) => right.effectiveSets - left.effectiveSets).map(([pattern, value]) => ({ label: pattern, value: value.effectiveSets }))} />{Object.entries(statistics.patterns).sort(([, left], [, right]) => right.effectiveSets - left.effectiveSets).map(([pattern, value]) => <View key={pattern} style={[styles.patternRow, { borderColor: theme.glassBorder }]}><View style={{ flex: 1 }}><Text style={[styles.patternName, { color: theme.text }]}>{pattern}</Text><Text style={{ color: theme.textMuted }}>{value.exercises} ejercicios · {Math.round(value.volume)} kg·rep</Text></View><Text style={[styles.patternSets, { color: theme.primary }]}>{value.effectiveSets}</Text></View>)}</>}</View> : null}
            {(scope === 'exercise' || scope === 'routine') ? <EntityPanel kind={scope} options={scope === 'exercise' ? options.exercises : options.routines} search={search} setSearch={setSearch} selected={filterId} setSelected={setFilterId} /> : null}
            {scope === 'exercise' && filterId ? performance.partitions.length === 0 ? <EmptyFilter onClear={() => setFilterId(null)} /> : <View>{performance.state === 'incompatible' ? <Text style={[styles.body, { color: theme.textMuted }]}>Hay modos o unidades incompatibles; se muestran por separado.</Text> : performance.state === 'insufficient' ? <Text style={[styles.body, { color: theme.textMuted }]}>Faltan observaciones válidas en ambos períodos para afirmar una tendencia.</Text> : null}{performance.partitions.flatMap((partition) => Object.keys(partition.series.at(-1)?.values ?? {}).map((indicator) => { const points = partition.series.map((point) => ({ date: point.at, label: new Date(point.at).toLocaleDateString('es', { day: 'numeric', month: 'numeric' }), maxWeight: point.values[indicator] ?? 0, totalReps: 0, tonnage: 0 })); const unit = indicator === 'reps' ? '' : indicator === 'volume' ? `${partition.unit}·rep` : partition.unit; return <View key={`${partition.key}:${indicator}`} style={styles.partition}><SimpleLineChart replayKey={chartRevision} data={points} dataKey="maxWeight" unit={unit} label={`${partition.mode === 'external-load' ? 'carga externa' : partition.mode === 'bodyweight' ? 'peso corporal' : 'asistido'} · ${indicator === 'reps' ? 'repeticiones' : indicator === 'load' ? 'carga' : indicator === 'volume' ? 'volumen' : indicator === 'bodyweight' ? 'peso corporal' : 'asistencia'} (${unit || 'conteo'})`} summary={`${formatPeriod(core.periods.previous.start, core.periods.previous.end)} frente a ${formatPeriod(core.periods.current.start, core.periods.current.end)}. ${partition.observationCount} observaciones compatibles. ${describeComparison(partition.trends[indicator])}`} /></View>; }))}</View> : null}
            {scope === 'routine' && filterId ? routine.state === 'no-data' ? <EmptyFilter onClear={() => setFilterId(null)} /> : <View><Text style={[styles.chartTitle, { color: theme.text }]}>Ejecución de la rutina</Text><ComparisonBarChart replayKey={chartRevision} palette={theme} accessibilityLabel="Comparación de ejecución de rutina" data={[{ label: 'Completadas', current: routine.current?.completionCount ?? 0, previous: routine.previous?.completionCount ?? 0 }, { label: 'Adherencia', current: Math.round((routine.current?.adherence ?? 0) * 100), previous: Math.round((routine.previous?.adherence ?? 0) * 100) }, { label: 'Minutos', current: Math.round((routine.current?.medianDurationSeconds ?? 0) / 60), previous: Math.round((routine.previous?.medianDurationSeconds ?? 0) / 60) }]} /><Text style={[styles.body, { color: theme.textMuted }]}>Trabajo externo actual: {Object.entries(routine.current?.workload ?? {}).map(([unit, value]) => `${Math.round(value)} ${unit}·rep`).join(', ') || 'sin datos compatibles'}</Text></View> : null}
            {core.current.attempts + core.previous.attempts === 0 && scope === 'overview' ? <Text style={[styles.empty, { color: theme.textMuted }]}>Completa una rutina para comparar actividad y adherencia. El historial reciente seguirá disponible abajo.</Text> : null}
          </GlassCard>}

          {history.length > 0 && (
            <GlassCard>
              <Text style={[styles.recentTitle, { color: theme.text }]}>Historial</Text>
              {history.map((s) => (
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar la sesión de entrenamiento ${s.routineName}`}
                  accessibilityHint="Abre los detalles de la sesión de entrenamiento completada"
                  onPress={() => router.push({ pathname: '/session/[id]', params: { id: s.id } })}
                  style={({ pressed }) => [
                    styles.recentRow,
                    { borderColor: theme.glassBorder, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={{ color: theme.text, fontWeight: '600' }}>{s.routineName}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {new Date(s.completedAt).toLocaleDateString('es')} ·{' '}
                    {Math.round(s.durationSeconds / 60)} min
                  </Text>
                  <Text style={[styles.editHint, { color: theme.primary }]}>Editar sesión</Text>
                </Pressable>
              ))}
            </GlassCard>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemeBackground>
  );
}

function describeComparison(value?: SignalComparison) {
  if (!value || value.state === 'insufficient') return value?.previous === 0 ? 'sin porcentaje: base anterior 0' : 'sin base comparable';
  const direction = value.percentageDelta! > 0 ? 'más' : value.percentageDelta! < 0 ? 'menos' : 'sin cambio';
  return direction === 'sin cambio' ? direction : `${Math.abs(value.percentageDelta!)}% ${direction}`;
}

function formatPeriod(start: Date, end: Date) {
  const last = new Date(end.getTime() - 1);
  return `${start.toLocaleDateString('es', { day: 'numeric', month: 'short' })}–${last.toLocaleDateString('es', { day: 'numeric', month: 'short' })}`;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { width: '100%', maxWidth: 900, alignSelf: 'center', padding: 20, paddingTop: 12, paddingBottom: 40 },
  hero: { marginBottom: 14 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
   heroTitle: { fontSize: 23, lineHeight: 29, fontWeight: '900', marginVertical: 7 },
   periodRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
   period: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flex: 1, minHeight: 42, justifyContent: 'center' },
  body: { fontSize: 13, lineHeight: 19 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  scope: { minHeight: 48, flexGrow: 1, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  skeleton: { height: 160, justifyContent: 'center', gap: 16 },
  skeletonLine: { height: 24, borderRadius: 8, width: '80%' },
  metric: { width: '47%', flexGrow: 1, minHeight: 96, padding: 12, borderWidth: 1, borderRadius: 14 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 14 },
  detail: { fontSize: 16, fontWeight: '800', lineHeight: 23, marginTop: 12 },
  action: { minHeight: 48, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, marginTop: 14 },
  partition: { marginTop: 18 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  chartCard: {
    marginBottom: 16,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 13,
    marginBottom: 8,
  },
  chips: {
    marginBottom: 16,
  },
  chipPulse: {
    marginRight: 8,
  },
  chartSpacer: {
    height: 20,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: 24,
  },
  weightAction: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  weightActionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  patternRow: { borderTopWidth: 1, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  patternName: { fontSize: 15, fontWeight: '800' },
  patternSets: { fontSize: 22, fontWeight: '900' },
  recentTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  recentRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  editHint: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
});
