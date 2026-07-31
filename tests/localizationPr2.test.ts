import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const sources = [
  'app/_layout.tsx',
  'app/(tabs)/_layout.tsx',
  'app/(tabs)/exercises/index.tsx',
  'app/(tabs)/routines/index.tsx',
  'app/exercise/create.tsx',
  'app/routine/[id].tsx',
  'app/routine/create.tsx',
  'app/routine/execute/[id].tsx',
  'components/ExercisePicker.tsx',
  'components/LogoutButton.tsx',
  'components/login/DualLoginHeader.tsx',
  'components/login/LoginFormPanel.tsx',
  'constants/muscleGroups.ts',
  'utils/decimalInput.ts',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');

describe('PR2 Spanish navigation, training, and catalog copy', () => {
  test('contains no reviewed English or regional interface copy', () => {
    const forbidden = [
      'Full Body', 'Push Day', 'Could not save workout',
      'Your workout was not completed', 'Entrar al gym', 'Mismo gym',
      'Intentá nuevamente', 'Ingresá un nombre', 'Seleccioná al menos',
      'Solo podés editar', 'Podés guardar', '>Reps<', '>Reps al fallo<', 'Sin reps',
    ];

    for (const copy of forbidden) expect(sources).not.toContain(copy);
  });

  test('preserves routes, catalog identity, set types, and numeric parsing', () => {
    for (const value of [
      "name=\"routine/execute/[id]\"", "'/routine/create'", "'/exercise/create'",
      "value: 'fullBody'", "normalized === 'C' || normalized === 'F'",
      "normalizeDecimalInput(draftWeights[set.id] ?? '')", "parseInt(text, 10) || 0",
    ]) expect(sources).toContain(value);
  });
});
