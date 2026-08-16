import { Routine } from '../types';

export type RoutineLibrarySection = 'owned' | 'shared';

export interface RoutineLibraryGroup {
  key: RoutineLibrarySection;
  items: Routine[];
}

function compareDatesDescending(left: string, right: string): number {
  return right.localeCompare(left);
}

/** Groups owned and accepted shared routine copies for the routine library. */
export function groupRoutinesForLibrary(routines: readonly Routine[]): RoutineLibraryGroup[] {
  const owned = routines.filter((routine) => !routine.sharedFrom)
    .sort((left, right) => compareDatesDescending(left.createdAt, right.createdAt));
  const shared = routines.filter((routine) => !!routine.sharedFrom)
    .sort((left, right) => compareDatesDescending(
      left.sharedFrom?.acceptedAt ?? left.createdAt,
      right.sharedFrom?.acceptedAt ?? right.createdAt,
    ));
  return [{ key: 'owned', items: owned }, { key: 'shared', items: shared }];
}
