import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION_MANIFEST,
  equippedPresentationSchema,
  catalogExerciseRpcRowSchema,
  catalogExerciseMatchRpcRowSchema,
  catalogExerciseMatchSchema,
  catalogExerciseSchema,
  catalogMuscleGroupRpcRowSchema,
  catalogMuscleGroupSchema,
  mesocycleCollectionSchema,
  publishPlanInputSchema,
  resolvePresentationManifest,
  resolveCosmeticPresentation,
  routineCollectionSchema,
  createMesocycleSchema,
  createRoutineSchema,
  saveRoutinesResultSchema,
  usableMesocycleSchema,
  usableRoutineSchema,
  validateMesocycleRoutineReferences,
} from './index.js';

const routine = {
  id: 'routine-1', name: 'Upper', muscleGroups: ['chest'], createdAt: '2026-09-05T20:00:00Z',
  exercises: [{ id: 'exercise-1', name: 'Press', muscleGroups: ['chest'], variant: 'barbell', sets: [{ id: 'set-1', tipo: 1, weight: 80, reps: 8 }] }],
};

const mesocycle = {
  id: 'meso-1', name: 'Strength', goal: 'Build strength', status: 'draft' as const, durationWeeks: 1,
  createdAt: '2026-09-05T20:00:00Z',
  weeks: [{ id: 'week-1', weekNumber: 1, entries: [{ id: 'session-1', ref: { routineId: routine.id, routineName: routine.name, source: 'local' as const }, order: 1 }] }],
};

describe('RPC boundary schemas', () => {
  it('keeps RPC envelopes strict while canonical reads preserve mobile fields losslessly', () => {
    expect(routineCollectionSchema.safeParse({ revision: 0, items: [routine], ownerId: 'leak' }).success).toBe(false);
    expect(publishPlanInputSchema.safeParse({ kind: 'routine', sourceVersionId: 'version-1', visibility: 'circle', copyAllowed: true, shopPrice: 10 }).success).toBe(false);

    const mobileRoutine = {
      id: 'routine-mobile', name: 'Mobile exact', muscleGroups: [], exercises: [], createdAt: 'legacy-date',
      mobileExtension: { retained: true },
    };
    const parsed = routineCollectionSchema.parse({ revision: 2, items: [mobileRoutine] });
    expect(JSON.parse(JSON.stringify(parsed.items[0]))).toEqual(mobileRoutine);
    expect(usableRoutineSchema.safeParse(mobileRoutine).success).toBe(false);
  });

  it('round-trips representative heterogeneous mobile prescriptions without mutation', () => {
    const richRoutine = {
      id: 'routine-rich', version: 3, versionOf: 'routine-root', previousVersionId: 'routine-v2', name: 'Mixed',
      muscleGroups: ['GM-101', 'GM-202'], createdAt: '2026-09-05T20:00:00Z', isShared: true, shareId: 'share-1',
      exercises: [
        {
          id: 'exercise-catalog', catalogExerciseId: 'EX-0001', definitionId: 'EX-0001', name: 'Press',
          muscleGroups: ['GM-101'], variant: 'Barra', loadMode: 'external-load', loadUnit: 'kg',
          definitionSnapshot: { id: 'EX-0001', name: 'Press snapshot', muscleGroups: ['GM-101'], loadMode: 'external-load', loadUnit: 'kg', variant: 'Barra', snapshotRevision: 7 },
          attribution: { primary: 'GM-101', secondary: ['GM-112'], weights: { 'GM-101': 1, 'GM-112': 0.45 } },
          catalog: { movementPattern: 'Empuje horizontal', equipment: 'Barra', muscleParticipations: [{ muscleGroupId: 'GM-101', role: 'Principal', relevance: 1, originalLabel: 'Pectoral mayor', sourceOrigin: 'Directa' }] },
          sets: [
            { id: 'set-c', tipo: 'C', weight: 20, reps: 10, effortTarget: { kind: 'rir', value: 3 } },
            { id: 'set-f', tipo: 'F', weight: 80, reps: 6, effortTarget: { kind: 'rpe', value: 9 } },
            { id: 'set-2', tipo: 2, weight: 70, reps: 8, backoffGroupId: 'backoff-1' },
          ],
          mobileMetadata: { retained: 'yes' },
        },
        { id: 'exercise-empty', name: 'Plank', muscleGroups: [], variant: 'Bodyweight', loadMode: 'bodyweight', loadUnit: 'kg', sets: [] },
      ],
    };
    const richMesocycle = {
      id: 'meso-rich', name: 'Historical', goal: '', status: 'archived', durationWeeks: 1, createdAt: 'legacy-date',
      weeks: [{ id: 'week-1', weekNumber: 1, weekMetadata: 'retained', entries: [
        { id: 'session-1', ref: { routineId: richRoutine.id, routineName: richRoutine.name, source: 'shared', shareId: 'share-1' }, routineSnapshot: richRoutine, order: 1, note: 'Exact snapshot', entryMetadata: 42 },
        { id: 'rest-1', kind: 'rest', reason: 'recovery' },
      ] }],
      historicalMetadata: { retained: true },
    };
    const routines = routineCollectionSchema.parse({ revision: 7, items: [richRoutine] });
    const mesocycles = mesocycleCollectionSchema.parse({ revision: 8, items: [richMesocycle] });
    expect(JSON.parse(JSON.stringify(routines.items[0]))).toEqual(richRoutine);
    expect(JSON.parse(JSON.stringify(mesocycles.items[0]))).toEqual(richMesocycle);
    expect(usableRoutineSchema.safeParse(richRoutine).success).toBe(false);
    expect(usableMesocycleSchema.safeParse(richMesocycle).success).toBe(false);
  });

  it('keeps routine and mesocycle revisions independent and returns conflict state', () => {
    expect(routineCollectionSchema.parse({ revision: 4, items: [routine] }).revision).toBe(4);
    expect(mesocycleCollectionSchema.parse({ revision: 9, items: [mesocycle] }).revision).toBe(9);
    const conflict = saveRoutinesResultSchema.parse({ status: 'conflict', current: { revision: 5, items: [routine] } });
    expect(conflict.status).toBe('conflict');
    expect('current' in conflict && conflict.current.revision).toBe(5);
  });

  it('enforces mesocycle duration, unique identities, and owned routine references', () => {
    expect(usableMesocycleSchema.safeParse({ ...mesocycle, durationWeeks: 53 }).success).toBe(false);
    expect(validateMesocycleRoutineReferences(mesocycle, new Set([routine.id]))).toBe(true);
    expect(validateMesocycleRoutineReferences(mesocycle, new Set())).toBe(false);
  });

  it('separates tolerant reads, usable records, and valid new content', () => {
    expect(usableRoutineSchema.safeParse(routine).success).toBe(true);
    expect(createRoutineSchema.safeParse(routine).success).toBe(true);
    expect(createRoutineSchema.safeParse({ ...routine, version: 2, previousVersionId: 'routine-v1' }).success).toBe(false);
    expect(usableMesocycleSchema.safeParse(mesocycle).success).toBe(true);
    expect(createMesocycleSchema.safeParse(mesocycle).success).toBe(true);
    expect(createMesocycleSchema.safeParse({ ...mesocycle, status: 'archived' }).success).toBe(false);
    expect(createMesocycleSchema.safeParse({ ...mesocycle, status: 'scheduled' }).success).toBe(false);
    expect(createMesocycleSchema.safeParse({ ...mesocycle, status: 'scheduled', startDate: '2026-09-07' }).success).toBe(true);
  });
});

describe('catalog contracts', () => {
  it('strictly parses snake_case RPC rows and camelCase domain DTOs', () => {
    const exerciseRow = { exercise_id: 'EX-0001', canonical_name: 'Press', movement_pattern: 'Push', equipment: 'Barbell', muscle_group_ids: ['GM-101'], primary_muscle_group_ids: ['GM-101'], muscle_participations: [{ muscle_group_id: 'GM-101', role: 'Principal', relevance: 1, original_label: 'Pectoral' }] };
    const exercise = { id: 'EX-0001', canonicalName: 'Press', movementPattern: 'Push', equipment: 'Barbell', muscleGroupIds: ['GM-101'], primaryMuscleGroupIds: null, muscleParticipations: [{ muscleGroupId: 'GM-101', role: 'Principal', relevance: 1, originalLabel: 'Pectoral' }] };
    const matchRow = { exercise_id: 'EX-0001', canonical_name: 'Press', movement_pattern: 'Push', equipment: 'Barbell', matched_muscle_group_id: 'GM-101', matched_muscle_name: 'Pectoral', selected_parent_id: 'GM-100', role: 'Principal', relevance: 1, path: 'Body > Chest' };
    const match = { exerciseId: 'EX-0001', canonicalName: 'Press', movementPattern: 'Push', equipment: 'Barbell', matchedMuscleGroupId: 'GM-101', matchedMuscleName: 'Pectoral', selectedParentId: 'GM-100', role: 'Principal', relevance: 1, path: 'Body > Chest' };
    const groupRow = { id: 'GM-101', name: 'Pectoral', type: 'Muscle', level: 3, visible_in_filters: true, display_name: 'Pectoral', path: 'Body > Chest', parent_group_ids: ['GM-100'] };
    const group = { id: 'GM-101', name: 'Pectoral', type: 'Muscle', level: 3, visibleInFilters: true, displayName: 'Pectoral', path: 'Body > Chest', parentGroupIds: ['GM-100'] };
    expect(catalogExerciseRpcRowSchema.parse(exerciseRow)).toEqual(exerciseRow);
    expect(catalogExerciseSchema.parse(exercise)).toEqual(exercise);
    expect(catalogExerciseMatchRpcRowSchema.parse(matchRow)).toEqual(matchRow);
    expect(catalogExerciseMatchSchema.parse(match)).toEqual(match);
    expect(catalogMuscleGroupRpcRowSchema.parse(groupRow)).toEqual(groupRow);
    expect(catalogMuscleGroupSchema.parse(group)).toEqual(group);
    expect(catalogExerciseRpcRowSchema.safeParse({ ...exerciseRow, owner_id: 'leak' }).success).toBe(false);
  });
});

describe('presentation manifests', () => {
  it('resolves supported manifests and deterministically falls back for unknown values', () => {
    expect(resolvePresentationManifest('profile-brisas').id).toBe('profile-brisas');
    expect(resolvePresentationManifest('retired-theme')).toBe(DEFAULT_PRESENTATION_MANIFEST);
    expect(resolvePresentationManifest(null)).toBe(DEFAULT_PRESENTATION_MANIFEST);
  });

  it('falls back when a registered manifest is incomplete', () => {
    expect(resolvePresentationManifest('broken', { broken: { id: 'broken' } })).toBe(DEFAULT_PRESENTATION_MANIFEST);
  });

  it('maps equipped cosmetics without inventory or commerce fields', () => {
    expect(equippedPresentationSchema.parse({ avatarId: 'capigirl', frameId: 'alfa', titleId: 'gymbro', themeId: 'moon' })).not.toHaveProperty('price');
    expect(resolveCosmeticPresentation('avatar', 'capigirl')?.asset).toBe('/presentation/avatar.svg');
    expect(resolveCosmeticPresentation('avatar', 'retired')?.id).toBe('capybara-athlete');
    expect(resolveCosmeticPresentation('frame', 'retired')).toBeNull();
  });
});
