import { beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../services/supabase', () => ({ supabase: { rpc }, supabaseConfigurationError: null }));

import { sendPartnerMessage } from '../services/partnerMessages';

describe('Partner message service boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  test('sends only recipient and a bounded message type to the server-owned RPC', async () => {
    rpc.mockResolvedValue({ error: null });

    await expect(sendPartnerMessage('partner-1', 'muscle')).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('send_partner_message', { recipient: 'partner-1', message_type: 'muscle' });
  });

  test('surfaces server authorization errors without a provider dependency', async () => {
    rpc.mockResolvedValue({ error: { message: 'partner message unavailable' } });

    await expect(sendPartnerMessage('bro-1', 'kiss')).rejects.toThrow('partner message unavailable');
  });
});
