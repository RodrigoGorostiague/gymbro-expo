import React from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { vi } from 'vitest';
import { __blurFocus, __setParams, router as expoRouter } from './expoRouterStub';
import { Alert as nativeAlert, __resetAppState } from './reactNativeStub';

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const createHost = (name: string) => {
  const Component = ({ children, ...props }: any) => React.createElement(name, props, children);
  Component.displayName = name;
  return Component;
};

export const mockAlert = {
  alert: nativeAlert.alert,
};

export const mockRouter = expoRouter;

const baseTheme = {
  primary: '#7C3AED',
  accent: '#A855F7',
  secondary: '#22D3EE',
  text: '#FFFFFF',
  textMuted: '#94A3B8',
  onPrimary: '#111827',
  glass: 'rgba(255,255,255,0.08)',
  glassBorder: 'rgba(255,255,255,0.2)',
  blurTint: 'dark',
  background: ['#020617', '#111827'],
} as const;

let currentTheme = baseTheme;
let currentData: Record<string, unknown> = {};

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: createHost('SafeAreaView'),
}));

function themeContextMock() {
  return {
  useTheme: () => ({
    theme: currentTheme,
    dualThemes: null,
    isCombined: false,
    isShopTheme: false,
    isPreview: false,
  }),
  };
}

function dataContextMock() {
  return {
  useData: () => currentData,
  };
}

function authContextMock() {
  return {
    useAuth: () => ({ user: 'rodaja' }),
  };
}

function appNavBarMock() {
  return {
  AppNavBar: ({ backLabel = '← Volver', onBack, trailing }: any) => React.createElement(
    'AppNavBar',
    { backLabel, onBack },
    React.createElement('Text', null, backLabel),
    trailing,
  ),
  };
}

function appScreenHeaderMock() {
  return {
  AppScreenHeader: ({ title, subtitle, trailing }: any) => React.createElement(
    'AppScreenHeader',
    { title, subtitle },
    React.createElement('Text', null, title),
    subtitle ? React.createElement('Text', null, subtitle) : null,
    trailing,
  ),
  };
}

function exercisePickerMock() {
  return {
  ExercisePicker: ({ visible }: any) => React.createElement('ExercisePicker', { visible }),
  };
}

function muscleGroupSelectorMock() {
  return {
  MuscleGroupSelector: ({ value }: any) => React.createElement('MuscleGroupSelector', { value }),
  };
}

function glassCardMock() {
  return {
  GlassCard: ({ children, ...props }: any) => React.createElement('GlassCard', props, children),
  ThemeBackground: ({ children }: any) => React.createElement('ThemeBackground', null, children),
  };
}

function hapticPressableMock() {
  return {
  HapticPressable: ({ children, ...props }: any) => React.createElement('HapticPressable', props, children),
  };
}

vi.mock('@expo/ui/community/datetime-picker', () => ({
  default: ({ children, ...props }: any) => React.createElement('MockDateTimePicker', props, children),
}));

function uiMock() {
  return {
  GlassButton: ({ title, ...props }: any) => React.createElement(
    'GlassButton',
    { title, ...props },
    React.createElement('Text', null, title),
  ),
  GlassInput: ({ children, ...props }: any) => React.createElement('GlassInput', props, children),
  SectionTitle: ({ title, subtitle }: any) => React.createElement(
    'SectionTitle',
    { title, subtitle },
    React.createElement('Text', null, title),
    subtitle ? React.createElement('Text', null, subtitle) : null,
  ),
  };
}

vi.mock('../../context/ThemeContext', themeContextMock);
vi.mock('../../../context/ThemeContext', themeContextMock);
vi.mock('../../context/DataContext', dataContextMock);
vi.mock('../../../context/DataContext', dataContextMock);
vi.mock('../../context/AuthContext', authContextMock);
vi.mock('../../../context/AuthContext', authContextMock);
vi.mock('../../components/AppNavBar', appNavBarMock);
vi.mock('../../../components/AppNavBar', appNavBarMock);
vi.mock('../../components/AppScreenHeader', appScreenHeaderMock);
vi.mock('../../../components/AppScreenHeader', appScreenHeaderMock);
vi.mock('../../components/ExercisePicker', exercisePickerMock);
vi.mock('../../../components/ExercisePicker', exercisePickerMock);
vi.mock('../../components/MuscleGroupSelector', muscleGroupSelectorMock);
vi.mock('../../../components/MuscleGroupSelector', muscleGroupSelectorMock);
vi.mock('../../components/GlassCard', glassCardMock);
vi.mock('../../../components/GlassCard', glassCardMock);
vi.mock('../../components/HapticPressable', hapticPressableMock);
vi.mock('../../../components/HapticPressable', hapticPressableMock);
vi.mock('../../components/UI', uiMock);
vi.mock('../../../components/UI', uiMock);

export function resetRuntimeHarness() {
  __blurFocus();
  __resetAppState();
  __setParams({});
  currentTheme = baseTheme;
  currentData = {};
  mockAlert.alert.mockReset();
  mockRouter.push.mockReset();
  mockRouter.replace.mockReset();
  mockRouter.back.mockReset();
  mockRouter.dismissTo.mockReset();
  mockRouter.setParams.mockReset();
}

export function setMockParams(params: Record<string, unknown>) {
  __setParams(params);
}

export function setMockData(data: Record<string, unknown>) {
  currentData = data;
}

export function render(element: React.ReactElement): ReactTestRenderer {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
}

export function press(instance: ReactTestInstance) {
  act(() => {
    instance.props.onPress?.();
  });
}

export function changeText(instance: ReactTestInstance, value: string) {
  act(() => {
    instance.props.onChangeText?.(value);
  });
}

export function findText(root: ReactTestInstance, text: string): ReactTestInstance | undefined {
  return root.findAll(
    (node) => (node.type as any) === 'Text' && node.children.join('') === text,
  )[0];
}

export function findTextsContaining(root: ReactTestInstance, text: string): ReactTestInstance[] {
  return root.findAll(
    (node) => (node.type as any) === 'Text' && node.children.join('').includes(text),
  );
}

export function findButton(root: ReactTestInstance, title: string): ReactTestInstance {
  return root.find(
    (node) => (node.type as any) === 'GlassButton' && node.props.title === title,
  );
}

export function findButtons(root: ReactTestInstance, title: string): ReactTestInstance[] {
  return root.findAll(
    (node) => (node.type as any) === 'GlassButton' && node.props.title === title,
  );
}

export function findInputs(root: ReactTestInstance, predicate: (node: ReactTestInstance) => boolean) {
  return root.findAll((node) => (node.type as any) === 'GlassInput' && predicate(node));
}
