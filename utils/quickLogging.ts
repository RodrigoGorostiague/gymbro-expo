import { RoutineExercise, RoutineSet } from '../types';
import { actualEffortFields } from './actualEffort';
import { SessionSetValue } from './workoutDraft';
type Values = Readonly<Record<string, SessionSetValue>>;
type Completed = Readonly<Record<string, boolean>>;
const key = (exercise: RoutineExercise, set: RoutineSet) => `${exercise.id}-${set.id}`;
const effective = (set: RoutineSet) => typeof set.tipo === 'number' && set.tipo > 0 && !set.backoffGroupId && !set.dropGroupId && set.durationSeconds === undefined;
const done = (exercise: RoutineExercise, set: RoutineSet, completed: Completed) => set.completed === true || completed[key(exercise, set)] === true || completed[`${exercise.id}:${set.id}`] === true;
function validLoad(exercise: RoutineExercise, value: string | undefined): value is string {
  if (!value || !/^(?:\d+\.?\d*|\.\d+)$/.test(value.trim())) return false;
  const load = Number(value);
  return Number.isFinite(load) && load >= 0 && (exercise.loadMode !== 'bodyweight' || load > 0);
}

/** Explicit user action: copies numeric inputs, never plan/completion/effort metadata. */
export function copyPreviousSeries(exercise: RoutineExercise, id: string, values: Values, completed: Completed): Record<string, SessionSetValue> | null {
  const index = exercise.sets.findIndex((set) => set.id === id);
  const current = exercise.sets[index]; const previous = exercise.sets[index - 1];
  if (!current || !previous || !effective(current) || !effective(previous) || current.loadBasis !== previous.loadBasis || done(exercise, current, completed)) return null;
  const source = values[key(exercise, previous)];
  if (!validLoad(exercise, source?.weight) || typeof source.reps !== 'string' || !/^\d+$/.test(source.reps.trim()) || !Number.isSafeInteger(Number(source.reps)) || Number(source.reps) <= 0) return null;
  return { ...values, [key(exercise, current)]: { weight: String(Number(source.weight)), reps: String(Number(source.reps)), ...actualEffortFields(values[key(exercise, current)]?.actualEffort) } };
}

/** Only later unfinished ordinary sets are eligible; load ramps/backoffs remain untouched. */
export function applyLoadToRemaining(exercise: RoutineExercise, id: string, values: Values, completed: Completed): Record<string, SessionSetValue> | null {
  const index = exercise.sets.findIndex((set) => set.id === id); const current = exercise.sets[index];
  if (!current || !effective(current) || done(exercise, current, completed)) return null;
  const load = values[key(exercise, current)]?.weight;
  if (!validLoad(exercise, load)) return null;
  const targets = exercise.sets.slice(index + 1).filter((set) => effective(set) && set.loadBasis === current.loadBasis && !done(exercise, set, completed));
  if (!targets.length) return null;
  const next = { ...values };
  for (const set of targets) {
    const id = key(exercise, set);
    next[id] = { ...(values[id] ?? { weight: '', reps: '' }), weight: String(Number(load)) };
  }
  return next;
}
