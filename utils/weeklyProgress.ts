import { LoadUnit, Mesocycle, UserProfile, WorkoutAttempt } from '../types';
import { selectTrainingStatistics, sumAttemptDurationSeconds } from './analytics';
import { deriveMesocycleAdherence, derivePlannedEntryDate, flattenMesocycleEntries } from './mesocycles';
import { calculateCompletion, getEligiblePerformances } from './workoutAttempts';
import { readActualEffort } from './actualEffort';

/** Per-set means on separate scales; prescribed effort is never a recorded result. */
function summarizeActualEffort(attempts: readonly WorkoutAttempt[]) {
  const totals = { rir: { count: 0, sum: 0 }, rpe: { count: 0, sum: 0 } };
  let eligibleSets = 0;
  for (const attempt of attempts) for (const exercise of attempt.exercises) for (const set of exercise.sets) {
    if (getEligiblePerformances([set]).length === 0) continue;
    eligibleSets += 1;
    const effort = readActualEffort(set.result.actualEffort);
    if (!effort) continue;
    totals[effort.kind].count += 1;
    totals[effort.kind].sum += effort.value;
  }
  const average = ({ count, sum }: { count: number; sum: number }) => ({ count, average: count ? sum / count : null });
  return { eligibleSets, rir: average(totals.rir), rpe: average(totals.rpe) };
}

const localDay = (date: Date, offset = 0) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** Current partial calendar week versus the previous full week; never a percentage comparison. */
export function selectWeeklyProgress(attempts: readonly WorkoutAttempt[], owner: UserProfile, mesocycles: readonly Mesocycle[], now = new Date()) {
  const monday = localDay(now, -((now.getDay() + 6) % 7));
  const seen = new Set<string>();
  const saved = attempts.filter((attempt) => {
    if (attempt.owner !== owner || attempt.rewardApplication.state !== 'applied' || seen.has(attempt.id)
      || !Number.isFinite(Date.parse(attempt.completedAt)) || Date.parse(attempt.completedAt) > now.getTime()) return false;
    seen.add(attempt.id);
    return true;
  });
  const summarize = (start: Date, end: Date, cutoff: Date) => {
    const eligible = saved.filter((attempt) => Date.parse(attempt.completedAt) < cutoff.getTime());
    const inWeek = eligible.filter((attempt) => Date.parse(attempt.completedAt) >= start.getTime());
    const statistics = selectTrainingStatistics(inWeek, owner, start, cutoff);
    // Partition inputs, not formulas: the existing weighted-volume selector has no unit dimension.
    const muscleVolumes = Object.fromEntries((['kg', 'lb'] as LoadUnit[]).map((unit) => {
      const partition = inWeek.map((attempt) => ({ ...attempt, exercises: attempt.exercises.map((exercise) => ({
        ...exercise, sets: exercise.sets.filter(({ result }) => result.performance?.mode === 'external-load' && result.performance.unit === unit),
      })) }));
      return [unit, selectTrainingStatistics(partition, owner, start, cutoff).muscles];
    }));
    let planned = 0; let completed = 0; let scheduleAvailable = false; let missingSchedule = false;
    const seenSlots = new Set<string>();
    for (const mesocycle of mesocycles) {
      if (mesocycle.status === 'draft') continue;
      const adherence = deriveMesocycleAdherence(mesocycle, eligible);
      for (const { entry, dayOffset, weekNumber } of flattenMesocycleEntries(mesocycle)) {
        if ('kind' in entry || weekNumber < 1 || weekNumber > mesocycle.durationWeeks) continue;
        const date = derivePlannedEntryDate(mesocycle, entry.id, dayOffset);
        if (!date) { missingSchedule = true; continue; }
        if (date < start || date >= end) continue;
        scheduleAvailable = true;
        const key = JSON.stringify([mesocycle.id, weekNumber, entry.id]);
        if (seenSlots.has(key)) continue;
        seenSlots.add(key);
        const state = adherence.weeks.find((week) => week.weekNumber === weekNumber)?.sessionStates.find((state) => state.plannedSessionId === entry.id);
        if (!state || ['cancelled', 'rescheduled', 'skipped'].includes(state.status)) continue;
        planned += 1;
        if (state.status === 'completed') completed += 1;
      }
    }
    // Absence is unknown, not zero. Never reconstruct prescriptions from today's routine.
    const durationKnown = inWeek.length > 0 && inWeek.every((attempt) => Number.isFinite(attempt.durationSeconds) && attempt.durationSeconds >= 0);
    const snapshotsKnown = inWeek.length > 0 && inWeek.every((attempt) => attempt.exercises.length > 0
      && attempt.exercises.every((exercise) => exercise.sets.length > 0));
    const omittedExercises = snapshotsKnown ? inWeek.reduce((total, attempt) => total + attempt.exercises.filter((exercise) => {
      // Completion includes warmups: an exercise with any valid performed set is not wholly omitted.
      return calculateCompletion(exercise.sets.map(({ plan }) => plan), exercise.sets.map(({ result }) => result)).validSets === 0;
    }).length, 0) : null;
    const durationSeconds = durationKnown ? sumAttemptDurationSeconds(inWeek) : null;
    // A ratio of totals, never an average of session rates or an estimate of active lifting time.
    const density = snapshotsKnown && durationSeconds !== null && Number.isFinite(durationSeconds)
      && durationSeconds > 0 && inWeek.every((attempt) => attempt.durationSeconds > 0)
      ? statistics.effectiveSets / (durationSeconds / 3600) : null;
    const densitySetsPerHour = Number.isFinite(density) ? density : null;
    return {
      start, end, statistics, muscleVolumes,
      durationSeconds, densitySetsPerHour,
      actualEffort: summarizeActualEffort(inWeek),
      omittedExercises,
      sessions: inWeek.filter((attempt) => attempt.completion.status !== 'partial').length,
      frequency: new Set(inWeek.filter((attempt) => attempt.exercises.some((exercise) => getEligiblePerformances(exercise.sets).length > 0)).map((attempt) => dayKey(new Date(attempt.completedAt)))).size,
      planning: scheduleAvailable && !missingSchedule ? { planned, completed } : null,
    };
  };
  return {
    current: summarize(monday, localDay(monday, 7), new Date(now.getTime() + 1)),
    previous: summarize(localDay(monday, -7), monday, monday),
  };
}
