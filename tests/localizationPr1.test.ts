import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const sources = [
  'app/(tabs)/progress.tsx',
  'app/session/[id].tsx',
  'components/progress/Filters.tsx',
  'components/LineChart.tsx',
  'context/DataContext.tsx',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');

describe('PR1 Spanish progress and history copy', () => {
  test('contains no reviewed reachable English copy', () => {
    const forbidden = [
      'Resolve legacy workout history',
      'Search historical options',
      'Clear filter',
      'Weighted muscle exposure',
      '>History<',
      'Edit workout',
      'Loading workout...',
      'Workout not found',
      'Session details',
      'Save changes',
      'Delete workout',
      'Workout session not found.',
    ];

    for (const copy of forbidden) expect(sources).not.toContain(copy);
  });

  test('preserves technical values and accepted format tokens', () => {
    for (const value of [
      "'overview'", "'external-load'", "'bodyweight'",
      "resolveQuarantine('assign')", "resolveQuarantine('delete')",
      "pathname: '/session/[id]'", 'YYYY-MM-DD', 'HH:MM',
    ]) expect(sources).toContain(value);
  });
});
