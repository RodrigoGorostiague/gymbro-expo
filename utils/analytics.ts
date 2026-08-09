import { BodyMetric, ExerciseLoadMode, LoadUnit, MuscleGroup, SetPerformance, UserProfile, WorkoutAttempt, WorkoutSession } from '../types';
import { getExerciseExposure, getEligiblePerformances } from './workoutAttempts';

export interface PeriodRange {
  readonly start: Date;
  readonly end: Date;
}

export interface ComparisonPeriods {
  readonly current: PeriodRange;
  readonly previous: PeriodRange;
}

export interface PeriodSignals {
  readonly attempts: number;
  readonly durationSeconds: number;
  readonly validSets: number;
  readonly plannedSets: number;
  readonly adherence: number | null;
}

export type ComparisonState = 'comparable' | 'insufficient';

export interface SignalComparison {
  readonly current: number | null;
  readonly previous: number | null;
  readonly percentageDelta: number | null;
  readonly state: ComparisonState;
}

export interface CoreSignalComparisons {
  readonly attempts: SignalComparison;
  readonly durationSeconds: SignalComparison;
  readonly validSets: SignalComparison;
  readonly adherence: SignalComparison;
}

export interface CoreProgressSignals {
  readonly periods: ComparisonPeriods;
  readonly current: PeriodSignals;
  readonly previous: PeriodSignals;
  readonly comparisons: CoreSignalComparisons;
}

const emptySignals = (): PeriodSignals => ({
  attempts: 0,
  durationSeconds: 0,
  validSets: 0,
  plannedSets: 0,
  adherence: null,
});

function localDay(date: Date, offset: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}

export function getDefaultComparisonPeriods(now: Date = new Date(), periodDays = 7): ComparisonPeriods {
  const days = Math.max(1, Math.floor(periodDays));
  const currentStart = localDay(now, -(days - 1));
  const currentEnd = localDay(now, 1);
  return {
    current: { start: currentStart, end: currentEnd },
    previous: { start: localDay(currentStart, -days), end: currentStart },
  };
}

function comparison(current: number | null, previous: number | null): SignalComparison {
  if (current === null || previous === null || previous === 0) {
    return { current, previous, percentageDelta: null, state: 'insufficient' };
  }
  return {
    current,
    previous,
    percentageDelta: Math.round(((current - previous) / previous) * 1000) / 10,
    state: 'comparable',
  };
}

export function selectCoreProgressSignals(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  now: Date = new Date(),
  periodDays = 7,
): CoreProgressSignals {
  const periods = getDefaultComparisonPeriods(now, periodDays);
  const current = { ...emptySignals() };
  const previous = { ...emptySignals() };

  for (const attempt of attempts) {
    if (attempt.owner !== owner) continue;
    const timestamp = new Date(attempt.completedAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const target = timestamp >= periods.current.start.getTime() && timestamp < periods.current.end.getTime()
      ? current
      : timestamp >= periods.previous.start.getTime() && timestamp < periods.previous.end.getTime()
        ? previous
        : null;
    if (!target) continue;

    target.attempts += 1;
    if (Number.isFinite(attempt.durationSeconds) && attempt.durationSeconds > 0) {
      target.durationSeconds += attempt.durationSeconds;
    }
    target.validSets += attempt.completion.validSets;
    target.plannedSets += attempt.completion.plannedSets;
  }

  current.adherence = current.plannedSets === 0 ? null : current.validSets / current.plannedSets;
  previous.adherence = previous.plannedSets === 0 ? null : previous.validSets / previous.plannedSets;

  return {
    periods,
    current,
    previous,
    comparisons: {
      attempts: comparison(current.attempts, previous.attempts),
      durationSeconds: comparison(current.durationSeconds, previous.durationSeconds),
      validSets: comparison(current.validSets, previous.validSets),
      adherence: comparison(current.adherence, previous.adherence),
    },
  };
}

export type AdvancedDataState =
  | 'no-data'
  | 'insufficient'
  | 'one-observation'
  | 'incompatible'
  | 'unknown'
  | 'zero-baseline'
  | 'valid-trend';

export interface HistoricalOption {
  readonly id: string;
  readonly label: string;
  readonly labels: readonly string[];
  readonly historical: boolean;
}

export function buildHistoricalOptions(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  activeExerciseIds: readonly string[] = [],
  activeRoutineIds: readonly string[] = [],
) {
  const collect = (kind: 'exercise' | 'routine') => {
    const values = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      if (attempt.owner !== owner) continue;
      const snapshots = kind === 'routine'
        ? [{ id: attempt.routineId, label: attempt.recordedRoutineName }]
        : attempt.exercises.map(({ exerciseId: id, recordedName: label }) => ({ id, label }));
      for (const { id, label } of snapshots) {
        if (id === null) continue;
        const labels = values.get(id) ?? new Set<string>();
        labels.add(label);
        values.set(id, labels);
      }
    }
    const active = new Set(kind === 'routine' ? activeRoutineIds : activeExerciseIds);
    return [...values].map(([id, labels]): HistoricalOption => {
      const allLabels = [...labels];
      return { id, label: allLabels.at(-1) ?? id, labels: allLabels, historical: !active.has(id) };
    });
  };
  return {
    exercises: collect('exercise'),
    routines: collect('routine'),
    unknownExercises: attempts.filter((a) => a.owner === owner).flatMap((a) => a.exercises).filter((e) => e.exerciseId === null).length,
    unknownRoutines: attempts.filter((a) => a.owner === owner && a.routineId === null).length,
  };
}

export interface PerformancePoint {
  readonly at: string;
  readonly period: 'current' | 'previous';
  readonly values: Readonly<Record<string, number>>;
}

export interface PerformancePartition {
  readonly key: string;
  readonly mode: ExerciseLoadMode;
  readonly unit: LoadUnit;
  readonly observationCount: number;
  readonly series: readonly PerformancePoint[];
  readonly trends: Readonly<Record<string, SignalComparison>>;
}

function performanceValues(value: SetPerformance): Record<string, number> {
  if (value.mode === 'external-load') return { reps: value.reps, load: value.load, volume: value.reps * value.load };
  if (value.mode === 'bodyweight') return { reps: value.reps, bodyweight: value.bodyweight };
  return { reps: value.reps, assistance: value.assistance };
}

export function selectExercisePerformance(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  exerciseId: string | null,
  now: Date = new Date(),
  chartLimit = 8,
  periodDays = 7,
): { state: AdvancedDataState; partitions: readonly PerformancePartition[] } {
  if (exerciseId === null) return { state: 'unknown', partitions: [] };
  const periods = getDefaultComparisonPeriods(now, periodDays);
  const grouped = new Map<string, { mode: ExerciseLoadMode; unit: LoadUnit; points: PerformancePoint[] }>();
  let matched = false;
  for (const attempt of attempts) {
    if (attempt.owner !== owner) continue;
    const time = new Date(attempt.completedAt).getTime();
    const period = time >= periods.current.start.getTime() && time < periods.current.end.getTime()
      ? 'current' : time >= periods.previous.start.getTime() && time < periods.previous.end.getTime() ? 'previous' : null;
    if (!period) continue;
    const attemptPartitions = new Map<string, { mode: ExerciseLoadMode; unit: LoadUnit; values: Record<string, number>[] }>();
    for (const exercise of attempt.exercises) {
      if (exercise.exerciseId !== exerciseId) continue;
      matched = true;
      for (const value of getEligiblePerformances(exercise.sets)) {
        const key = `${exerciseId}:${value.mode}:${value.unit}`;
        const partition = attemptPartitions.get(key) ?? { mode: value.mode, unit: value.unit, values: [] };
        partition.values.push(performanceValues(value));
        attemptPartitions.set(key, partition);
      }
    }
    for (const [key, attemptPartition] of attemptPartitions) {
      const indicators = Object.keys(attemptPartition.values[0]);
      const values = Object.fromEntries(indicators.map((indicator) => [
        indicator,
        attemptPartition.values.reduce((sum, item) => sum + item[indicator], 0) / attemptPartition.values.length,
      ]));
      const partition = grouped.get(key) ?? { mode: attemptPartition.mode, unit: attemptPartition.unit, points: [] };
      partition.points.push({ at: attempt.completedAt, period, values });
      grouped.set(key, partition);
    }
  }
  const partitions = [...grouped].map(([key, value]): PerformancePartition => {
    const points = value.points.sort((a, b) => a.at.localeCompare(b.at));
    const indicators = Object.keys(points[0]?.values ?? {});
    const trends = Object.fromEntries(indicators.map((indicator) => {
      const previous = points.find((point) => point.period === 'previous')?.values[indicator] ?? null;
      const current = points.filter((point) => point.period === 'current').at(-1)?.values[indicator] ?? null;
      const trend: SignalComparison = previous === null || current === null
        ? { current, previous: null, percentageDelta: null, state: 'insufficient' }
        : comparison(current, previous);
      return [indicator, trend];
    }));
    return { key, mode: value.mode, unit: value.unit, observationCount: points.length, series: points.slice(-Math.max(1, chartLimit)), trends };
  });
  const observations = partitions.reduce((sum, value) => sum + value.observationCount, 0);
  const hasPeriodPair = partitions.some((value) => Object.values(value.trends).some((trend) => trend.current !== null && trend.previous !== null));
  const hasZeroBaseline = partitions.some((value) => Object.values(value.trends).some((trend) => trend.previous === 0));
  const state: AdvancedDataState = !matched || observations === 0 ? 'no-data'
    : !hasPeriodPair ? 'insufficient'
      : partitions.length > 1 ? 'incompatible'
        : hasZeroBaseline ? 'zero-baseline' : 'valid-trend';
  return { state, partitions };
}

export function selectWeightedExposure(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  now: Date = new Date(),
  periodDays = 7,
) {
  const periods = getDefaultComparisonPeriods(now, periodDays);
  const result: Record<'current' | 'previous', Partial<Record<MuscleGroup, number>>> = { current: {}, previous: {} };
  for (const attempt of attempts) {
    if (attempt.owner !== owner) continue;
    const time = new Date(attempt.completedAt).getTime();
    const period = time >= periods.current.start.getTime() && time < periods.current.end.getTime()
      ? 'current' : time >= periods.previous.start.getTime() && time < periods.previous.end.getTime() ? 'previous' : null;
    if (!period) continue;
    for (const exercise of attempt.exercises) {
      if (!exercise.attribution) continue;
      for (const [muscle, exposure] of Object.entries(getExerciseExposure(exercise.attribution, exercise.sets))) {
        result[period][muscle as MuscleGroup] = (result[period][muscle as MuscleGroup] ?? 0) + exposure!;
      }
    }
  }
  return result;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function selectRoutineDetails(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  routineId: string | null,
  now: Date = new Date(),
  periodDays = 7,
) {
  if (routineId === null) return { state: 'unknown' as const, current: null, previous: null };
  const periods = getDefaultComparisonPeriods(now, periodDays);
  const summarize = (start: Date, end: Date) => {
    const values = attempts.filter((attempt) => attempt.owner === owner && attempt.routineId === routineId
      && new Date(attempt.completedAt) >= start && new Date(attempt.completedAt) < end);
    const planned = values.reduce((sum, value) => sum + value.completion.plannedSets, 0);
    const valid = values.reduce((sum, value) => sum + value.completion.validSets, 0);
    const workload: Partial<Record<LoadUnit, number>> = {};
    for (const attempt of values) for (const exercise of attempt.exercises) for (const value of getEligiblePerformances(exercise.sets)) {
      if (value.mode === 'external-load') workload[value.unit] = (workload[value.unit] ?? 0) + value.load * value.reps;
    }
    return {
      completionCount: values.filter((value) => value.completion.status !== 'partial').length,
      lastPerformed: values.map((value) => value.completedAt).sort().at(-1) ?? null,
      medianDurationSeconds: median(values.map((value) => value.durationSeconds).filter((value) => Number.isFinite(value) && value >= 0)),
      adherence: planned === 0 ? null : valid / planned,
      workload,
    };
  };
  const current = summarize(periods.current.start, periods.current.end);
  const previous = summarize(periods.previous.start, periods.previous.end);
  const workloadComparisons = Object.fromEntries(
    [...new Set([...Object.keys(current.workload), ...Object.keys(previous.workload)])]
      .map((unit) => [unit, comparison(current.workload[unit as LoadUnit] ?? null, previous.workload[unit as LoadUnit] ?? null)]),
  );
  return { state: current.lastPerformed || previous.lastPerformed ? 'valid-trend' as const : 'no-data' as const, current, previous, workloadComparisons };
}

export interface ExerciseProgressTarget {
  catalogExerciseId?: string;
  name: string;
}

function matchesExerciseTarget(
  exercise: WorkoutSession['exercises'][number],
  target: ExerciseProgressTarget,
): boolean {
  if (target.catalogExerciseId) {
    if (exercise.catalogExerciseId === target.catalogExerciseId) {
      return true;
    }

    if (exercise.catalogExerciseId) {
      return false;
    }
  }

  return exercise.name.toLowerCase() === target.name.toLowerCase();
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function isInRange(dateStr: string, start: Date, end: Date): boolean {
  const d = new Date(dateStr);
  return d >= start && d <= end;
}

export function getWeeklyMinutes(sessions: WorkoutSession[]): number {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return sessions
    .filter((s) => isInRange(s.completedAt, weekStart, weekEnd))
    .reduce((acc, s) => acc + s.durationSeconds / 60, 0);
}

export function getWeeklyTonnage(sessions: WorkoutSession[]): number {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return calculateTonnage(
    sessions.filter((s) => isInRange(s.completedAt, weekStart, weekEnd)),
  );
}

export function getMonthlyTonnage(sessions: WorkoutSession[]): number {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  return calculateTonnage(
    sessions.filter((s) => isInRange(s.completedAt, monthStart, monthEnd)),
  );
}

export function calculateTonnage(sessions: WorkoutSession[]): number {
  return sessions.reduce((total, session) => {
    const sessionTonnage = session.exercises.reduce((exTotal, exercise) => {
      const setTotal = exercise.sets
        .filter((set) => set.completed)
        .reduce((sum, set) => sum + set.weight * set.reps, 0);
      return exTotal + setTotal;
    }, 0);
    return total + sessionTonnage;
  }, 0);
}

export interface ExerciseProgressPoint {
  date: string;
  label: string;
  maxWeight: number;
  totalReps: number;
  tonnage: number;
}

export function getExerciseProgress(
  sessions: WorkoutSession[],
  target: ExerciseProgressTarget,
  limit = 10,
): ExerciseProgressPoint[] {
  const points: ExerciseProgressPoint[] = [];

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  for (const session of sorted) {
    const exercise = session.exercises.find((entry) => matchesExerciseTarget(entry, target));
    if (!exercise) continue;

    const completedSets = exercise.sets.filter((s) => s.completed);
    if (completedSets.length === 0) continue;

    const maxWeight = Math.max(...completedSets.map((s) => s.weight));
    const totalReps = completedSets.reduce((sum, s) => sum + s.reps, 0);
    const tonnage = completedSets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const date = new Date(session.completedAt);

    points.push({
      date: session.completedAt,
      label: `${date.getDate()}/${date.getMonth() + 1}`,
      maxWeight,
      totalReps,
      tonnage,
    });
  }

  return points.slice(-limit);
}

export function getUniqueExerciseNames(sessions: WorkoutSession[]): string[] {
  const names = new Set<string>();
  for (const session of sessions) {
    for (const exercise of session.exercises) {
      names.add(exercise.name);
    }
  }
  return Array.from(names).sort();
}

export function getCompletedWorkoutsCount(sessions: WorkoutSession[]): number {
  return sessions.length;
}

export function getWeeklyWorkoutsCount(sessions: WorkoutSession[]): number {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return sessions.filter((s) => isInRange(s.completedAt, weekStart, weekEnd)).length;
}

export interface TrainingStatisticsSummary {
  sessions: number;
  plannedSets: number;
  completedSets: number;
  effectiveSets: number;
  repetitions: number;
  volumeByUnit: Partial<Record<LoadUnit, number>>;
  maxLoadByUnit: Partial<Record<LoadUnit, number>>;
  records: number;
  muscles: Record<MuscleGroup, { direct: number; indirect: number; weightedSets: number; weightedVolume: number; frequency: number }>;
  patterns: Record<string, { effectiveSets: number; repetitions: number; volume: number; exercises: number }>;
}

function performanceLoad(performance: SetPerformance): number | null {
  if (performance.mode !== 'external-load') return null;
  return performance.load;
}

function emptySummary(): TrainingStatisticsSummary {
  return {
    sessions: 0, plannedSets: 0, completedSets: 0, effectiveSets: 0, repetitions: 0,
    volumeByUnit: {}, maxLoadByUnit: {}, records: 0, muscles: {}, patterns: {},
  };
}

/** Summarizes immutable attempt snapshots. It deliberately skips dimensions absent from legacy attempts. */
export function selectTrainingStatistics(
  attempts: readonly WorkoutAttempt[],
  owner: UserProfile,
  start: Date,
  end: Date,
): TrainingStatisticsSummary {
  const summary = emptySummary();
  const seenExercisesByPattern = new Map<string, Set<string>>();
  const trainedMusclesByDay = new Map<string, Set<string>>();
  const previousBest = new Map<string, { load: number; volume: number; e1rm: number }>();

  for (const attempt of attempts.filter((value) => value.owner === owner).sort((a, b) => a.completedAt.localeCompare(b.completedAt))) {
    const date = new Date(attempt.completedAt);
    if (!Number.isFinite(date.getTime())) continue;
    const inRange = date >= start && date < end;
    const day = date.toISOString().slice(0, 10);
    if (inRange) {
      summary.sessions += 1;
      summary.plannedSets += attempt.completion.plannedSets;
      summary.completedSets += attempt.completion.validSets;
    }

    for (const exercise of attempt.exercises) {
      const eligible = getEligiblePerformances(exercise.sets);
      const current = { load: 0, volume: 0, e1rm: 0 };
      for (const performance of eligible) {
        const load = performanceLoad(performance);
        if (load === null) continue;
        const volume = load * performance.reps;
        current.load = Math.max(current.load, load);
        current.volume += volume;
        if (performance.reps <= 12) current.e1rm = Math.max(current.e1rm, load * (1 + performance.reps / 30));
      }
      const key = `${exercise.exerciseId ?? exercise.recordedName}:${eligible[0]?.mode ?? ''}:${eligible[0]?.unit ?? ''}`;
      const before = previousBest.get(key);
      if (inRange && before && (current.load > before.load || current.volume > before.volume || current.e1rm > before.e1rm)) summary.records += 1;
      previousBest.set(key, {
        load: Math.max(before?.load ?? 0, current.load), volume: Math.max(before?.volume ?? 0, current.volume), e1rm: Math.max(before?.e1rm ?? 0, current.e1rm),
      });

      if (!inRange || eligible.length === 0) continue;
      summary.effectiveSets += eligible.length;
      for (const performance of eligible) {
        summary.repetitions += performance.reps;
        const load = performanceLoad(performance);
        if (load === null) continue;
        summary.volumeByUnit[performance.unit] = (summary.volumeByUnit[performance.unit] ?? 0) + load * performance.reps;
        summary.maxLoadByUnit[performance.unit] = Math.max(summary.maxLoadByUnit[performance.unit] ?? 0, load);
      }

      const participations = exercise.catalog?.muscleParticipations ?? (exercise.attribution
        ? [
          ...(exercise.attribution ? [{ muscleGroupId: exercise.attribution.primary, role: 'Principal' as const, relevance: exercise.attribution.weights?.[exercise.attribution.primary] ?? 1, originalLabel: exercise.attribution.primary }] : []),
          ...(exercise.attribution?.secondary ?? []).map((muscle) => ({ muscleGroupId: muscle, role: 'Secundario' as const, relevance: exercise.attribution?.weights?.[muscle] ?? 0.4, originalLabel: muscle })),
        ] : []);
      for (const participation of participations) {
        const entry = summary.muscles[participation.muscleGroupId] ?? { direct: 0, indirect: 0, weightedSets: 0, weightedVolume: 0, frequency: 0 };
        const weightedSets = eligible.length * participation.relevance;
        const weightedVolume = eligible.reduce((total, performance) => total + (performanceLoad(performance) ?? 0) * performance.reps, 0) * participation.relevance;
        entry.weightedSets += weightedSets;
        entry.weightedVolume += weightedVolume;
        if (participation.relevance >= 0.7) entry.direct += weightedSets;
        else if (participation.relevance >= 0.2) entry.indirect += weightedSets;
        summary.muscles[participation.muscleGroupId] = entry;
        const days = trainedMusclesByDay.get(participation.muscleGroupId) ?? new Set<string>();
        if (weightedSets >= 0.5) days.add(day);
        trainedMusclesByDay.set(participation.muscleGroupId, days);
      }

      const pattern = exercise.catalog?.movementPattern;
      if (pattern) {
        const entry = summary.patterns[pattern] ?? { effectiveSets: 0, repetitions: 0, volume: 0, exercises: 0 };
        entry.effectiveSets += eligible.length;
        entry.repetitions += eligible.reduce((total, performance) => total + performance.reps, 0);
        entry.volume += eligible.reduce((total, performance) => total + (performanceLoad(performance) ?? 0) * performance.reps, 0);
        const exercises = seenExercisesByPattern.get(pattern) ?? new Set<string>();
        exercises.add(exercise.exerciseId ?? exercise.recordedName);
        seenExercisesByPattern.set(pattern, exercises);
        summary.patterns[pattern] = entry;
      }
    }
  }
  for (const [muscle, days] of trainedMusclesByDay) {
    const entry = summary.muscles[muscle];
    if (entry) entry.frequency = days.size;
  }
  for (const [pattern, exercises] of seenExercisesByPattern) {
    const entry = summary.patterns[pattern];
    if (entry) entry.exercises = exercises.size;
  }
  return summary;
}

export function bodyWeightAt(metrics: readonly BodyMetric[], at: string): number | null {
  const target = Date.parse(at);
  if (!Number.isFinite(target)) return null;
  return metrics.filter((metric) => metric.metricType === 'body_weight' && Date.parse(metric.measuredAt) <= target)
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0]?.value ?? null;
}

/** Adds each original muscle association at most once for a parent-group view. */
export function aggregateMuscleStatistics(
  muscles: TrainingStatisticsSummary['muscles'],
  muscleIds: readonly MuscleGroup[],
): { direct: number; indirect: number; weightedSets: number; weightedVolume: number; frequency: number } {
  const result = { direct: 0, indirect: 0, weightedSets: 0, weightedVolume: 0, frequency: 0 };
  for (const id of new Set(muscleIds)) {
    const value = muscles[id];
    if (!value) continue;
    result.direct += value.direct;
    result.indirect += value.indirect;
    result.weightedSets += value.weightedSets;
    result.weightedVolume += value.weightedVolume;
    result.frequency = Math.max(result.frequency, value.frequency);
  }
  return result;
}
