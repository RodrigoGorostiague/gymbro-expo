import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const useData = vi.hoisted(() => vi.fn());

vi.mock('../context/DataContext', () => ({ useData }));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: { primary: '#000', text: '#000', textMuted: '#000', onPrimary: '#fff', glass: '#fff', glassBorder: '#fff' } }) }));
vi.mock('../components/GlassCard', () => ({ GlassCard: ({ children }: { children: React.ReactNode }) => React.createElement('GlassCard', null, children) }));
vi.mock('../components/HapticPressable', () => ({ HapticPressable: ({ children, ...props }: any) => React.createElement('HapticPressable', props, children) }));
vi.mock('../components/UI', () => ({ GlassButton: ({ title }: { title: string }) => React.createElement('GlassButton', { title }) }));

import { ExercisePicker } from '../components/ExercisePicker';

describe('ExercisePicker catalog mode', () => {
  beforeEach(() => vi.clearAllMocks());

  test('loads every visible canonical parent filter', async () => {
    const filterCatalogExercises = vi.fn(async () => []);
    useData.mockReturnValue({
      catalogMuscleGroups: [
        { id: 'chest', displayName: 'Chest', type: 'Grupo padre', visibleInFilters: true },
        { id: 'hidden', displayName: 'Hidden', type: 'Grupo padre', visibleInFilters: false },
        { id: 'legacy', displayName: 'Legacy', type: 'parent', visibleInFilters: true },
      ],
      filterCatalogExercises,
    });

    act(() => { TestRenderer.create(React.createElement(ExercisePicker, { exercises: [], routineMuscleGroups: [], catalogMode: true, visible: true, onClose: () => undefined, onSelect: () => undefined })); });
    await act(async () => {});

    expect(filterCatalogExercises).toHaveBeenCalledTimes(1);
    expect(filterCatalogExercises).toHaveBeenCalledWith('chest', 'all_roles');
  });

  test('does not load or update catalog state while the sheet is hidden', async () => {
    const filterCatalogExercises = vi.fn(async () => []);
    useData.mockReturnValue({ catalogMuscleGroups: [{ id: 'chest', displayName: 'Chest', type: 'Grupo padre', visibleInFilters: true }], filterCatalogExercises });
    act(() => { TestRenderer.create(React.createElement(ExercisePicker, { exercises: [], routineMuscleGroups: [], catalogMode: true, visible: false, onClose: () => undefined, onSelect: () => undefined })); });
    await act(async () => {});
    expect(filterCatalogExercises).not.toHaveBeenCalled();
  });

  test('does not reload catalog results when an unrelated routine-group reference changes', async () => {
    const filterCatalogExercises = vi.fn(async () => []);
    useData.mockReturnValue({ catalogMuscleGroups: [{ id: 'chest', displayName: 'Chest', type: 'Grupo padre', visibleInFilters: true }], filterCatalogExercises });
    const props = { exercises: [], catalogMode: true, visible: true, onClose: () => undefined, onSelect: () => undefined };
    let picker!: TestRenderer.ReactTestRenderer;

    act(() => { picker = TestRenderer.create(React.createElement(ExercisePicker, { ...props, routineMuscleGroups: [] })); });
    await act(async () => {});
    act(() => { picker.update(React.createElement(ExercisePicker, { ...props, routineMuscleGroups: [] })); });
    await act(async () => {});

    expect(filterCatalogExercises).toHaveBeenCalledTimes(1);
  });

  test('shows skeleton rows while catalog results are loading', () => {
    useData.mockReturnValue({ catalogMuscleGroups: [{ id: 'chest', displayName: 'Chest', type: 'Grupo padre', visibleInFilters: true }], filterCatalogExercises: vi.fn(() => new Promise(() => undefined)) });
    let picker!: TestRenderer.ReactTestRenderer;

    act(() => { picker = TestRenderer.create(React.createElement(ExercisePicker, { exercises: [], routineMuscleGroups: [], catalogMode: true, visible: true, onClose: () => undefined, onSelect: () => undefined })); });

    expect(picker.root.find((node) => node.props.accessibilityLabel === 'Cargando ejercicios')).toBeTruthy();
  });
});
