import { MUSCLE_RANKS, muscleRankIndex } from '../constants/muscleRanks';
import { MUSCLE_VOLUME_AXES } from './muscleVolume';
import type { ActualEffort, AttemptExerciseSnapshot, Exercise, Mesocycle, MuscleAttribution, CatalogMuscleParticipation, Routine, WorkoutAttempt, WorkoutRecapExercise, WorkoutSession } from '../types';
import { BODY_REGIONS, BODY_REGION_IDS, BodyRegion, bodyMuscleLabel, bodyRegionsForMuscle } from '../constants/bodyMapMapping';
import { isValidPerformance } from './workoutAttempts';

export type BodyMapMode = 'participation' | 'planned' | 'completed' | 'shared-sets' | 'distribution' | 'volume-summary' | 'ranked';
export type BodyMapMetric = 'volume' | 'frequency' | 'rir' | 'rpe';
type EffortAggregate = { total: number; count: number };
export interface BodyMapEntry {
  id: BodyRegion; label: string; value: number; direct: number; indirect: number; unspecified: number;
  role: 'Principal' | 'Secundario' | 'Sin especificar';
  sources: string[]; exercises: string[]; days: string[];
  rir: EffortAggregate; rpe: EffortAggregate; effortSets: number; frequency?: number;
  rankColor?: string; rankLabel?: string; rankAxisId?: string;
}
export interface BodyMapProjection {
  version: 1; mode: BodyMapMode; entries: BodyMapEntry[];
  unmapped: string[]; totalSets: number; exerciseCount: number; missingSessions: number;
  period?: string; unit: string;
}
type GroupLabel = { id: string; displayName: string };
type Association = { muscleGroupId: string; role: BodyMapEntry['role']; relevance: number };
type Source = {
  attribution?: MuscleAttribution | null;
  catalog?: { readonly muscleParticipations: readonly CatalogMuscleParticipation[] };
  muscleGroups?: readonly string[];
};
type Work = { name: string; associations: Association[]; count: number; efforts?: readonly (ActualEffort | undefined)[]; day?: string };
const blank = (mode: BodyMapMode): BodyMapProjection => ({
  version: 1, mode, entries: BODY_REGION_IDS.map((id) => ({ id, label: BODY_REGIONS[id], value: 0, direct: 0, indirect: 0, unspecified: 0, role: 'Sin especificar', sources: [], exercises: [], days: [], rir: { total: 0, count: 0 }, rpe: { total: 0, count: 0 }, effortSets: 0 })),
  unmapped: [], totalSets: 0, exerciseCount: 0, missingSessions: 0,
  unit: mode === 'participation' ? 'Participación' : mode === 'distribution' ? 'Contribuciones' : mode === 'shared-sets' ? 'Series registradas' : 'Series ponderadas',
});
function associations(source: Source): Association[] {
  if (source.catalog?.muscleParticipations.length) return [...source.catalog.muscleParticipations];
  if (source.attribution) return [
    { muscleGroupId: source.attribution.primary, role: 'Principal', relevance: source.attribution.weights?.[source.attribution.primary] ?? 1 },
    ...source.attribution.secondary.map((id) => ({ muscleGroupId: id, role: 'Secundario' as const, relevance: source.attribution!.weights?.[id] ?? 0.5 })),
  ];
  return [...new Set(source.muscleGroups ?? [])].map((id) => ({ muscleGroupId: id, role: 'Sin especificar', relevance: 1 }));
}
const rank = { 'Sin especificar': 0, Secundario: 1, Principal: 2 };
function add(projection: BodyMapProjection, work: Work, groups: readonly GroupLabel[]) {
  if (!Number.isFinite(work.count) || work.count <= 0) return;
  projection.exerciseCount++;
  if (projection.mode !== 'participation' && projection.mode !== 'distribution') projection.totalSets += work.count;
  const resolved = new Map<BodyRegion, { relevance: number; role: BodyMapEntry['role']; labels: Set<string> }>();
  if (!work.associations.length) projection.unmapped.push(`${work.name}: sin clasificación muscular`);
  for (const item of work.associations) {
    if (!Number.isFinite(item.relevance) || item.relevance <= 0) continue;
    const regions = bodyRegionsForMuscle(item.muscleGroupId);
    const label = bodyMuscleLabel(item.muscleGroupId, groups);
    if (!regions.length) projection.unmapped.push(label);
    for (const id of regions) {
      const prior = resolved.get(id);
      resolved.set(id, {
        relevance: Math.max(prior?.relevance ?? 0, Math.min(1, item.relevance)),
        role: prior && rank[prior.role] > rank[item.role] ? prior.role : item.role,
        labels: new Set([...(prior?.labels ?? []), label]),
      });
    }
  }
  for (const [id, resolvedItem] of resolved) {
    const entry = projection.entries.find((item) => item.id === id)!;
    entry.value += work.count * resolvedItem.relevance;
    if (resolvedItem.role === 'Principal') entry.direct += work.count;
    else if (resolvedItem.role === 'Secundario') entry.indirect += work.count;
    else entry.unspecified += work.count;
    if (rank[resolvedItem.role] > rank[entry.role]) entry.role = resolvedItem.role;
    entry.sources = [...new Set([...entry.sources, ...resolvedItem.labels])];
    entry.exercises = [...new Set([...entry.exercises, work.name])];
    if (work.day && !entry.days.includes(work.day)) entry.days.push(work.day);
    for (const effort of work.efforts ?? []) {
      entry.effortSets++;
      if (effort && ((effort.kind === 'rir' && effort.value >= 0 && effort.value <= 5) || (effort.kind === 'rpe' && effort.value >= 6 && effort.value <= 10)) && Number.isFinite(effort.value)) {
        entry[effort.kind].total += effort.value;
        entry[effort.kind].count++;
      }
    }
  }
  projection.unmapped = [...new Set(projection.unmapped)];
}
export function projectExerciseBody(exercise: Exercise, groups: readonly GroupLabel[] = []): BodyMapProjection {
  const projection = blank('participation');
  add(projection, { name: exercise.name, associations: associations(exercise), count: 1 }, groups);
  return projection;
}
function plannedWork(routine: Pick<Routine, 'exercises'>): Work[] {
  return routine.exercises.map((exercise) => {
    const visited = new Set<string>();
    const drops = new Set<string>();
    let count = 0;
    for (const set of exercise.sets) {
      if (set.tipo === 'C' || visited.has(set.id)) continue;
      visited.add(set.id);
      if (set.dropGroupId && drops.has(set.dropGroupId)) continue;
      if (set.dropGroupId) drops.add(set.dropGroupId);
      count++;
    }
    return { name: exercise.name, associations: associations(exercise), count };
  });
}
export function projectRoutineBody(routine: Pick<Routine, 'exercises'>, groups: readonly GroupLabel[] = []): BodyMapProjection {
  const projection = blank('planned');
  plannedWork(routine).forEach((work) => add(projection, work, groups));
  return projection;
}
export function projectMesocycleBody(mesocycle: Mesocycle, routines: readonly Routine[], groups: readonly GroupLabel[] = [], weekNumber?: number): BodyMapProjection {
  const projection = blank('planned');
  for (const week of mesocycle.weeks) {
    if (weekNumber !== undefined && week.weekNumber !== weekNumber) continue;
    for (const entry of week.entries) {
      if ('kind' in entry || entry.planningState === 'cancelled' || entry.planningState === 'rescheduled') continue;
      const routine = entry.routineSnapshot ?? routines.find((item) => item.id === entry.ref.routineId);
      if (!routine) { projection.missingSessions++; continue; }
      plannedWork(routine).forEach((work) => add(projection, work, groups));
    }
  }
  projection.period = weekNumber === undefined ? 'Todo el mesociclo' : `Semana ${weekNumber}`;
  return projection;
}
function attemptWork(exercise: AttemptExerciseSnapshot, day: string): Work {
  const seen = new Set<string>(); const drops = new Set<string>();
  let count = 0; const efforts: (ActualEffort | undefined)[] = [];
  for (const { plan, result } of exercise.sets) {
    if (!plan || !result || plan.type === 'C' || seen.has(plan.id) || result.setId !== plan.id || !result.performed || !result.performance || !isValidPerformance(result.performance)) continue;
    seen.add(plan.id); efforts.push(result.actualEffort);
    if (plan.dropGroupId && drops.has(plan.dropGroupId)) continue;
    if (plan.dropGroupId) drops.add(plan.dropGroupId);
    count++;
  }
  return { name: exercise.recordedName, associations: associations(exercise), count, efforts, day };
}
export function projectAttemptsBody(attempts: readonly WorkoutAttempt[], groups: readonly GroupLabel[], options: { owner: string; now?: number; days?: number; mesocycleId?: string; weekNumber?: number }): BodyMapProjection {
  const projection = blank('completed');
  const now = options.now ?? Date.now(); const seen = new Set<string>();
  for (const attempt of attempts) {
    const time = Date.parse(attempt.completedAt);
    if (attempt.owner !== options.owner || seen.has(attempt.id) || !Number.isFinite(time) || time > now) continue;
    if (options.days !== undefined && time < now - options.days * 86400000) continue;
    if (options.mesocycleId && attempt.lineage?.mesocycleId !== options.mesocycleId) continue;
    if (options.weekNumber !== undefined && attempt.lineage?.weekNumber !== options.weekNumber) continue;
    seen.add(attempt.id);
    const date = new Date(time);
    const day = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    attempt.exercises.forEach((exercise) => add(projection, attemptWork(exercise, day), groups));
  }
  if (options.days) projection.period = `Últimos ${options.days} días · ${new Date(now - options.days * 86400000).toLocaleDateString('es')} – ${new Date(now).toLocaleDateString('es')}`;
  return projection;
}
/** Reduced shared records lack set types and attribution. Do not enrich from private attempts/catalog exercises. */
export function projectRecapBody(exercises: readonly WorkoutRecapExercise[], groups: readonly GroupLabel[] = []): BodyMapProjection {
  const projection = blank('shared-sets');
  for (const exercise of exercises) {
    const valid = exercise.sets.filter((set) => set.completed && Number.isFinite(set.weight) && set.weight >= 0 && (set.durationSeconds !== undefined ? Number.isFinite(set.durationSeconds) && set.durationSeconds > 0 : Number.isFinite(set.reps) && set.reps > 0));
    add(projection, { name: exercise.name, associations: associations({ muscleGroups: exercise.muscleGroupIds }), count: valid.length, efforts: valid.map((set) => set.actualEffort) }, groups);
  }
  return projection;
}
export function projectSessionBody(session: WorkoutSession, groups: readonly GroupLabel[] = []): BodyMapProjection {
  return projectRecapBody(session.exercises.map((exercise) => ({ ...exercise, muscleGroupIds: exercise.muscleGroupIds ?? [] })), groups);
}
/** Public distribution values are preserved, not reinterpreted as completed sets. */
export function projectSharedBody(values: readonly { id: string; value: number }[], groups: readonly GroupLabel[] = [], unit = 'Ejercicios del resumen', period?: string): BodyMapProjection {
  const projection = blank('distribution'); projection.unit = unit; projection.period = period;
  // Overlapping published aggregates cannot be added as independent sets: use their maximum per visual region.
  for (const { id, value } of values) {
    if (!Number.isFinite(value) || value <= 0) continue;
    const regions = VOLUME_BODY_REGIONS[id] ?? bodyRegionsForMuscle(id); const label = bodyMuscleLabel(id, groups);
    if (!regions.length) projection.unmapped.push(label);
    for (const region of regions) {
      const entry = projection.entries.find((item) => item.id === region)!;
      entry.value = Math.max(entry.value, value); entry.sources = [...new Set([...entry.sources, label])];
    }
  }
  projection.unmapped = [...new Set(projection.unmapped)];
  return projection;
}
export function bodyMetricValue(entry: BodyMapEntry, metric: BodyMapMetric): number | null {
  if (metric === 'volume') return entry.value;
  if (metric === 'frequency') return entry.frequency ?? entry.days.length;
  return entry[metric].count ? entry[metric].total / entry[metric].count : null;
}
/** Same scale for both views and planned/completed comparisons. RIR is inverted only for the color. */
export function bodyColorLevel(value: number | null, metric: BodyMapMetric, max: number): number {
  if (value === null) return 0;
  if (metric === 'rir') return Math.max(1, Math.min(4, Math.ceil((6 - value) / 1.5)));
  if (metric === 'rpe') return Math.max(1, Math.min(4, Math.ceil((value - 5) / 1.25)));
  return value <= 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(value / Math.max(1, max) * 4)));
}

/** Adapt the exact permission-filtered profile snapshot used by its body map and bars. */
export function projectVolumeBody(volume: import('./muscleVolume').MuscleVolume, previous = false): BodyMapProjection {
  const projection = blank('volume-summary');
  const period = volume[previous ? 'previous' : 'current'];
  projection.unit = 'Series equivalentes / semana';
  projection.period = `${new Date(period.start).toLocaleDateString('es', { timeZone: 'UTC' })} – ${new Date(period.end).toLocaleDateString('es', { timeZone: 'UTC' })} · UTC`;
  projection.totalSets = period.eligibleSets;

  for (const axis of period.axes) {
    if (axis.equivalent <= 0) continue;
    const regions = VOLUME_BODY_REGIONS[axis.id] ?? [];
    if (!regions.length) projection.unmapped.push(axis.label);
    for (const id of regions) {
      const entry = projection.entries.find((item) => item.id === id)!;
      entry.sources.push(axis.label);
      const weekly = axis.equivalent * 7 / volume.days;
      // Different aggregate axes can overlap one visible surface. Never double count them.
      if (weekly < entry.value) continue;
      entry.value = weekly; entry.direct = axis.direct; entry.indirect = axis.indirect;
      entry.frequency = axis.days; entry.effortSets = axis.direct + axis.indirect;
      entry.rir = { total: axis.rirSum, count: axis.rirCount }; entry.rpe = { total: axis.rpeSum, count: axis.rpeCount };
    }
  }
  if (period.unclassifiedSets) projection.unmapped.push(`${period.unclassifiedSets} series sin clasificación completa`);
  return projection;
}

export const VOLUME_BODY_REGIONS: Record<string, readonly BodyRegion[]> = {
    chest: ['chest'], shoulders: ['deltoids'], back: ['upper-back','trapezius','lower-back'], biceps: ['biceps'],
    triceps: ['triceps'], forearms: ['forearm'], abs: ['abs','obliques'], glutes: ['gluteal'], quads: ['quadriceps'],
    hamstrings: ['hamstring'], adductors: ['adductors'], abductors: ['gluteal'], calves: ['calves'], tibialis: ['tibialis'], hipFlexors: [],
  };

/** Keep ranks categorical and independent from volume's relative color scale. */
export function projectRankBody(ranks: import('./muscleRank').MuscleRanks): BodyMapProjection {
  const projection = blank('ranked');
  projection.unit = 'Rango de constancia registrada';
  for (const axis of ranks.axes) {
    if (!axis.lastActivity) continue;
    const label = MUSCLE_VOLUME_AXES.find(a => a.id === axis.id)!.label;
    const regions = VOLUME_BODY_REGIONS[axis.id] ?? [];
    if (!regions.length) projection.unmapped.push(label);
    const rankIndex = muscleRankIndex(axis.xp);
    for (const region of regions) {
      const entry = projection.entries.find(e => e.id === region)!;
      entry.sources.push(label);
      // Consistent winner with list selection; stable taxonomy order breaks ties.
      if (rankIndex + 1 <= entry.value) continue;
      entry.value = rankIndex + 1;
      entry.rankColor = MUSCLE_RANKS[rankIndex].color;
      entry.rankLabel = MUSCLE_RANKS[rankIndex].name;
      entry.rankAxisId = axis.id;
    }
  }
  return projection;
}
