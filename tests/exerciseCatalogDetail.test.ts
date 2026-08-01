import React from 'react';
import { beforeEach, describe, expect, test } from 'vitest';
import { findText, mockRouter, press, render, resetRuntimeHarness, setMockData, setMockParams } from './helpers/runtimeHarness';
import ExerciseDetailScreen from '../app/exercise/[id]';
import ExercisesScreen from '../app/(tabs)/exercises/index';

const catalogExercise = {
  id: 'EX-00001',
  name: 'Press de banca',
  variant: 'Barra olímpica',
  muscleGroups: ['MG-PECHO', 'MG-TRICEPS'],
  defaultSets: [],
  catalog: {
    movementPattern: 'Empuje horizontal',
    equipment: 'Barra olímpica',
    muscleParticipations: [
      { muscleGroupId: 'MG-PECHO', role: 'Principal' as const, relevance: 0.82, originalLabel: 'Pectoral mayor' },
      { muscleGroupId: 'MG-TRICEPS', role: 'Secundario' as const, relevance: 0.45, originalLabel: 'Tríceps' },
    ],
  },
};

const muscleGroups = [
  { id: 'MG-PECHO', displayName: 'Pecho', path: 'Tronco > Pecho', type: 'Grupo padre', visibleInFilters: true },
  { id: 'MG-TRICEPS', displayName: 'Tríceps', path: 'Brazos > Tríceps', type: 'Grupo padre', visibleInFilters: true },
];

describe('exercise catalog detail', () => {
  beforeEach(() => {
    resetRuntimeHarness();
    setMockData({ exercises: [catalogExercise], catalogMuscleGroups: muscleGroups, filterCatalogExercises: async () => [catalogExercise] });
  });

  test('opens an exercise detail from the read-only catalog list', () => {
    const tree = render(React.createElement(ExercisesScreen));
    const detailLink = tree.root.find((node: any) => node.props?.accessibilityLabel === 'Ver detalle de Press de banca');

    press(detailLink);

    expect(mockRouter.push).toHaveBeenCalledWith('/exercise/EX-00001');
    expect(findText(tree.root, 'Ver detalle')).toBeDefined();
  });

  test('renders role, relevance and muscle hierarchy in the detail view', () => {
    setMockParams({ id: 'EX-00001' });
    const tree = render(React.createElement(ExerciseDetailScreen));

    expect(findText(tree.root, 'Press de banca')).toBeDefined();
    expect(findText(tree.root, 'Principal')).toBeDefined();
    expect(findText(tree.root, 'Secundario')).toBeDefined();
    expect(findText(tree.root, '82%')).toBeDefined();
    expect(findText(tree.root, 'Tronco > Pecho')).toBeDefined();
  });
});
