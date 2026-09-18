import type { WorkoutSession, Routine } from '../types';
/** Count performed work, never turn skipped sets into completed work or sum unlike load modes. */
export function workoutFacts(session: WorkoutSession) {
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const completed = sets.filter((set) => set.completed);
  return { totalSets: sets.length, completedSets: completed.length,
    repetitions: completed.reduce((total, set) => total + (Number.isFinite(set.reps) ? set.reps : 0), 0),
    completedExercises: session.exercises.filter((exercise) => exercise.sets.some((set) => set.completed)).length,
    full: sets.length > 0 && completed.length === sets.length };
}
export function nextWorkoutSet(routine: Routine, completed: Record<string, boolean>) {
  for (const exercise of routine.exercises) {
    const index = exercise.sets.findIndex((set) => !completed[`${exercise.id}-${set.id}`]);
    if (index >= 0) return { exerciseId: exercise.id, exerciseName: exercise.name, setId: exercise.sets[index].id, setIndex: index };
  }
  return null;
}
export function workoutShareText(session: WorkoutSession) {
  const facts = workoutFacts(session);
  return `${session.routineName}\n${facts.completedSets}/${facts.totalSets} series · ${Math.round(session.durationSeconds / 60)} min\nEntrenamiento registrado en GymBro`;
}
