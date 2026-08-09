import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const { alert } = vi.hoisted(() => ({ alert: vi.fn() }));

vi.mock('react-native', async () => {
  const ReactModule = await import('react');
  const host = (name: string) => ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement(name, props, children);
  return {
    Alert: { alert },
    Pressable: host('Pressable'),
    StyleSheet: { create: <T,>(styles: T) => styles },
    Text: host('Text'),
    View: host('View'),
  };
});
vi.mock('@expo/vector-icons', async () => {
  const ReactModule = await import('react');
  return { Ionicons: (props: Record<string, unknown>) => ReactModule.createElement('Ionicons', props) };
});
vi.mock('../components/GlassCard', async () => {
  const ReactModule = await import('react');
  return { GlassCard: ({ children }: { children: React.ReactNode }) => ReactModule.createElement('GlassCard', null, children) };
});
vi.mock('../components/HapticPressable', async () => {
  const ReactModule = await import('react');
  return { HapticPressable: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => ReactModule.createElement('HapticPressable', props, children) };
});
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { accent: '#0ff', text: '#111', textMuted: '#666', glassBorder: '#ddd', onPrimary: '#fff' } }) }));

import { ActiveWorkoutCard } from '../components/ActiveWorkoutCard';
import { impactAsync, ImpactFeedbackStyle } from 'expo-haptics';

describe('ActiveWorkoutCard', () => {
  beforeEach(() => {
    alert.mockClear();
    vi.mocked(impactAsync).mockClear();
  });

  const draft = {
    version: 1 as const,
    owner: 'member-1',
    attemptId: 'attempt-1',
    routineId: 'routine-1',
    startedAtMs: Date.now() - 120_000,
    restTimerSeconds: 90,
    completedSets: { 'exercise-1-set-1': true },
    setValues: {},
    routineSnapshot: {
      id: 'routine-1', name: 'Torso', muscleGroups: [], createdAt: '', exercises: [{
        id: 'exercise-1', name: 'Press de banca', muscleGroups: [], variant: '', sets: [
          { id: 'set-1', tipo: 1 as const, weight: 40, reps: 8 },
          { id: 'set-2', tipo: 1 as const, weight: 40, reps: 8 },
        ],
      }],
    },
  };

  function renderCard() {
    const onContinue = vi.fn();
    const onCancel = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(React.createElement(ActiveWorkoutCard, { draft, onContinue, onCancel })); });
    return { onCancel, onContinue, tree };
  }

  test('shows the active routine, progress, next set, and its safe actions', () => {
    const { onCancel, onContinue, tree } = renderCard();

    const text = tree.root.findAll((node) => String(node.type) === 'Text').map((node) => node.children.join(''));
    expect(text).toEqual(expect.arrayContaining(['EN CURSO', 'Torso', 'Sigue: Press de banca · Serie 2', '1/2', 'Continuar', 'Cancelar']));
    act(() => { tree.root.find((node) => node.props.accessibilityLabel === 'Continuar entrenamiento').props.onPress(); });
    act(() => { tree.root.find((node) => node.props.accessibilityLabel === 'Cancelar entrenamiento').props.onPress(); });
    expect(onContinue).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test('continues on a normal press and exposes the long-press cancellation hint', () => {
    const { onContinue, tree } = renderCard();
    const continueButton = tree.root.find((node) => node.props.accessibilityLabel === 'Continuar entrenamiento');

    expect(continueButton.props.accessibilityHint).toContain('Mantené presionado para descartar');
    expect(continueButton.props.delayLongPress).toBe(800);
    act(() => { continueButton.props.onPress(); });

    expect(onContinue).toHaveBeenCalledOnce();
  });

  test('reverses an incomplete hold and preserves the normal continue action', () => {
    const { onContinue, tree } = renderCard();
    const continueButton = tree.root.find((node) => node.props.accessibilityLabel === 'Continuar entrenamiento');

    act(() => {
      continueButton.props.onPressIn();
      continueButton.props.onPressOut();
      continueButton.props.onPress();
    });

    expect(alert).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledOnce();
  });

  test('opens cancellation confirmation after a completed long press and suppresses continue', () => {
    const { onCancel, onContinue, tree } = renderCard();
    const continueButton = tree.root.find((node) => node.props.accessibilityLabel === 'Continuar entrenamiento');

    act(() => {
      continueButton.props.onPressIn();
      continueButton.props.onLongPress();
      continueButton.props.onPressOut();
      continueButton.props.onPress();
    });

    expect(alert).toHaveBeenCalledWith(
      '¿Cancelar entrenamiento?',
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: 'Seguir entrenando', style: 'cancel' }),
        expect.objectContaining({ text: 'Cancelar entrenamiento', style: 'destructive' }),
      ]),
    );
    expect(impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Medium);
    expect(onContinue).not.toHaveBeenCalled();

    const destructiveAction = alert.mock.calls[0][2][1];
    act(() => { destructiveAction.onPress(); });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });

  test('resumes normally after dismissing the cancellation prompt', () => {
    const { onContinue, tree } = renderCard();
    const continueButton = tree.root.find((node) => node.props.accessibilityLabel === 'Continuar entrenamiento');

    act(() => {
      continueButton.props.onPressIn();
      continueButton.props.onLongPress();
      continueButton.props.onPressOut();
      continueButton.props.onPress();
      alert.mock.calls[0][2][0].onPress();
      continueButton.props.onPress();
    });

    expect(onContinue).toHaveBeenCalledOnce();
  });
});
