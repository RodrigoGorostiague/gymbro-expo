import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const sources = [
  'app/(tabs)/shop.tsx',
  'components/ChatFab.tsx',
  'components/CombineWithPartnerCard.tsx',
  'components/ThemePreviewBar.tsx',
  'constants/encouragement.ts',
  'constants/kiss.ts',
  'constants/shopThemes.ts',
  'constants/welcome.ts',
  'context/KissContext.tsx',
  'context/DataContext.tsx',
  'context/ShareContext.tsx',
  'context/ShopContext.tsx',
  'services/shareSync.ts',
  'types/index.ts',
  'utils/storage.ts',
  'utils/workoutAttempts.ts',
].map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n');

describe('PR3 Spanish shop, partner, sharing, and final copy audit', () => {
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

  test('preserves profiles, theme IDs, share states, routes, and parser behavior', () => {
    for (const value of [
      "'rodaja'", "'brisas'", "id: 'white'", "id: 'black'",
      "status: 'pending' as const", "'routine_share'", "'profile-rodaja'",
    ]) expect(sources).toContain(value);
  });
});
