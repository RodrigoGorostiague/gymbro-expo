import React from 'react';
import { describe, expect, test } from 'vitest';
import { findTextsContaining, render } from './helpers/runtimeHarness';
import { JointWorkoutLiveRoster } from '../components/JointWorkoutLiveRoster';

describe('JointWorkoutLiveRoster', () => {
  test('shows participant state and aggregate progress only when expanded', () => {
    const roster = render(React.createElement(JointWorkoutLiveRoster, { expanded: true, onToggle: () => undefined, participants: [{ id: 'bro-1', alias: 'Cami', avatarId: 'capigirl', status: 'active', liveProgress: { state: 'resting', completedExercises: 2, totalExercises: 5, completedSets: 6, totalSets: 15, restEndsAt: new Date(Date.now() + 60_000).toISOString(), updatedAt: new Date().toISOString() } }] }));
    expect(findTextsContaining(roster.root, 'Cami')).toHaveLength(1);
    expect(findTextsContaining(roster.root, 'Ejercicios 2/5 · Series 6/15')).toHaveLength(1);
    expect(findTextsContaining(roster.root, 'Descanso')).toHaveLength(1);
  });
});
