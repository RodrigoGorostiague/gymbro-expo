import { WorkoutSession } from '../types';

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
  exerciseName: string,
  limit = 10,
): ExerciseProgressPoint[] {
  const points: ExerciseProgressPoint[] = [];

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime(),
  );

  for (const session of sorted) {
    const exercise = session.exercises.find(
      (e) => e.name.toLowerCase() === exerciseName.toLowerCase(),
    );
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
