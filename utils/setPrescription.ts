import { RoutineExercise, RoutineSet } from '../types';

export function setLoadBasis(
  exercise: RoutineExercise,
  set: RoutineSet,
): NonNullable<RoutineSet['loadBasis']> {
  const mode = exercise.loadMode ?? exercise.definitionSnapshot?.loadMode;
  return (
    set.loadBasis ??
    (mode === 'bodyweight'
      ? 'bodyweight'
      : mode === 'assisted'
        ? 'assisted'
        : 'external')
  );
}
export function routineSetLabels(
  sets: readonly RoutineSet[],
): Record<string, string> {
  let effective = 0;
  const groups = new Map<string, { number: number; count: number }>();
  return Object.fromEntries(
    sets.map((set) => {
      if (set.dropGroupId) {
        const group = groups.get(set.dropGroupId) ?? {
          number: groups.size + 1,
          count: 0,
        };
        groups.set(set.dropGroupId, group);
        group.count++;
        return [set.id, `D${group.number}.${group.count}`];
      }
      return [
        set.id,
        typeof set.tipo === 'number' ? String(++effective) : set.tipo,
      ];
    }),
  );
}
/** Only adjacent members of the same drop block suppress the rest timer. */
export function continuesDropBlock(
  exercise: RoutineExercise,
  setId: string,
): boolean {
  const index = exercise.sets.findIndex((set) => set.id === setId);
  return (
    index >= 0 &&
    !!exercise.sets[index].dropGroupId &&
    exercise.sets[index].dropGroupId === exercise.sets[index + 1]?.dropGroupId
  );
}

/** Reordering a drop moves its complete block, keeping no-rest members adjacent. */
export function moveSetBlock(
  sets: RoutineSet[],
  setId: string,
  direction: -1 | 1,
): RoutineSet[] {
  const index = sets.findIndex((set) => set.id === setId);
  if (index < 0) return sets;
  const bounds = (at: number): [number, number] => {
    let start = at;
    let end = at + 1;
    const group = sets[at].dropGroupId;
    if (group) {
      while (start > 0 && sets[start - 1].dropGroupId === group) start--;
      while (end < sets.length && sets[end].dropGroupId === group) end++;
    }
    return [start, end];
  };
  const [start, end] = bounds(index);
  if (
    (direction === -1 && start === 0) ||
    (direction === 1 && end === sets.length)
  )
    return sets;
  if (direction === -1) {
    const [previous] = bounds(start - 1);
    return [
      ...sets.slice(0, previous),
      ...sets.slice(start, end),
      ...sets.slice(previous, start),
      ...sets.slice(end),
    ];
  }
  const [, next] = bounds(end);
  return [
    ...sets.slice(0, start),
    ...sets.slice(end, next),
    ...sets.slice(start, end),
    ...sets.slice(next),
  ];
}
