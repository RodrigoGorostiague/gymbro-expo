import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, test, vi } from 'vitest';
import { LoginFormPanel } from '../components/login/LoginFormPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const theme = {
  primary: '#EF4444',
  accent: '#F97316',
  secondary: '#FBBF24',
  glass: 'rgba(0,0,0,0.5)',
  onPrimary: '#FFF',
} as any;

function panelProps(mode: 'signIn' | 'signUp' | 'forgotPassword', password: string) {
  return {
    brisas: theme,
    email: 'member@example.com',
    feedback: null,
    isSubmitting: false,
    mode,
    onEmailChange: vi.fn(),
    onModeChange: vi.fn(),
    onPasswordChange: vi.fn(),
    onSubmit: vi.fn(),
    password,
    rodaja: theme,
  };
}

function hasText(tree: TestRenderer.ReactTestRenderer, value: string) {
  return tree.root.findAll((node) => node.type as unknown === 'Text').some((node) => node.children.join('') === value);
}

function inputCount(tree: TestRenderer.ReactTestRenderer) {
  return tree.root.findAll((node) => node.type as unknown === 'TextInput').length;
}

describe('LoginFormPanel', () => {
  test('uses one password field for registration and exposes password requirements', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(LoginFormPanel, panelProps('signUp', 'StrongPass1')));
    });

    expect(inputCount(tree!)).toBe(2);
    expect(hasText(tree!, '✓ 8 o más caracteres')).toBe(true);
    expect(hasText(tree!, '✓ Un número')).toBe(true);
  });

  test('renders recovery as an email-only task', () => {
    let tree: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(React.createElement(LoginFormPanel, panelProps('forgotPassword', '')));
    });

    expect(inputCount(tree!)).toBe(1);
    expect(hasText(tree!, 'Enviar enlace de recuperación')).toBe(true);
  });
});
