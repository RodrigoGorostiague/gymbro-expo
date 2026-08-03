import {
  AttemptCompletion,
  AttemptFinalization,
  AttemptReward,
  AttemptSetPlan,
  AttemptSetResult,
  AttemptSetSnapshot,
  MuscleAttribution,
  MuscleGroup,
  RewardApplication,
  Routine,
  SetPerformance,
  UserProfile,
  WORKOUT_ATTEMPT_VERSION,
  WorkoutAttempt,
  WorkoutLineage,
  WorkoutSession,
} from '../types';

export interface AttemptCaptureInput { id: string; owner: UserProfile; routine: Routine; completedAt: string; durationSeconds: number;
  restTimerSeconds: number; results: Readonly<Record<string, { performed: boolean; reps: number; load: number }>>;
  lineage?: WorkoutLineage; jointWorkoutId?: string }

function isValidLineage(lineage?: WorkoutLineage): lineage is WorkoutLineage {
  return !!lineage
    && lineage.mesocycleId.trim().length > 0
    && Number.isInteger(lineage.weekNumber)
    && lineage.weekNumber > 0
    && lineage.plannedSessionId.trim().length > 0;
}

export function createWorkoutAttempt(input: AttemptCaptureInput): WorkoutAttempt {
  const exercises = input.routine.exercises.map((exercise) => {
    const muscles = [...new Set(exercise.muscleGroups)].sort();
    const attribution = exercise.attribution ?? (muscles.length === 0 ? null : {
      primary: muscles[0], secondary: muscles.slice(1),
      weights: Object.fromEntries(muscles.map((muscle) => [muscle, 1])),
    });
    const mode = exercise.loadMode ?? 'external-load';
    const unit = exercise.loadUnit ?? 'kg';
    return { exerciseId: exercise.catalogExerciseId ?? exercise.id, recordedName: exercise.name, attribution,
      catalog: exercise.catalog ? {
        movementPattern: exercise.catalog.movementPattern,
        muscleParticipations: exercise.catalog.muscleParticipations.map((participation) => ({ ...participation })),
      } : undefined,
      sets: exercise.sets.map((set) => {
      const id = `${exercise.id}:${set.id}`;
      const actual = input.results[id];
      const performance = !actual?.performed ? null : mode === 'external-load'
        ? { mode, reps: actual.reps, load: actual.load, unit }
        : mode === 'bodyweight' ? { mode, reps: actual.reps, bodyweight: actual.load, unit }
          : { mode, reps: actual.reps, assistance: actual.load, unit };
      return {
        plan: { id, type: set.tipo, targetReps: set.tipo === 'F' ? undefined : set.reps, targetLoad: set.weight },
        result: { setId: id, performed: actual?.performed ?? false, performance },
      };
    }),
    };
  });
  const sets = exercises.flatMap((exercise) => exercise.sets);
  const { completion, reward } = finalizeAttempt(sets.map(({ plan }) => plan), sets.map(({ result }) => result));
  const lineage = isValidLineage(input.lineage) ? input.lineage : undefined;
  return { version: WORKOUT_ATTEMPT_VERSION, id: input.id, owner: input.owner, routineId: input.routine.id, recordedRoutineName: input.routine.name,
    completedAt: input.completedAt, durationSeconds: input.durationSeconds,
    restTimerSeconds: input.restTimerSeconds, lineage, ...(input.jointWorkoutId ? { jointWorkoutId: input.jointWorkoutId } : { recapPublicationKey: `${Date.now()}-${Math.random().toString(36).slice(2, 14)}` }), exercises, completion, reward,
    rewardApplication: { id: `${input.owner}:${input.id}:v${WORKOUT_ATTEMPT_VERSION}`, state: 'pending' } };
}

export function attemptToSession(attempt: WorkoutAttempt): WorkoutSession {
  return { id: attempt.id, routineId: attempt.routineId ?? '', routineName: attempt.recordedRoutineName,
    completedAt: attempt.completedAt, durationSeconds: attempt.durationSeconds, restTimerSeconds: attempt.restTimerSeconds,
    lineage: attempt.lineage, recapPublicationKey: attempt.recapPublicationKey,
    exercises: attempt.exercises.map((exercise, exerciseIndex) => ({
      exerciseId: exercise.exerciseId ?? `unknown-${exerciseIndex}`,
      catalogExerciseId: exercise.exerciseId ?? undefined, name: exercise.recordedName,
      muscleGroupIds: exercise.attribution
        ? [exercise.attribution.primary, ...exercise.attribution.secondary]
        : [],
      sets: exercise.sets.map(({ plan, result }) => {
        const performance = result.performance;
        const weight = !performance ? 0 : performance.mode === 'external-load'
          ? performance.load : performance.mode === 'bodyweight' ? performance.bodyweight : performance.assistance;
        return { setId: plan.id, weight, reps: performance?.reps ?? 0, completed: result.performed };
      }),
    })) };
}

export function applySessionEdits(attempt: WorkoutAttempt, edited: WorkoutSession): WorkoutAttempt {
  const original = attemptToSession(attempt);
  if (edited.id !== original.id || edited.routineId !== original.routineId || edited.routineName !== original.routineName
    || edited.exercises.length !== original.exercises.length) throw new Error('La estructura del intento de entrenamiento es inmutable.');
  const exercises = attempt.exercises.map((exercise, exerciseIndex) => ({
    ...exercise,
    sets: exercise.sets.map(({ plan, result }, setIndex) => {
      const nextExercise = edited.exercises[exerciseIndex];
      const next = nextExercise?.sets[setIndex];
      if (nextExercise?.exerciseId !== original.exercises[exerciseIndex].exerciseId || next?.setId !== plan.id) {
        throw new Error('La estructura del intento de entrenamiento es inmutable.');
      }
      const performance = result.performance && ({ ...result.performance, reps: next.reps,
        ...(result.performance.mode === 'external-load' ? { load: next.weight }
          : result.performance.mode === 'bodyweight' ? { bodyweight: next.weight } : { assistance: next.weight }) });
      return { plan, result: { setId: plan.id, performed: next.completed, performance } };
    }),
  }));
  return { ...attempt, completedAt: edited.completedAt, durationSeconds: edited.durationSeconds,
    restTimerSeconds: edited.restTimerSeconds, exercises };
}

export function isValidPerformance(value: SetPerformance): boolean {
  if (!Number.isInteger(value.reps) || value.reps <= 0 || !['kg', 'lb'].includes(value.unit)) return false;
  if (value.mode === 'external-load') return Number.isFinite(value.load) && value.load >= 0;
  if (value.mode === 'bodyweight') return Number.isFinite(value.bodyweight) && value.bodyweight > 0;
  return Number.isFinite(value.assistance) && value.assistance >= 0;
}

export function calculateCompletion(
  plans: readonly AttemptSetPlan[],
  results: readonly AttemptSetResult[],
): AttemptCompletion {
  const resultsById = new Map<string, AttemptSetResult | null>();
  results.forEach((result) => {
    resultsById.set(result.setId, resultsById.has(result.setId) ? null : result);
  });
  const visitedPlanIds = new Set<string>();
  const validSets = plans.filter((plan) => {
    if (visitedPlanIds.has(plan.id)) return false;
    visitedPlanIds.add(plan.id);
    const result = resultsById.get(plan.id);
    return result?.performed && result.performance && isValidPerformance(result.performance);
  }).length;
  const adherence = plans.length === 0 ? 0 : validSets / plans.length;
  const status = adherence < 0.7 ? 'partial' : adherence < 1 ? 'completed' : 'fully-completed';
  return { validSets, plannedSets: plans.length, adherence, displayPercent: Math.round(adherence * 100), status };
}

export function finalizeAttempt(
  plans: readonly AttemptSetPlan[],
  results: readonly AttemptSetResult[],
  setGemValue = 1,
  completionGemValue = 5,
): AttemptFinalization {
  const completion = calculateCompletion(plans, results);
  return {
    completion,
    reward: calculateReward(completion, setGemValue, completionGemValue),
  };
}

export function calculateReward(
  completion: AttemptCompletion,
  setGemValue = 1,
  completionGemValue = 5,
): AttemptReward {
  const setGems = completion.validSets * setGemValue;
  const qualifiesForCompletion = completion.adherence >= 0.7;
  const completionGems = qualifiesForCompletion ? completionGemValue : 0;
  const fullCompletionBonus = completion.status === 'fully-completed'
    ? Math.floor((setGems + completionGems) * 0.25 + 0.5)
    : 0;
  return { setGems, completionGems, fullCompletionBonus, totalGems: setGems + completionGems + fullCompletionBonus, qualifiesForCompletion };
}

export function getGrantableGems(reward: AttemptReward, application: RewardApplication): number {
  return application.state === 'applied' ? 0 : reward.totalGems;
}

export function validateAttribution(attribution: MuscleAttribution): boolean {
  const muscles = [attribution.primary, ...attribution.secondary];
  if (new Set(muscles).size !== muscles.length) return false;
  return Object.entries(attribution.weights ?? {}).every(
    ([muscle, weight]) => muscles.includes(muscle as MuscleGroup)
      && weight !== undefined
      && Number.isFinite(weight)
      && weight >= 0,
  );
}

export function getWeightedExposure(
  attribution: MuscleAttribution,
  eligibleSets: number,
): Partial<Record<MuscleGroup, number>> {
  if (!validateAttribution(attribution) || !Number.isInteger(eligibleSets) || eligibleSets < 0) {
    throw new Error('La atribución muscular o la cantidad de series elegibles no es válida.');
  }
  return Object.fromEntries(
    [attribution.primary, ...attribution.secondary].map((muscle, index) => [
      muscle,
      eligibleSets * (attribution.weights?.[muscle] ?? (index === 0 ? 1 : 0.4)),
    ]),
  );
}

export function getEligiblePerformances(
  sets: readonly AttemptSetSnapshot[],
): SetPerformance[] {
  return sets.flatMap(({ plan, result }) => {
    if (
      plan.type === 'C'
      || result.setId !== plan.id
      || !result.performed
      || !result.performance
      || !isValidPerformance(result.performance)
    ) return [];
    return [result.performance];
  });
}

export function getExerciseExposure(
  attribution: MuscleAttribution,
  sets: readonly AttemptSetSnapshot[],
): Partial<Record<MuscleGroup, number>> {
  return getWeightedExposure(attribution, getEligiblePerformances(sets).length);
}

export function areCompatibleObservations(
  exerciseIdA: string | null,
  a: SetPerformance,
  exerciseIdB: string | null,
  b: SetPerformance,
): boolean {
  return exerciseIdA !== null && exerciseIdA === exerciseIdB && a.mode === b.mode && a.unit === b.unit
    && isValidPerformance(a) && isValidPerformance(b);
}
