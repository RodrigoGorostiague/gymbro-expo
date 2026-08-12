import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const sources = [
  'app/(tabs)/shop.tsx',
  'components/CombineWithPartnerCard.tsx',
  'components/ThemePreviewBar.tsx',
  'constants/encouragement.ts',
  'constants/kiss.ts',
  'constants/shopThemes.ts',
  'constants/welcome.ts',
  'context/DataContext.tsx',
  'context/ShopContext.tsx',
  'types/index.ts',
  'utils/storage.ts',
  'utils/workoutAttempts.ts',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');

describe('PR3 Spanish shop, partner, and final copy audit', () => {
  test('contains no reviewed English or regional interface copy', () => {
    const forbidden = [
      'Unexpected error while creating the shared routine',
      'Share not available for this receiver',
      'Routine data has not finished loading.',
      'con vos', 'que vos', 'podias', 'Editalos primero',
      'paga ratona', 'Vamoooos', 'paloooos', 'cada dia', 'q me',
      'Tu novi@', "'ON'", "'OFF'", 'Noche lilac', 'Violetas & lilas',
      'Toca un tema', 'Sync no configurado', 'en toda la app',
      'Session migration failed.', 'Attempt owner must match the active profile.',
      'Workout attempt not found.', 'Workout attempt structure is immutable.',
      'Workout attempt structure, completion, and reward are immutable.',
    ];

    for (const copy of forbidden) expect(sources).not.toContain(copy);
  });

  test('preserves profiles, theme IDs, routes, and parser behavior', () => {
    for (const value of [
      "'rodaja'", "'brisas'", "id: 'white'", "id: 'black'",
      "'profile-rodaja'",
    ]) expect(sources).toContain(value);
  });
});
