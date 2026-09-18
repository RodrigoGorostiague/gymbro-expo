import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';

const client = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { getSession: vi.fn() },
  realtime: { setAuth: vi.fn() },
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../services/supabase', () => ({
  supabase: client,
  supabaseConfigurationError: null,
}));

import { runGraphCommand, subscribeToSocialGraphChanges } from '../services/socialGraph';

describe('Supabase social authorization boundary', () => {
  test('does not mount legacy Firebase partner providers in the authenticated tree', () => {
    const rootLayout = readFileSync(new URL('../app/_layout.tsx', import.meta.url), 'utf8');
    const tabsLayout = readFileSync(new URL('../app/(tabs)/_layout.tsx', import.meta.url), 'utf8');

    expect(rootLayout).not.toContain('KissProvider');
    expect(rootLayout).not.toContain('ShareProvider');
    expect(tabsLayout).not.toContain('ChatFab');
  });

  test('keeps legacy sharing out of active routine and data paths', () => {
    const dataContext = readFileSync(new URL('../context/DataContext.tsx', import.meta.url), 'utf8');
    const routinesScreen = readFileSync(new URL('../app/(tabs)/routines/index.tsx', import.meta.url), 'utf8');

    expect(dataContext).not.toContain('ShareContext');
    expect(dataContext).not.toContain('shareSync');
    expect(routinesScreen).not.toContain('useShare');
    expect(existsSync(new URL('../app/(tabs)/routines/pending-shares.tsx', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../components/ShareRoutineModal.tsx', import.meta.url))).toBe(false);
  });

  test('does not open a Realtime channel without an authenticated session', async () => {
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null });

    const unsubscribe = await subscribeToSocialGraphChanges(vi.fn());

    expect(client.realtime.setAuth).not.toHaveBeenCalled();
    expect(client.channel).not.toHaveBeenCalled();
    unsubscribe();
  });

  test('uses the trusted command boundary instead of direct graph-table writes', async () => {
    client.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { targetId: 'safe-target', relationshipKind: 'bro' }, error: null });

    await expect(runGraphCommand({ command: 'sendRequest', targetId: 'safe-target', relationshipKind: 'bro' })).resolves.toEqual({
      targetId: 'safe-target',
      relationshipKind: 'bro',
    });
    expect(client.rpc).toHaveBeenNthCalledWith(1, 'graph_send_request', { target: 'safe-target', requested_kind: 'bro' });
    expect(client.rpc).toHaveBeenNthCalledWith(2, 'graph_summary', { target: 'safe-target' });
  });
});
