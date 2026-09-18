import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { expect, test, vi } from 'vitest';
import { GlassButton } from '../components/UI';
import { useDirtyExitGuard } from '../hooks/useDirtyExitGuard';
import { NavigationContext } from 'expo-router/react-navigation';
import { Alert } from 'react-native';
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#00EEAA', accent: '#00AADD', onPrimary: '#001111', text: '#FFFFFF', textMuted: '#AAAAAA', glassBorder: '#333333' }, isCombined: false, dualThemes: null }) }));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
test('shared busy button keeps its name, visible label, role and minimum geometry', () => {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(GlassButton, { title: 'Guardar', loading: true, onPress: vi.fn() })); });
  const button = tree.root.find((node) => String(node.type) === 'Pressable');
  expect(button.props.accessibilityRole).toBe('button');
  expect(button.props.accessibilityLabel).toBe('Guardar');
  expect(button.props.accessibilityState).toEqual({ disabled: true, busy: true });
  expect(tree.root.findAll((node) => String(node.type) === 'Text' && node.children.join('') === 'Guardar')).toHaveLength(1);
  act(() => tree.unmount());
});
function Guard({ dirty }: { dirty: boolean }) { useDirtyExitGuard(dirty); return null; }
test('dirty editor preserves the original navigation action until explicit discard', () => {
  let listener: any;
  const navigation = { addListener: vi.fn((_event, callback) => { listener = callback; return () => undefined; }), dispatch: vi.fn() };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => { tree = TestRenderer.create(React.createElement(NavigationContext.Provider, { value: navigation as any }, React.createElement(Guard, { dirty: true }))); });
  const event = { preventDefault: vi.fn(), data: { action: { type: 'GO_BACK' } } };
  act(() => listener(event));
  expect(event.preventDefault).toHaveBeenCalledOnce();
  expect(navigation.dispatch).not.toHaveBeenCalled();
  const actions = vi.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  act(() => actions?.find((action) => action.style === 'destructive')?.onPress?.());
  expect(navigation.dispatch).toHaveBeenCalledWith(event.data.action);
  act(() => tree.unmount());
});
