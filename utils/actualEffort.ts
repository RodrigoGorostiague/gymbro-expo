import type { ActualEffort } from '../types';

/** Validates an explicitly recorded result, never derives one from a prescription. */
export function readActualEffort(value: unknown): ActualEffort | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).some((key) => key !== 'kind' && key !== 'value') || !Number.isInteger(item.value)) return undefined;
  if (item.kind === 'rir' && Number(item.value) >= 0 && Number(item.value) <= 5) return { kind: 'rir', value: item.value as 0 | 1 | 2 | 3 | 4 | 5 };
  if (item.kind === 'rpe' && Number(item.value) >= 6 && Number(item.value) <= 10) return { kind: 'rpe', value: item.value as 6 | 7 | 8 | 9 | 10 };
  return undefined;
}
export function actualEffortFields(value: unknown): { actualEffort?: ActualEffort } {
  const actualEffort = readActualEffort(value);
  return actualEffort ? { actualEffort } : {};
}

/** Separate scales; never average RIR and RPE or include unperformed sets. */
export function actualEffortMetrics(exercises: readonly { sets: readonly { completed: boolean; actualEffort?: unknown }[] }[]): Record<string, number> {
  const metrics: Record<string, number> = {};
  const efforts = exercises.flatMap(({ sets }) => sets.flatMap((set) => {
    const effort = set.completed ? readActualEffort(set.actualEffort) : undefined;
    return effort ? [effort] : [];
  }));
  for (const kind of ['rir', 'rpe'] as const) {
    const values = efforts.filter((effort) => effort.kind === kind).map(({ value }) => value);
    if (!values.length) continue;
    const prefix = kind === 'rir' ? 'actualRir' : 'actualRpe';
    metrics[`${prefix}Min`] = Math.min(...values);
    metrics[`${prefix}Max`] = Math.max(...values);
    metrics[`${prefix}Count`] = values.length;
  }
  return metrics;
}

export function actualEffortSummary(metrics: Readonly<Record<string, number>>) {
  return (['rir', 'rpe'] as const).flatMap((kind) => {
    const prefix = kind === 'rir' ? 'actualRir' : 'actualRpe';
    const min = metrics[`${prefix}Min`], max = metrics[`${prefix}Max`], count = metrics[`${prefix}Count`];
    if (!Number.isInteger(count) || count <= 0 || count > 10000 || !readActualEffort({ kind, value: min }) || !readActualEffort({ kind, value: max }) || min > max) return [];
    return [{ kind, min, max, count }];
  });
}
