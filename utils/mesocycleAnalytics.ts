import { CurrentMesocycleStatus, MESOCYCLE_STATUSES, MesocycleStatus } from '../types';

export interface MesocycleDateRange {
  startDate: string;
  endDate: string;
  dayCount: number;
}

export interface MesocycleStatusCopy {
  label: string;
  description: string;
  accessibilityLabel: string;
}

export type MesocycleTemporalLabel = 'upcoming' | 'in-progress' | 'ended' | 'undated';

type SupportedMesocycleStatus = CurrentMesocycleStatus | MesocycleStatus;

export interface MesocycleAnalyticsInput {
  id: string;
  status: SupportedMesocycleStatus;
  startDate?: string;
  durationWeeks: number;
}

const TERMINAL_STATUSES: readonly SupportedMesocycleStatus[] = ['completed', 'cancelled', 'archived'];

const STATUS_COPY: Readonly<Record<SupportedMesocycleStatus, MesocycleStatusCopy>> = {
  draft: {
    label: 'Borrador',
    description: 'Este mesociclo todavía está en preparación.',
    accessibilityLabel: 'Estado: borrador',
  },
  scheduled: {
    label: 'Programado',
    description: 'Este mesociclo comenzará en la fecha programada.',
    accessibilityLabel: 'Estado: programado',
  },
  active: {
    label: 'Activo',
    description: 'Este es el mesociclo que está en curso.',
    accessibilityLabel: 'Estado: activo',
  },
  completed: {
    label: 'Completado',
    description: 'Este mesociclo ya finalizó.',
    accessibilityLabel: 'Estado: completado',
  },
  paused: {
    label: 'Pausado',
    description: 'Este mesociclo está detenido temporalmente.',
    accessibilityLabel: 'Estado: pausado',
  },
  cancelled: {
    label: 'Cancelado',
    description: 'Este mesociclo no continuará.',
    accessibilityLabel: 'Estado: cancelado',
  },
  archived: {
    label: 'Archivado',
    description: 'Este es un mesociclo histórico.',
    accessibilityLabel: 'Estado: archivado',
  },
};

function parseCivilDate(value: string | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1])
    && date.getMonth() === Number(match[2]) - 1
    && date.getDate() === Number(match[3])
    ? date
    : null;
}

function formatCivilDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function compareCivilDates(left: string, right: string): number {
  return left.localeCompare(right);
}

export function isCurrentMesocycleStatus(status: string): status is CurrentMesocycleStatus {
  return (MESOCYCLE_STATUSES as readonly string[]).includes(status);
}

export function isTerminalMesocycleStatus(status: SupportedMesocycleStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** Returns an inclusive calendar range, or null when a plan has no valid dated duration. */
export function deriveMesocycleDateRange(mesocycle: Pick<MesocycleAnalyticsInput, 'startDate' | 'durationWeeks'>): MesocycleDateRange | null {
  const start = parseCivilDate(mesocycle.startDate);
  if (!start || !Number.isInteger(mesocycle.durationWeeks) || mesocycle.durationWeeks <= 0) return null;

  const dayCount = mesocycle.durationWeeks * 7;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + dayCount - 1, 12);
  return { startDate: formatCivilDate(start), endDate: formatCivilDate(end), dayCount };
}

export function deriveMesocycleTemporalLabel(
  mesocycle: Pick<MesocycleAnalyticsInput, 'startDate' | 'durationWeeks'>,
  today = new Date(),
): MesocycleTemporalLabel {
  const range = deriveMesocycleDateRange(mesocycle);
  if (!range || Number.isNaN(today.getTime())) return 'undated';

  const current = formatCivilDate(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12));
  if (compareCivilDates(current, range.startDate) < 0) return 'upcoming';
  if (compareCivilDates(current, range.endDate) > 0) return 'ended';
  return 'in-progress';
}

/** Checks an inclusive date range against dated, non-terminal mesocycles other than itself. */
export function findOverlappingMesocycle<T extends MesocycleAnalyticsInput>(
  candidate: T,
  mesocycles: readonly T[],
): T | undefined {
  const candidateRange = deriveMesocycleDateRange(candidate);
  if (!candidateRange || isTerminalMesocycleStatus(candidate.status)) return undefined;

  return mesocycles.find((mesocycle) => {
    if (mesocycle.id === candidate.id || isTerminalMesocycleStatus(mesocycle.status)) return false;
    const range = deriveMesocycleDateRange(mesocycle);
    return !!range
      && compareCivilDates(candidateRange.startDate, range.endDate) <= 0
      && compareCivilDates(range.startDate, candidateRange.endDate) <= 0;
  });
}

/** Returns a new stable list with active mesocycles ahead of every other status. */
export function sortMesocyclesActiveFirst<T extends Pick<MesocycleAnalyticsInput, 'status'>>(mesocycles: readonly T[]): T[] {
  return mesocycles
    .map((mesocycle, index) => ({ mesocycle, index }))
    .sort((left, right) => {
      const priority = Number(right.mesocycle.status === 'active') - Number(left.mesocycle.status === 'active');
      return priority || left.index - right.index;
    })
    .map(({ mesocycle }) => mesocycle);
}

export function getMesocycleStatusCopy(status: SupportedMesocycleStatus): MesocycleStatusCopy {
  return STATUS_COPY[status];
}
