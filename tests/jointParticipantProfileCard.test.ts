import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from './helpers/runtimeHarness';
import { JointParticipantProfileCard } from '../components/JointParticipantProfileCard';

describe('JointParticipantProfileCard', () => {
  test.each([
    ['invited', 'Invitado', '#A3A3A3'],
    ['declined', 'Declinó', '#EF4444'],
    ['active', 'Activo', '#F48C06'],
    ['completed', 'Completó', '#F48C06'],
  ] as const)('renders the %s participant state with its badge and palette', (status, badge, accent) => {
    const card = render(React.createElement(JointParticipantProfileCard, {
      participant: { id: 'member-1', alias: 'Capy', avatarId: 'capigirl', status, themeId: 'profile-rodaja' },
    }));

    expect(card.root.findByProps({ accessibilityLabel: `Participante Capy: ${badge}` })).toBeTruthy();
    expect(card.root.findAll((node) => (node.type as any) === 'Text' && node.children.join('') === badge)).toHaveLength(1);
    expect(JSON.stringify(card.toJSON())).toContain(accent);
  });

  test('acts as an accessible selection control when pressed', () => {
    const onPress = vi.fn();
    const card = render(React.createElement(JointParticipantProfileCard, {
      participant: { id: 'member-1', alias: 'Capy', avatarId: 'capigirl', status: 'active', themeId: 'profile-rodaja' },
      onPress,
      selected: true,
    }));

    const control = card.root.findByProps({ accessibilityLabel: 'Participante Capy: Activo' });
    expect(control.props.accessibilityState).toEqual({ selected: true });
    control.props.onPress();
    expect(onPress).toHaveBeenCalledOnce();
  });
});
