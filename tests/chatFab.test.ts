import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { mockAlert, render } from './helpers/runtimeHarness';

const sendPartnerMessage = vi.hoisted(() => vi.fn());
vi.mock('../context/ShopContext', () => ({ useShop: () => ({ previewThemeId: null }) }));
vi.mock('../services/partnerMessages', () => ({ sendPartnerMessage }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

import { ChatFab } from '../components/ChatFab';

describe('ChatFab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('renders without KissProvider and sends through the typed service', async () => {
    sendPartnerMessage.mockResolvedValue(undefined);
    const fab = render(React.createElement(ChatFab, { recipientId: 'partner-1' }));
    const trigger = fab.root.findByProps({ accessibilityLabel: 'Mantener presionado para enviar mensajes' });

    act(() => { trigger.props.onLongPress(); });
    const kiss = fab.root.findByProps({ accessibilityLabel: 'Tu pareja te envía un beso 💋' });
    await act(async () => { await kiss.props.onPress(); });

    expect(sendPartnerMessage).toHaveBeenCalledWith('partner-1', 'kiss');
    expect(mockAlert.alert).toHaveBeenCalledWith('Beso enviado 💋', 'Enviado a tu Partner.');
  });

  test('keeps the visual interaction and reports an RPC failure', async () => {
    sendPartnerMessage.mockRejectedValue(new Error('partner message unavailable'));
    const fab = render(React.createElement(ChatFab, { recipientId: 'partner-1' }));
    act(() => { fab.root.findByProps({ accessibilityLabel: 'Mantener presionado para enviar mensajes' }).props.onLongPress(); });

    await act(async () => { await fab.root.findByProps({ accessibilityLabel: 'Tu pareja te envía un beso 💋' }).props.onPress(); });
    expect(mockAlert.alert).toHaveBeenCalledWith('Error', 'No se pudo enviar el mensaje. Revisa la conexión.');
  });
});
