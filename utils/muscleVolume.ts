import taxonomy from '../constants/muscleVolumeTaxonomy.json';
import type { WorkoutAttempt } from '../types';

export const MUSCLE_VOLUME_AXES = taxonomy;
export type VolumeDays = 7 | 28 | 90;
export type MuscleVolumeAxis = { id: string; label: string; direct: number; indirect: number; equivalent: number; days: number; effortCount: number; rirCount: number; rirSum: number; rpeCount: number; rpeSum: number };
export type VolumePeriod = { start: string; end: string; axes: MuscleVolumeAxis[]; eligibleSets: number; unclassifiedSets: number; unsupportedSets: number; effortCount: number };
export type MuscleVolume = { metricVersion: 2; taxonomyVersion: 1; subjectId: string; asOf: string; days: VolumeDays; coverage: 'unknown'; current: VolumePeriod; previous: VolumePeriod; goals: Record<string, number>; shareGoals: boolean };
const DAY = 86400000;
const ids = new Map(taxonomy.flatMap(axis => axis.muscleIds.map(id => [id, axis.id] as const)));
const object = (value: unknown): Record<string, any> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const array = (value: unknown): any[] => Array.isArray(value) ? value : [];
const numeric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Version 2 policy: timed work and an unlinked fractional set type have no set equivalence. */
export function volumeSetValid(value: unknown): boolean {
  const { plan: p, result: r } = object(value); const plan = object(p); const result = object(r); const performance = object(result.performance);
  return typeof plan.id === 'string' && !!plan.id && plan.type !== 'C' && result.setId === plan.id && result.performed === true
    && ['external-load', 'bodyweight', 'assisted'].includes(performance.mode) && ['kg', 'lb'].includes(performance.unit)
    && numeric(performance.reps) && Number.isInteger(performance.reps) && performance.reps > 0 && performance.durationSeconds === undefined
    && (performance.mode === 'external-load' ? numeric(performance.load) && performance.load >= 0
      : performance.mode === 'bodyweight' ? numeric(performance.bodyweight) && (performance.bodyweight > 0 || performance.bodyweight === 0 && performance.bodyweightUnspecified === true)
      : numeric(performance.assistance) && performance.assistance >= 0);
}

export function validVolumeGoals(value: unknown): Record<string, number> {
  return Object.fromEntries(Object.entries(object(value)).filter(([id, n]) => taxonomy.some(axis => axis.id === id) && numeric(n) && n >= 0 && n <= 100));
}

/** Pure reference algorithm; SQL implements the same version and uses shared parity fixtures. */
export function deriveMuscleVolume(attempts: readonly WorkoutAttempt[], subjectId: string, days: VolumeDays = 28, now = Date.now()): MuscleVolume {
  const period = (start: number, end: number): VolumePeriod => {
    const axes = taxonomy.map(({ id, label }) => ({ id, label, direct: 0, indirect: 0, equivalent: 0, days: 0, effortCount: 0, rirCount: 0, rirSum: 0, rpeCount: 0, rpeSum: 0 }));
    const daySets = new Map(axes.map(axis => [axis.id, new Set<string>()]));
    const seen = new Set<string>(); let eligibleSets = 0; let unclassifiedSets = 0; let unsupportedSets = 0; let effortCount = 0;
    for (const raw of attempts) {
      const attempt = object(raw); const time = Date.parse(attempt.completedAt);
      if (attempt.owner !== subjectId || typeof attempt.id !== 'string' || !attempt.id || !Number.isFinite(time) || time < start || time >= end || seen.has(attempt.id)) continue;
      seen.add(attempt.id);
      for (const exercise of array(attempt.exercises)) {
        const catalog = array(object(exercise.catalog).muscleParticipations);
        const attribution = object(exercise.attribution);
        const participations = catalog.length ? catalog : [
          ...(attribution.primary ? [{ muscleGroupId: attribution.primary, role: 'Principal' }] : []),
          ...array(attribution.secondary).map(muscleGroupId => ({ muscleGroupId, role: 'Secundario' })),
        ];
        const roles = new Map<string, number>(); let unknown = !participations.length;
        for (const rawParticipation of participations) {
          const participation = object(rawParticipation); const id = ids.get(participation.muscleGroupId);
          if (!id || !['Principal', 'Secundario'].includes(participation.role)) { unknown = true; continue; }
          roles.set(id, Math.max(roles.get(id) ?? 0, participation.role === 'Principal' ? 1 : .5));
        }
        const seenSets = new Set<string>(); const seenDrops = new Set<string>();
        for (const rawSet of array(exercise.sets)) {
          const set = object(rawSet); const plan = object(set.plan); const result = object(set.result);
          if (typeof plan.id !== 'string' || seenSets.has(plan.id)) continue;
          seenSets.add(plan.id);
          if (!volumeSetValid(set)) {
            if (plan.type !== 'C' && result.performed === true && result.setId === plan.id && numeric(object(result.performance).durationSeconds) && object(result.performance).durationSeconds > 0) unsupportedSets++;
            continue;
          }
          if (numeric(plan.type) && !Number.isInteger(plan.type) && !plan.dropGroupId) { unsupportedSets++; continue; }
          if (typeof plan.dropGroupId === 'string' && plan.dropGroupId) {
            if (seenDrops.has(plan.dropGroupId)) continue;
            seenDrops.add(plan.dropGroupId);
          }
          eligibleSets++; if (unknown) unclassifiedSets++;
          const effort = object(result.actualEffort);
          const kind = numeric(effort.value) && Number.isInteger(effort.value) && ((effort.kind === 'rir' && effort.value >= 0 && effort.value <= 5) || (effort.kind === 'rpe' && effort.value >= 6 && effort.value <= 10)) ? effort.kind : null;
          if (kind) effortCount++;
          for (const [id, weight] of roles) {
            const axis = axes.find(axis => axis.id === id)!;
            if (weight === 1) axis.direct++; else axis.indirect++;
            axis.equivalent += weight; daySets.get(id)!.add(new Date(time).toISOString().slice(0, 10));
            if (kind) { axis.effortCount++; if (kind === 'rir') { axis.rirCount++; axis.rirSum += effort.value; } else { axis.rpeCount++; axis.rpeSum += effort.value; } }
          }
        }
      }
    }
    for (const axis of axes) axis.days = daySets.get(axis.id)!.size;
    return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), axes, eligibleSets, unclassifiedSets, unsupportedSets, effortCount };
  };
  return { metricVersion: 2, taxonomyVersion: 1, subjectId, asOf: new Date(now).toISOString(), days, coverage: 'unknown', current: period(now - days * DAY, now), previous: period(now - 2 * days * DAY, now - days * DAY), goals: {}, shareGoals: false };
}

export function weeklyVolumeEntries(volume: MuscleVolume, previous = false) {
  return volume[previous ? 'previous' : 'current'].axes.map(axis => ({ id: axis.id, label: axis.label, value: axis.equivalent * 7 / volume.days }));
}

/** Personal/private goals never change the scale of the shared recorded volume. */
export function muscleVolumeScale(volume: MuscleVolume) {
  return Math.max(5, Math.ceil(Math.max(...weeklyVolumeEntries(volume).map(a => a.value), ...weeklyVolumeEntries(volume,true).map(a => a.value),0)/5)*5);
}
