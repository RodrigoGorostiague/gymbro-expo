import React from 'react';
import { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { findButton, findText, mockRouter, press, render, resetRuntimeHarness, setMockData } from './helpers/runtimeHarness';

vi.mock('../components/LogoutButton', () => ({ LogoutButton: () => null }));

import TrainEntryScreen from '../app/(tabs)/train';

describe('Train entry ownership', () => {
  beforeEach(() => resetRuntimeHarness());

  test('renders mesocycles when routines exist without navigating away from Train', () => {
    setMockData({ dataState: 'ready', routines: [{ id: 'routine-1' }], mesocycles: [] });
    const tree = render(React.createElement(TrainEntryScreen));

    expect(findText(tree.root, 'Mesociclos')).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('renders routines for a first-time athlete without navigating away from Train', () => {
    setMockData({ dataState: 'ready', routines: [] });
    const tree = render(React.createElement(TrainEntryScreen));

    expect(findText(tree.root, 'Biblioteca de rutinas')).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('keeps the loading screen until the data lifecycle is ready', () => {
    setMockData({ dataState: 'loading', routines: [] });
    const tree = render(React.createElement(TrainEntryScreen));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();

    setMockData({ dataState: 'ready', routines: [{ id: 'routine-1' }], mesocycles: [] });
    act(() => { tree.update(React.createElement(TrainEntryScreen)); });
    expect(findText(tree.root, 'Mesociclos')).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('shows a recoverable error instead of leaving a failed load on the preparation screen', () => {
    const retryData = vi.fn();
    setMockData({ dataState: 'error', dataError: 'No se pudo abrir la biblioteca.', retryData, routines: [] });
    const tree = render(React.createElement(TrainEntryScreen));

    expect(findText(tree.root, 'No se pudo abrir la biblioteca.')).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    press(findButton(tree.root, 'Reintentar'));
    expect(retryData).toHaveBeenCalledOnce();
  });
});
