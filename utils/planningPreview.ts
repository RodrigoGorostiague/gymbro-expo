import { MesocycleWeek, Routine } from '../types';
import { snapshotPlannedRoutine } from './mesocycles';
/** An explicit seven-day template. Null means unplanned; rest is a deliberate choice. */
export type PlanningDay = string | null;
export const REST_DAY = '__rest__';
export function buildGuidedWeeks(duration: number, days: readonly PlanningDay[], routines: readonly Routine[], id: () => string): MesocycleWeek[] {
    const last = days.findLastIndex((day) => day !== null);
    if (days.slice(0, last + 1).some((day) => day === null))
        throw new Error('Completa los días intermedios con una rutina o descanso antes de crear el bloque.');
    return Array.from({ length: duration }, (_, weekIndex) => ({ id: id(), weekNumber: weekIndex + 1, entries: days.slice(0, last + 1).map((day, index) => {
            if (day === REST_DAY)
                return { id: id(), kind: 'rest' as const };
            const routine = routines.find((candidate) => candidate.id === day);
            if (!routine)
                throw new Error('Una rutina seleccionada ya no está disponible. Revisa la semana.');
            return { id: id(), order: index + 1, planningState: 'pending' as const, ref: { routineId: routine.id, routineName: routine.name, source: routine.isShared ? 'shared' as const : 'local' as const, ...(routine.shareId ? { shareId: routine.shareId } : {}) }, routineSnapshot: snapshotPlannedRoutine(routine) };
        }) }));
}
